/**
 * @file settlement.ts
 * @description GridSlot Settlement State Machine — manages the full lifecycle of a trade
 * from payment capture through physical delivery confirmation to final fund release.
 *
 * OVERVIEW
 * --------
 * Every matched trade on GridSlot goes through a structured settlement pipeline.
 * This file implements that pipeline as a finite state machine (FSM) — a design pattern
 * where an entity (the Settlement record) can only move between states in predefined,
 * validated ways. Invalid transitions throw immediately; no silent failures are possible.
 *
 * STATE DIAGRAM
 * -------------
 *
 *   [MATCHED] ──auto──▶ [PAYMENT_HELD] ──auto──▶ [DELIVERY_PENDING]
 *                                                        │
 *                                           ┌───────────┴───────────┐
 *                                      seller confirms         window expires
 *                                           │                       │
 *                                           ▼                       ▼
 *                                     [CONFIRMED]           [NON_DELIVERY]
 *                                           │                       │
 *                                      grace period            auto forfeit
 *                                           │                       │
 *                                           ▼                       ▼
 *                                      [SETTLED]             [REFUNDED]
 *                                      (terminal)            (terminal)
 *
 * DELIVERY SCORE FORMULA
 * ----------------------
 * - No score changes until a seller has at least MINIMUM_TRADES completed trades
 * - After that, score = settled / last ROLLING_WINDOW completed trades
 * - This prevents one early miss from permanently damaging a seller's reputation
 * - Completed trades = SETTLED or CANCELLED (i.e. trades with a final outcome)
 *
 * FINANCIAL INVARIANTS
 * --------------------
 * - Collateral forfeiture on non-delivery = 5% of trade total_value_cents (Math.ceil)
 * - Buyer refund on non-delivery = 100% of trade total_value_cents
 * - Seller delivery_score is recalculated on SETTLED and REFUNDED using a rolling window
 * - All monetary values are integers in EUR cents — no floats anywhere
 * - Every transition writes an AuditLog entry in the same DB transaction
 * - Terminal states (SETTLED, REFUNDED) have no valid outgoing transitions
 *
 * BACKGROUND PROCESSING
 * ---------------------
 * Two transitions are triggered automatically by the background checker (runSettlementChecks):
 *   - DELIVERY_PENDING → NON_DELIVERY: when delivery_window_closes_at has passed
 *   - CONFIRMED → SETTLED: after a 1-hour grace period post-confirmation
 * All other transitions are triggered by explicit API calls.
 */

import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { InvalidStateTransitionError } from '../middleware/errorHandler';
import type { SettlementStatus } from '@prisma/client';

// ─── Delivery score config ────────────────────────────────────────────────────

/**
 * Minimum number of completed trades before delivery score is calculated.
 * Below this threshold the score is left untouched (stays at default 1.0).
 * Prevents one early miss from permanently damaging a new seller's reputation.
 */
const MINIMUM_TRADES = 5;

/**
 * Number of most recent completed trades to consider when calculating score.
 * Older trades beyond this window are ignored — recent behaviour matters most.
 */
const ROLLING_WINDOW = 20;

/**
 * Recalculates and updates a seller's delivery score based on their last
 * ROLLING_WINDOW completed trades. Only runs if they have at least MINIMUM_TRADES.
 *
 * Completed trades are those with a terminal status (SETTLED or CANCELLED).
 * Trades still in progress are excluded from the calculation entirely.
 *
 * Must be called inside an existing Prisma transaction.
 *
 * @param tx - Active Prisma transaction client
 * @param sellerId - Company ID of the seller to recalculate
 * @returns The new score rounded to 3 decimal places, or null if below minimum threshold
 */
async function recalculateDeliveryScore(
  tx: Prisma.TransactionClient,
  sellerId: string
): Promise<number | null> {
  const recentTrades = await tx.trade.findMany({
    where: {
      seller_id: sellerId,
      status: { in: ['SETTLED', 'CANCELLED'] },
    },
    orderBy: { matched_at: 'desc' },
    take: ROLLING_WINDOW,
  });

  // Not enough history yet — leave score unchanged
  if (recentTrades.length < MINIMUM_TRADES) return null;

  const settledCount = recentTrades.filter(t => t.status === 'SETTLED').length;

  // Score = fraction of recent completed trades that were successfully delivered
  // Rounded to 3 decimal places (e.g. 0.933 = 93.3%)
  const newScore = Math.round((settledCount / recentTrades.length) * 1000) / 1000;

  await tx.company.update({
    where: { id: sellerId },
    data: { delivery_score: newScore },
  });

  return newScore;
}

// ─── Transition map ───────────────────────────────────────────────────────────

