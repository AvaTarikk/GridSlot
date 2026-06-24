/**
 * @file matching-engine.ts
 * @description GridSlot Matching Engine — core auction logic for the capacity marketplace.
 *
 * OVERVIEW
 * --------
 * The matching engine is the financial heart of GridSlot. It runs on a configurable
 * interval and attempts to match every active SCU (Standardised Capacity Unit) against
 * its open bids using price-time priority auction rules.
 *
 * ALGORITHM (price-time priority)
 * --------------------------------
 * For each ACTIVE SCU, ordered by creation time (FIFO fairness across sellers):
 *   1. Fetch all OPEN bids, ordered by price DESC, then created_at ASC (tie-breaker)
 *   2. If the highest bid >= SCU ask price → MATCH
 *   3. The clearing price equals the winning bid price (not the ask price)
 *   4. All losing bids are marked LOST; the SCU is marked MATCHED
 *   5. A Trade and Settlement record are created atomically
 *
 * FINANCIAL INVARIANTS (never violate these)
 * -------------------------------------------
 * - One trade per SCU: enforced by DB unique constraint on trades.scu_id
 * - Prices are frozen at match time and never recalculated post-match
 * - All DB writes occur in a single Prisma transaction (no partial state possible)
 * - Every state change writes an AuditLog entry in the same transaction
 * - Concurrent matching is guarded by re-reading SCU status inside the transaction
 *
 * REGULATORY CONTEXT
 * ------------------
 * GridSlot operates under the ACM congestion service provider framework (April 2024)
 * and the Dutch Energiewet (January 2026). The matching engine must produce a complete
 * and auditable record of every trade for regulatory compliance.
 */

import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import type { Scu, Bid } from '@prisma/client';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * The result of a successful SCU-to-bid match.
 * All monetary values are in EUR cents (integer) — never floats.
 */
export interface MatchResult {
  scu_id: string;
  trade_id: string;
  winning_bid_id: string;
  /** Clearing price per MWh in EUR cents. Equals the winning bid price, not the ask price. */
  clearing_price_cents: number;
  mwh_amount: number;
  /** Pre-computed: clearing_price_cents × mwh_amount. Frozen at match time. */
  total_value_cents: number;
}

/**
 * Summary returned after a full matching cycle completes.
 */
export interface MatchingCycleResult {
  /** Number of ACTIVE SCUs inspected this cycle. */
  scus_processed: number;
  /** Number of SCUs that found a matching bid. */
  matches_made: number;
  /** Details of each successful match. */
  matches: MatchResult[];
  /** ISO timestamp of when this cycle ran. */
  ran_at: string;
}

// ─── Core matching logic ──────────────────────────────────────────────────────

/**
 * Attempts to match a single SCU against its open bids.
 *
 * This function implements the price-time priority rule:
 * - The bid with the highest price wins.
 * - If two bids have the same price, the earlier one wins (created_at ASC).
 * - If no bid meets or exceeds the ask price, no match is made this cycle.
 *
 * On a successful match, the function:
 *   1. Marks the SCU as MATCHED
 *   2. Marks the winning bid as WON, all others as LOST
 *   3. Creates a Trade record with prices frozen at current values
 *   4. Creates a Settlement record in PAYMENT_HELD state
 *   5. Writes an AuditLog entry — all in one atomic transaction
 *   6. Emits real-time WebSocket events to both parties (if emitEvent is provided)
 *
 * @param scu - The active SCU to attempt matching on
 * @param emitEvent - Optional WebSocket event emitter for real-time notifications
 * @returns The match result if a trade was created, or null if no match was possible
 */
