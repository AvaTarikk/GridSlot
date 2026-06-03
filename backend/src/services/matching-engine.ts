/**
 * GridSlot Matching Engine
 *
 * Price-time priority auction matching.
 * Runs on a configurable interval (MATCHING_ENGINE_INTERVAL_MS).
 *
 * Algorithm:
 *   FOR each ACTIVE SCU:
 *     bids = open bids ordered by price DESC, created_at ASC
 *     IF bids[0].price >= SCU.ask_price → MATCH
 *
 * Invariants (must never be violated):
 *   - One trade per SCU (enforced by DB unique constraint + status check)
 *   - Prices frozen at match time — never recalculated post-match
 *   - All writes in a single transaction (no partial state)
 *   - Audit log entry written in same transaction
 */

import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import type { Scu, Bid } from '@prisma/client';

export interface MatchResult {
  scu_id: string;
  trade_id: string;
  winning_bid_id: string;
  clearing_price_cents: number;
  mwh_amount: number;
  total_value_cents: number;
}

export interface MatchingCycleResult {
  scus_processed: number;
  matches_made: number;
  matches: MatchResult[];
  ran_at: string;
}

/**
 * Match a single SCU against its open bids.
 * Returns the trade if a match was made, null otherwise.
 * Must be called inside a DB transaction for safety.
 */
export async function matchScu(
  scu: Scu,
  emitEvent?: (event: string, payload: unknown) => void
): Promise<MatchResult | null> {
  // Fetch open bids: highest price first, earliest timestamp as tiebreaker
  const bids = await prisma.bid.findMany({
    where: { scu_id: scu.id, status: 'OPEN' },
    orderBy: [{ price_cents: 'desc' }, { created_at: 'asc' }],
  });

  if (bids.length === 0) return null;

  const winningBid = bids[0];

  // No match if best bid is below ask price
  if (winningBid.price_cents < scu.ask_price_cents) return null;

  // Freeze values at match time — never recalculate
  const clearingPrice = winningBid.price_cents;
  const mwhAmount = scu.mwh_amount;
  const totalValue = clearingPrice * mwhAmount;

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Double-check SCU is still ACTIVE (guard against concurrent matching)
    const freshScu = await tx.scu.findUnique({ where: { id: scu.id } });
    if (!freshScu || freshScu.status !== 'ACTIVE') return null;

    // Update SCU status
    await tx.scu.update({ where: { id: scu.id }, data: { status: 'MATCHED' } });

    // Update winning bid
    await tx.bid.update({ where: { id: winningBid.id }, data: { status: 'WON' } });

    // Mark all other bids as LOST
    const losingBidIds = bids.slice(1).map((b: Bid) => b.id);
    if (losingBidIds.length > 0) {
      await tx.bid.updateMany({
        where: { id: { in: losingBidIds } },
        data: { status: 'LOST' },
      });
    }

    // Create trade with frozen values
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

    // Create settlement record
    const deliveryWindowHours = parseInt(process.env.SETTLEMENT_DELIVERY_WINDOW_HOURS ?? '4', 10);
    const deliveryOpens = new Date();
    const deliveryCloses = new Date(deliveryOpens.getTime() + deliveryWindowHours * 60 * 60 * 1000);

    const settlement = await tx.settlement.create({
      data: {
        trade_id: trade.id,
        status: 'PAYMENT_HELD',
        delivery_window_opens_at: deliveryOpens,
        delivery_window_closes_at: deliveryCloses,
      },
    });

    // Audit log entry in same transaction
    await tx.auditLog.create({
      data: {
        action: 'TRADE_MATCHED',
        company_id: scu.company_id,
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

  if (result && emitEvent) {
    emitEvent('trade:matched', {
      trade_id: result.trade_id,
      scu_id: result.scu_id,
      clearing_price_cents: result.clearing_price_cents,
      seller_id: scu.company_id,
      buyer_id: winningBid.company_id,
    });

    // Notify each losing bidder
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

/**
 * Run a full matching cycle across all active SCUs.
 * Called by the scheduler or the internal trigger endpoint.
 */
export async function runMatchingCycle(
  emitEvent?: (event: string, payload: unknown) => void
): Promise<MatchingCycleResult> {
  const ranAt = new Date().toISOString();

  // Fetch all active SCUs ordered by creation time (FIFO fairness)
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
      // Log and continue — one failed SCU must not halt the entire cycle
      console.error(`Matching error for SCU ${scu.id}:`, err);
    }
  }

  return {
    scus_processed: activeScus.length,
    matches_made: matches.length,
    matches,
    ran_at: ranAt,
  };
}

/**
 * Start the matching engine scheduler.
 * Runs runMatchingCycle on the configured interval.
 */
export function startMatchingEngine(
  emitEvent?: (event: string, payload: unknown) => void
): NodeJS.Timeout {
  const intervalMs = parseInt(
    process.env.MATCHING_ENGINE_INTERVAL_MS ?? '60000',
    10
  );

  console.warn(`⚡ Matching engine started — interval: ${intervalMs}ms`);

  return setInterval(async () => {
    try {
      const result = await runMatchingCycle(emitEvent);
      if (result.matches_made > 0) {
        console.warn(
          `Matching cycle: ${result.matches_made} match(es) from ${result.scus_processed} SCUs`
        );
      }
    } catch (err) {
      console.error('Matching cycle error:', err);
    }
  }, intervalMs);
}