/**
 * Exhaustive map of every valid state transition in the settlement pipeline.
 * Any transition not listed here will throw an InvalidStateTransitionError.
 * Terminal states (SETTLED, REFUNDED) have empty arrays — no exits possible.
 */
const VALID_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  MATCHED:          ['PAYMENT_HELD'],
  PAYMENT_HELD:     ['DELIVERY_PENDING'],
  DELIVERY_PENDING: ['CONFIRMED', 'NON_DELIVERY'],
  CONFIRMED:        ['SETTLED'],
  SETTLED:          [],   // terminal — funds released, trade complete
  NON_DELIVERY:     ['REFUNDED'],
  REFUNDED:         [],   // terminal — buyer refunded, seller penalised
};

/**
 * Guards every state transition.
 * Throws InvalidStateTransitionError if the transition is not in the allowed map.
 * This is the single enforcement point — all transition functions call this first.
 *
 * @param from - Current settlement status
 * @param to - Requested next status
 * @throws {InvalidStateTransitionError} If the transition is not allowed
 */
function assertValidTransition(from: SettlementStatus, to: SettlementStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

// ─── Transition: MATCHED → PAYMENT_HELD ──────────────────────────────────────

/**
 * Transitions a settlement from MATCHED to PAYMENT_HELD.
 *
 * This transition represents the moment buyer funds are captured (simulated in MVP;
 * real SEPA payment integration planned for v2). It is called automatically by the
 * matching engine immediately after a trade is created.
 *
 * In production this would trigger a payment provider API call to hold the buyer's
 * funds before the settlement record is updated.
 *
 * @param settlementId - The settlement to transition
 * @throws {InvalidStateTransitionError} If not currently in MATCHED state
 */
export async function transitionToPaymentHeld(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'PAYMENT_HELD');

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'PAYMENT_HELD' },
    });

    // Compliance record — captures the trade value at the moment funds were held
    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_PAYMENT_HELD',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'PAYMENT_HELD',
          trade_id: settlement.trade_id,
          total_value_cents: settlement.trade.total_value_cents,
        },
      },
    });
  });
}

// ─── Transition: PAYMENT_HELD → DELIVERY_PENDING ─────────────────────────────

/**
 * Transitions a settlement from PAYMENT_HELD to DELIVERY_PENDING.
 *
 * Opens the delivery confirmation window, during which the seller must call
 * transitionToConfirmed() to confirm physical capacity delivery. If the window
 * closes without confirmation, the background checker triggers NON_DELIVERY.
 *
 * The window duration is configured via SETTLEMENT_DELIVERY_WINDOW_HOURS (default: 4h).
 *
 * @param settlementId - The settlement to transition
 * @throws {InvalidStateTransitionError} If not currently in PAYMENT_HELD state
 */
export async function transitionToDeliveryPending(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'DELIVERY_PENDING');

  // Calculate the delivery window boundaries
  const deliveryWindowHours = parseInt(
    process.env.SETTLEMENT_DELIVERY_WINDOW_HOURS ?? '4',
    10
  );
  const now = new Date();
  const closes = new Date(now.getTime() + deliveryWindowHours * 60 * 60 * 1000);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: {
        status: 'DELIVERY_PENDING',
        delivery_window_opens_at: now,
        delivery_window_closes_at: closes,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_DELIVERY_PENDING',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'DELIVERY_PENDING',
          delivery_window_closes_at: closes.toISOString(),
        },
      },
    });
  });
}

// ─── Transition: DELIVERY_PENDING → CONFIRMED ────────────────────────────────

/**
 * Transitions a settlement from DELIVERY_PENDING to CONFIRMED.
 *
 * Called when the seller explicitly confirms that they have delivered the
 * contracted grid capacity. This is triggered by the seller via the
 * POST /api/settlements/:id/confirm-delivery endpoint.
 *
 * In a production system, this confirmation would be validated against
 * real-time telemetry data from the grid operator (TenneT/Liander/Stedin).
 * In the MVP, the seller's attestation is accepted at face value.
 *
 * After confirmation, a 1-hour grace period begins before automatic settlement.
 *
 * @param settlementId - The settlement to confirm
 * @param actorCompanyId - The company ID of the seller confirming delivery
 * @throws {InvalidStateTransitionError} If not currently in DELIVERY_PENDING state
 */
export async function transitionToConfirmed(
  settlementId: string,
  actorCompanyId: string
): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'CONFIRMED');

  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: {
        status: 'CONFIRMED',
        delivery_confirmed_at: now,
      },
    });

    // Record the actor (seller) in the audit log — important for dispute resolution
    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_CONFIRMED',
        company_id: actorCompanyId,
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'CONFIRMED',
          confirmed_at: now.toISOString(),
        },
      },
    });
  });
}

// ─── Transition: CONFIRMED → SETTLED ─────────────────────────────────────────