export async function matchScu(
  scu: Scu,
  emitEvent?: (event: string, payload: unknown) => void
): Promise<MatchResult | null> {

  // Step 1: Fetch all open bids for this SCU.
  // ORDER BY price_cents DESC, created_at ASC implements price-time priority:
  // highest price wins; ties broken by who bid first.
  const bids = await prisma.bid.findMany({
    where: { scu_id: scu.id, status: 'OPEN' },
    orderBy: [{ price_cents: 'desc' }, { created_at: 'asc' }],
  });

  // No bids at all — nothing to match this cycle
  if (bids.length === 0) return null;

  const winningBid = bids[0];

  // Step 2: Check the price floor.
  // The ask price is the minimum the seller accepts. Bids below it are ignored
  // this cycle but remain OPEN for future cycles (they are NOT auto-rejected here).
  if (winningBid.price_cents < scu.ask_price_cents) return null;

  // Step 3: Freeze trade values at the moment of match.
  // These values must never be recalculated after this point — they are the
  // legally binding terms of the trade.
  const clearingPrice = winningBid.price_cents; // buyer pays their bid, not the ask
  const mwhAmount = scu.mwh_amount;
  const totalValue = clearingPrice * mwhAmount;  // integer arithmetic — no float risk

  // Step 4: Execute all DB writes atomically.
  // If any write fails, the entire transaction rolls back and the SCU remains ACTIVE.
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

    // Concurrency guard: re-read SCU status inside the transaction.
    // Another process may have matched this SCU between our initial read and now.
    // If so, abort silently — the other process succeeded.
    const freshScu = await tx.scu.findUnique({ where: { id: scu.id } });
    if (!freshScu || freshScu.status !== 'ACTIVE') return null;

    // Mark SCU as matched — it can no longer receive new bids
    await tx.scu.update({
      where: { id: scu.id },
      data: { status: 'MATCHED' },
    });

    // Mark winning bid
    await tx.bid.update({
      where: { id: winningBid.id },
      data: { status: 'WON' },
    });

    // Mark all losing bids — buyers are notified via WebSocket after the transaction
    const losingBidIds = bids.slice(1).map((b: Bid) => b.id);
    if (losingBidIds.length > 0) {
      await tx.bid.updateMany({
        where: { id: { in: losingBidIds } },
        data: { status: 'LOST' },
      });
    }

    // Create the trade record.
    // NOTE: clearing_price_cents and total_value_cents are stored as integers (EUR cents).
    // The DB schema enforces: total_value_cents = clearing_price_cents * mwh_amount.
    const trade = await tx.trade.create({
      data: {
        scu_id: scu.id,
        winning_bid_id: winningBid.id,
        seller_id: scu.company_id,
        buyer_id: winningBid.company_id,
        clearing_price_cents: clearingPrice,
        mwh_amount: mwhAmount,
        total_value_cents: totalValue,
        status: 'ACTIVE',
      },
    });

    // Create settlement record in PAYMENT_HELD state.
    // The delivery window is the period during which the seller must confirm
    // that physical capacity was delivered. Configured via SETTLEMENT_DELIVERY_WINDOW_HOURS.
    const deliveryWindowHours = parseInt(
      process.env.SETTLEMENT_DELIVERY_WINDOW_HOURS ?? '4',
      10
    );
    const deliveryOpens = new Date();
    const deliveryCloses = new Date(
      deliveryOpens.getTime() + deliveryWindowHours * 60 * 60 * 1000
    );

    const settlement = await tx.settlement.create({
      data: {
        trade_id: trade.id,
        status: 'PAYMENT_HELD',       // buyer funds are now held in escrow simulation
        delivery_window_opens_at: deliveryOpens,
        delivery_window_closes_at: deliveryCloses,
      },
    });

    // Write immutable audit log entry.
    // This record is never updated or deleted — it is the compliance trail.
    await tx.auditLog.create({
      data: {
        action: 'TRADE_MATCHED',
        company_id: scu.company_id,   // seller is the primary actor for this event
        settlement_id: settlement.id,
        metadata: {
          trade_id: trade.id,
          scu_id: scu.id,
          winning_bid_id: winningBid.id,
          clearing_price_cents: clearingPrice,
          mwh_amount: mwhAmount,
          total_value_cents: totalValue,
          losing_bid_count: losingBidIds.length,
        },
      },
    });

    return {
      scu_id: scu.id,
      trade_id: trade.id,
      winning_bid_id: winningBid.id,
      clearing_price_cents: clearingPrice,
      mwh_amount: mwhAmount,
      total_value_cents: totalValue,
    };
  });

  // Step 5: Emit real-time WebSocket events — only after the transaction commits.
  // We emit outside the transaction so a WebSocket failure cannot roll back the trade.
  if (result && emitEvent) {
    // Notify both parties of the successful match
    emitEvent('trade:matched', {
      trade_id: result.trade_id,
      scu_id: result.scu_id,
      clearing_price_cents: result.clearing_price_cents,
      seller_id: scu.company_id,
      buyer_id: winningBid.company_id,
    });

    // Notify each losing bidder individually so they can update their UI
    bids.slice(1).forEach((bid: Bid) => {
      emitEvent('bid:lost', {
        bid_id: bid.id,
        scu_id: scu.id,
        reason: 'outbid',
        company_id: bid.company_id,
      });
    });
  }

  return result;
}

