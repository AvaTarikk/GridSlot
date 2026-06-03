/**
 * GridSlot Settlement State Machine
 *
 * Valid transitions:
 *   MATCHED → PAYMENT_HELD          (auto on trade creation)
 *   PAYMENT_HELD → DELIVERY_PENDING (auto when delivery window opens)
 *   DELIVERY_PENDING → CONFIRMED    (seller calls confirm-delivery)
 *   CONFIRMED → SETTLED             (auto after grace period)
 *   DELIVERY_PENDING → NON_DELIVERY (system detects missed window)
 *   NON_DELIVERY → REFUNDED         (auto — forfeit 5% collateral, refund buyer)
 *
 * Invariants:
 *   - No backward transitions (enforced by InvalidStateTransitionError)
 *   - Every transition writes to audit_log in the same transaction
 *   - Collateral forfeiture = 5% of trade total_value_cents
 *   - Buyer refund = 100% of trade total_value_cents on non-delivery
 */

import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { InvalidStateTransitionError } from '../middleware/errorHandler.js';
import type { SettlementStatus } from '@prisma/client';

// ─── Valid transition map ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  MATCHED:          ['PAYMENT_HELD'],
  PAYMENT_HELD:     ['DELIVERY_PENDING'],
  DELIVERY_PENDING: ['CONFIRMED', 'NON_DELIVERY'],
  CONFIRMED:        ['SETTLED'],
  SETTLED:          [],
  NON_DELIVERY:     ['REFUNDED'],
  REFUNDED:         [],
};

function assertValidTransition(from: SettlementStatus, to: SettlementStatus): void {
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}

// ─── Transition functions ─────────────────────────────────────────────────────

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

export async function transitionToDeliveryPending(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'DELIVERY_PENDING');

  const deliveryWindowHours = parseInt(process.env.SETTLEMENT_DELIVERY_WINDOW_HOURS ?? '4', 10);
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

    // Update seller delivery score
    const seller = settlement.trade.seller;
    const allTrades = await tx.trade.count({ where: { seller_id: seller.id } });
    const settledTrades = await tx.trade.count({
      where: { seller_id: seller.id, status: 'SETTLED' },
    });
    // +1 for the current one being settled
    const newScore = (settledTrades + 1) / allTrades;

    await tx.company.update({
      where: { id: seller.id },
      data: { delivery_score: Math.round(newScore * 1000) / 1000 },
    });

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_SETTLED',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'SETTLED',
          settled_at: now.toISOString(),
          total_value_cents: settlement.trade.total_value_cents,
        },
      },
    });
  });
}

export async function transitionToNonDelivery(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: true },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'NON_DELIVERY');

  // Forfeit 5% of trade value from seller collateral
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
        },
      },
    });
  });
}

export async function transitionToRefunded(settlementId: string): Promise<void> {
  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { trade: { include: { seller: true } } },
  });
  if (!settlement) throw new Error(`Settlement ${settlementId} not found`);

  assertValidTransition(settlement.status, 'REFUNDED');

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

    // Penalise seller delivery score
    const seller = settlement.trade.seller;
    const allTrades = await tx.trade.count({ where: { seller_id: seller.id } });
    const settledTrades = await tx.trade.count({
      where: { seller_id: seller.id, status: 'SETTLED' },
    });
    const newScore = allTrades > 0 ? settledTrades / allTrades : 1.0;

    await tx.company.update({
      where: { id: seller.id },
      data: { delivery_score: Math.round(newScore * 1000) / 1000 },
    });

    await tx.auditLog.create({
      data: {
        action: 'SETTLEMENT_REFUNDED',
        settlement_id: settlementId,
        metadata: {
          from: settlement.status,
          to: 'REFUNDED',
          buyer_refund_cents: refundAmount,
          collateral_forfeited_cents: settlement.collateral_forfeited_cents,
        },
      },
    });
  });
}

// ─── Background checks ────────────────────────────────────────────────────────

export interface SettlementCheckResult {
  processed: number;
  expired_to_non_delivery: number;
  confirmed_to_settled: number;
}

/**
 * Run periodic settlement checks:
 *   1. Confirmed → Settled (after delivery grace period)
 *   2. Delivery pending → Non-delivery (delivery window expired)
 */
export async function runSettlementChecks(
  emitEvent?: (event: string, payload: unknown) => void
): Promise<SettlementCheckResult> {
  const now = new Date();
  let expiredCount = 0;
  let settledCount = 0;

  // 1. Find DELIVERY_PENDING settlements past their close window
  const expired = await prisma.settlement.findMany({
    where: {
      status: 'DELIVERY_PENDING',
      delivery_window_closes_at: { lt: now },
    },
  });

  for (const s of expired) {
    try {
      await transitionToNonDelivery(s.id);
      await transitionToRefunded(s.id);
      expiredCount++;

      emitEvent?.('settlement:update', {
        settlement_id: s.id,
        new_status: 'REFUNDED',
      });
    } catch (err) {
      console.error(`Failed to process expired settlement ${s.id}:`, err);
    }
  }

  // 2. Find CONFIRMED settlements ready to settle (grace period: 1h after confirmation)
  const graceMs = 60 * 60 * 1000;
  const readyToSettle = await prisma.settlement.findMany({
    where: {
      status: 'CONFIRMED',
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
      console.error(`Failed to settle ${s.id}:`, err);
    }
  }

  return {
    processed: expired.length + readyToSettle.length,
    expired_to_non_delivery: expiredCount,
    confirmed_to_settled: settledCount,
  };
}

/**
 * Start the settlement checker scheduler (runs every 5 minutes).
 */
export function startSettlementChecker(
  emitEvent?: (event: string, payload: unknown) => void
): NodeJS.Timeout {
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  console.warn('💰 Settlement checker started — interval: 5min');

  return setInterval(async () => {
    try {
      await runSettlementChecks(emitEvent);
    } catch (err) {
      console.error('Settlement check error:', err);
    }
  }, intervalMs);
}