/**
 * Transitions a settlement from CONFIRMED to SETTLED (terminal success state).
 *
 * This is the happy-path terminal state. On settlement:
 *   1. The settlement and trade records are marked SETTLED
 *   2. The seller's delivery_score is recalculated using a rolling window
 *      (only if they have reached the MINIMUM_TRADES threshold)
 *   3. In production, escrowed funds would be released to the seller here
 *
 * This transition is triggered automatically by runSettlementChecks() after
 * a 1-hour grace period following confirmation (not called directly by the API).
 *
 * DELIVERY SCORE FORMULA
 * ----------------------
 * score = settled trades / last ROLLING_WINDOW completed trades
 * Only calculated once MINIMUM_TRADES completed trades exist.
 * Stored as a float rounded to 3 decimal places (e.g. 0.933 = 93.3%).
 * Visible to all marketplace participants to assess seller reliability.
 *
 * @param settlementId - The settlement to finalise
 * @throws {InvalidStateTransitionError} If not currently in CONFIRMED state
 */
export async function transitionToSettled(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: { include: { seller: true } } },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'SETTLED');

  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: { status: 'SETTLED', settled_at: now },
    });

    await tx.trade.update({
      where: { id: settlement.trade_id },
      data: { status: 'SETTLED' },
    });

    // Recalculate delivery score using rolling window.
    // Returns null if seller hasn't reached MINIMUM_TRADES yet — score stays at 1.0.
    const sellerId = settlement.trade.seller.id;
    const newScore = await recalculateDeliveryScore(tx, sellerId);

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_SETTLED',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'SETTLED',
          settled_at: now.toISOString(),
          total_value_cents: settlement.trade.total_value_cents,
          seller_new_delivery_score: newScore ?? 'pending_minimum_trades',
        },
      },
    });
  });
}

// ─── Transition: DELIVERY_PENDING → NON_DELIVERY ─────────────────────────────

/**
 * Transitions a settlement from DELIVERY_PENDING to NON_DELIVERY.
 *
 * Triggered automatically by runSettlementChecks() when the delivery window
 * has closed without seller confirmation. Represents a failed delivery.
 *
 * COLLATERAL FORFEITURE
 * ---------------------
 * The seller forfeits 5% of the trade total value from their held collateral.
 * Math.ceil is used to ensure the forfeit is never rounded down in the seller's favour.
 * Example: trade value = €8,000 → forfeit = €400 (5% of 800,000 cents = 40,000 cents)
 *
 * Note: The actual buyer refund is processed in the subsequent REFUNDED transition.
 *
 * @param settlementId - The settlement to mark as non-delivery
 * @throws {InvalidStateTransitionError} If not currently in DELIVERY_PENDING state
 */
export async function transitionToNonDelivery(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'NON_DELIVERY');

  // 5% of total trade value, rounded up (never in seller's favour)
  const forfeit = Math.ceil(settlement.trade.total_value_cents * 0.05);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: {
        status: 'NON_DELIVERY',
        collateral_forfeited_cents: forfeit,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_NON_DELIVERY',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'NON_DELIVERY',
          collateral_forfeited_cents: forfeit,
          trade_total_value_cents: settlement.trade.total_value_cents,
          forfeit_rate: 0.05,
        },
      },
    });
  });
}

// ─── Transition: NON_DELIVERY → REFUNDED ─────────────────────────────────────

/**
 * Transitions a settlement from NON_DELIVERY to REFUNDED (terminal failure state).
 *
 * Finalises the non-delivery outcome:
 *   1. The full trade value is recorded as the buyer's refund amount
 *   2. The trade is marked CANCELLED
 *   3. The seller's delivery_score is recalculated using a rolling window
 *      (only if they have reached the MINIMUM_TRADES threshold)
 *   4. In production, funds would be returned to the buyer's account here
 *
 * The collateral_forfeited_cents was already set in transitionToNonDelivery().
 * This function only needs to handle the refund and score penalty side.
 *
 * @param settlementId - The settlement to refund
 * @throws {InvalidStateTransitionError} If not currently in NON_DELIVERY state
 */
export async function transitionToRefunded(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: { include: { seller: true } } },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'REFUNDED');

  // Buyer receives 100% of what they paid — non-delivery is fully the seller's fault
  const refundAmount = settlement.trade.total_value_cents;
  const now = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.settlement.update({
      where: { id: settlementId },
      data: {
        status: 'REFUNDED',
        buyer_refund_cents: refundAmount,
        settled_at: now,
      },
    });

    await tx.trade.update({
      where: { id: settlement.trade_id },
      data: { status: 'CANCELLED' },
    });

    // Recalculate delivery score using rolling window.
    // This trade is now CANCELLED so it counts against the seller in the window.
    // Returns null if seller hasn't reached MINIMUM_TRADES yet — score stays at 1.0.
    const sellerId = settlement.trade.seller.id;
    const newScore = await recalculateDeliveryScore(tx, sellerId);

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_REFUNDED',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'REFUNDED',
          buyer_refund_cents: refundAmount,
          collateral_forfeited_cents: settlement.collateral_forfeited_cents,
          seller_new_delivery_score: newScore ?? 'pending_minimum_trades',
        },
      },
    });
  });
}