// ─── Cycle runner ─────────────────────────────────────────────────────────────

/**
 * Runs a full matching cycle across all currently active SCUs.
 *
 * SCUs are processed in FIFO order (oldest listing first) to ensure
 * sellers who listed earlier are not disadvantaged by late arrivals.
 *
 * Errors on individual SCUs are caught and logged — a single failure
 * must never prevent other SCUs from being processed in the same cycle.
 *
 * @param emitEvent - Optional WebSocket event emitter forwarded to matchScu
 * @returns A summary of the cycle: how many SCUs were checked and matched
 */
export async function runMatchingCycle(
  emitEvent?: (event: string, payload: unknown) => void
): Promise<MatchingCycleResult> {
  const ranAt = new Date().toISOString();

  // Fetch all active listings, oldest first (FIFO priority across sellers)
  const activeScus = await prisma.scu.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { created_at: 'asc' },
  });

  const matches: MatchResult[] = [];

  for (const scu of activeScus) {
    try {
      const match = await matchScu(scu, emitEvent);
      if (match) matches.push(match);
    } catch (err) {
      // Log the error but continue processing remaining SCUs.
      // A DB timeout or constraint violation on one SCU should never
      // block the rest of the marketplace.
      console.error(`[MatchingEngine] Error processing SCU ${scu.id}:`, err);
    }
  }

  return {
    scus_processed: activeScus.length,
    matches_made: matches.length,
    matches,
    ran_at: ranAt,
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Starts the matching engine on a repeating interval.
 *
 * The interval is configured via the MATCHING_ENGINE_INTERVAL_MS environment
 * variable (default: 60,000ms = 1 minute). In production this would be driven
 * by a dedicated job scheduler (e.g. BullMQ), but for the MVP a setInterval
 * on the API server process is sufficient.
 *
 * @param emitEvent - WebSocket event emitter, passed through to each cycle
 * @returns The interval handle (can be passed to clearInterval to stop the engine)
 */
export function startMatchingEngine(
  emitEvent?: (event: string, payload: unknown) => void
): NodeJS.Timeout {
  const intervalMs = parseInt(
    process.env.MATCHING_ENGINE_INTERVAL_MS ?? '60000',
    10
  );

  console.warn(`[MatchingEngine] Started — cycle interval: ${intervalMs}ms`);

  return setInterval(async () => {
    try {
      const result = await runMatchingCycle(emitEvent);

      // Only log when something actually happened — avoid log spam on quiet cycles
      if (result.matches_made > 0) {
        console.warn(
          `[MatchingEngine] Cycle complete: ${result.matches_made} match(es) from ${result.scus_processed} active SCUs`
        );
      }
    } catch (err) {
      // Catch top-level errors (e.g. DB connection lost) so the interval
      // continues running and recovers on the next tick
      console.error('[MatchingEngine] Unhandled cycle error:', err);
    }
  }, intervalMs);
}