// ─── Background settlement checker ───────────────────────────────────────────

/**
 * Summary returned by runSettlementChecks.
 */
export interface SettlementCheckResult {
  /** Total settlements inspected this run. */
  processed: number;
  /** Settlements that missed their delivery window and were refunded. */
  expired_to_non_delivery: number;
  /** Settlements that were confirmed and are now fully settled. */
  confirmed_to_settled: number;
}

/**
 * Scans all in-progress settlements and advances any that are ready to move.
 *
 * Two automatic progressions are checked on each run:
 *
 *   1. DELIVERY_PENDING with an expired window → NON_DELIVERY → REFUNDED
 *      Triggered when delivery_window_closes_at < now.
 *      The two transitions (NON_DELIVERY then REFUNDED) are called sequentially
 *      so each gets its own audit log entry.
 *
 *   2. CONFIRMED past the grace period → SETTLED
 *      Triggered when delivery_confirmed_at < (now - 1 hour).
 *      The grace period allows for last-minute disputes before funds are released.
 *
 * Errors on individual settlements are caught and logged — one failed settlement
 * must never block others from being processed.
 *
 * This function is called every 1 minute by startSettlementChecker().
 *
 * @param emitEvent - Optional WebSocket emitter for real-time client notifications
 * @returns A summary of what was processed
 */
export async function runSettlementChecks(
  emitEvent?: (event: string, payload: unknown) => void
): Promise<SettlementCheckResult> {
  const now = new Date();
  let expiredCount = 0;
  let settledCount = 0;

  // ── Check 1: Expired delivery windows ──────────────────────────────────────

  const expired = await prisma.settlement.findMany({
    where: {
      status: 'DELIVERY_PENDING',
      delivery_window_closes_at: { lt: now },  // window has closed
    },
  });

  for (const s of expired) {
    try {
      // Two sequential transitions: pending → non-delivery → refunded
      await transitionToNonDelivery(s.id);
      await transitionToRefunded(s.id);
      expiredCount++;

      // Notify both parties via WebSocket
      emitEvent?.('settlement:update', {
        settlement_id: s.id,
        new_status: 'REFUNDED',
      });
    } catch (err) {
      // Log but continue — a failure here must not block other settlements
      console.error(`[Settlement] Failed to process expired settlement ${s.id}:`, err);
    }
  }

  // ── Check 2: Confirmed settlements past grace period ───────────────────────

  const graceMs = 60 * 60 * 1000; // 1 hour in milliseconds

  const readyToSettle = await prisma.settlement.findMany({
    where: {
      status: 'CONFIRMED',
      // Only settle if confirmation happened more than 1h ago
      delivery_confirmed_at: { lt: new Date(now.getTime() - graceMs) },
    },
  });

  for (const s of readyToSettle) {
    try {
      await transitionToSettled(s.id);
      settledCount++;

      emitEvent?.('settlement:update', {
        settlement_id: s.id,
        new_status: 'SETTLED',
      });
    } catch (err) {
      console.error(`[Settlement] Failed to settle ${s.id}:`, err);
    }
  }

  return {
    processed: expired.length + readyToSettle.length,
    expired_to_non_delivery: expiredCount,
    confirmed_to_settled: settledCount,
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Starts the settlement background checker on a 1-minute interval.
 *
 * In production this would be a dedicated cron job or queue worker (e.g. BullMQ)
 * to decouple settlement processing from the API server process. For the MVP,
 * a setInterval on the main process is sufficient.
 *
 * @param emitEvent - WebSocket event emitter forwarded to runSettlementChecks
 * @returns The interval handle (pass to clearInterval to stop)
 */
export function startSettlementChecker(
  emitEvent?: (event: string, payload: unknown) => void
): NodeJS.Timeout {
  const intervalMs = 60 * 1000; // 1 minute

  console.warn('[Settlement] Checker started — interval: 1min');

  return setInterval(async () => {
    try {
      const result = await runSettlementChecks(emitEvent);

      // Only log when there was something to process
      if (result.processed > 0) {
        console.warn(
          `[Settlement] Check complete: ${result.confirmed_to_settled} settled, ` +
          `${result.expired_to_non_delivery} refunded`
        );
      }
    } catch (err) {
      console.error('[Settlement] Unhandled checker error:', err);
    }
  }, intervalMs);
}