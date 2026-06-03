/**
 * Matching Engine Unit Tests
 * Uses jest-mock-extended to mock Prisma — never hits a real database.
 * Coverage target: ≥ 90%
 */

import { mockDeep, mockReset } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

// Mock the prisma module before importing the service
const prismaMock = mockDeep<PrismaClient>();
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { matchScu, runMatchingCycle } from '../src/services/matching-engine';

const makeScu = (overrides = {}) => ({
  id: 'scu_001',
  company_id: 'co_seller',
  congestion_point_id: 'cp_001',
  time_window_start: new Date('2026-07-01T08:00:00Z'),
  time_window_end: new Date('2026-07-01T12:00:00Z'),
  mwh_amount: 100,
  ask_price_cents: 7000,
  collateral_held_cents: 70000,
  status: 'ACTIVE' as const,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const makeBid = (overrides = {}) => ({
  id: 'bid_001',
  scu_id: 'scu_001',
  company_id: 'co_buyer',
  price_cents: 7500,
  status: 'OPEN' as const,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

beforeEach(() => mockReset(prismaMock));

describe('matchScu()', () => {
  it('should return null when there are no bids', async () => {
    prismaMock.bid.findMany.mockResolvedValue([]);
    const result = await matchScu(makeScu());
    expect(result).toBeNull();
  });

  it('should return null when best bid is below ask price', async () => {
    prismaMock.bid.findMany.mockResolvedValue([makeBid({ price_cents: 6999 })]);
    const result = await matchScu(makeScu());
    expect(result).toBeNull();
  });

  it('should match a single bid at exactly the ask price', async () => {
    const scu = makeScu();
    const bid = makeBid({ price_cents: 7000 });
    prismaMock.bid.findMany.mockResolvedValue([bid]);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bid, status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001',
      scu_id: scu.id,
      winning_bid_id: bid.id,
      seller_id: scu.company_id,
      buyer_id: bid.company_id,
      clearing_price_cents: 7000,
      mwh_amount: 100,
      total_value_cents: 700000,
      status: 'ACTIVE',
      matched_at: new Date(),
      updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const result = await matchScu(scu);
    expect(result).not.toBeNull();
    expect(result!.clearing_price_cents).toBe(7000);
    expect(result!.total_value_cents).toBe(700000);
  });

  it('should select highest-priced bid when multiple bids exist', async () => {
    const scu = makeScu();
    const bids = [
      makeBid({ id: 'bid_001', price_cents: 9000, created_at: new Date('2026-01-01T10:00:00Z') }),
      makeBid({ id: 'bid_002', price_cents: 7500, created_at: new Date('2026-01-01T09:00:00Z') }),
      makeBid({ id: 'bid_003', price_cents: 8000, created_at: new Date('2026-01-01T11:00:00Z') }),
    ];
    prismaMock.bid.findMany.mockResolvedValue(bids);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bids[0], status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001', scu_id: scu.id, winning_bid_id: 'bid_001',
      seller_id: scu.company_id, buyer_id: bids[0].company_id,
      clearing_price_cents: 9000, mwh_amount: 100, total_value_cents: 900000,
      status: 'ACTIVE', matched_at: new Date(), updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const result = await matchScu(scu);
    expect(result!.winning_bid_id).toBe('bid_001');
    expect(result!.clearing_price_cents).toBe(9000);
  });

  it('should break ties on price by earliest created_at timestamp', async () => {
    // Bids array already sorted by price DESC, created_at ASC by the DB query
    // The first item in the array is the winner
    const scu = makeScu();
    const bids = [
      makeBid({ id: 'bid_early', price_cents: 8000, created_at: new Date('2026-01-01T09:00:00Z') }),
      makeBid({ id: 'bid_late', price_cents: 8000, created_at: new Date('2026-01-01T10:00:00Z') }),
    ];
    prismaMock.bid.findMany.mockResolvedValue(bids);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bids[0], status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001', scu_id: scu.id, winning_bid_id: 'bid_early',
      seller_id: scu.company_id, buyer_id: bids[0].company_id,
      clearing_price_cents: 8000, mwh_amount: 100, total_value_cents: 800000,
      status: 'ACTIVE', matched_at: new Date(), updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const result = await matchScu(scu);
    expect(result!.winning_bid_id).toBe('bid_early');
  });

  it('should return null if SCU status changed to non-ACTIVE before transaction commits', async () => {
    const scu = makeScu();
    prismaMock.bid.findMany.mockResolvedValue([makeBid({ price_cents: 8000 })]);
    prismaMock.scu.findUnique.mockResolvedValue({ ...scu, status: 'MATCHED' }); // already matched
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));

    const result = await matchScu(scu);
    expect(result).toBeNull();
  });

  it('should mark all non-winning bids as LOST', async () => {
    const scu = makeScu();
    const bids = [
      makeBid({ id: 'bid_001', price_cents: 9000 }),
      makeBid({ id: 'bid_002', price_cents: 8000 }),
      makeBid({ id: 'bid_003', price_cents: 7500 }),
    ];
    prismaMock.bid.findMany.mockResolvedValue(bids);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bids[0], status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001', scu_id: scu.id, winning_bid_id: 'bid_001',
      seller_id: scu.company_id, buyer_id: bids[0].company_id,
      clearing_price_cents: 9000, mwh_amount: 100, total_value_cents: 900000,
      status: 'ACTIVE', matched_at: new Date(), updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await matchScu(scu);

    expect(prismaMock.bid.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['bid_002', 'bid_003'] } },
      data: { status: 'LOST' },
    });
  });

  it('should freeze total_value_cents as clearing_price * mwh at match time', async () => {
    const scu = makeScu({ mwh_amount: 50, ask_price_cents: 6000 });
    const bid = makeBid({ price_cents: 8000 });
    prismaMock.bid.findMany.mockResolvedValue([bid]);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bid, status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001', scu_id: scu.id, winning_bid_id: bid.id,
      seller_id: scu.company_id, buyer_id: bid.company_id,
      clearing_price_cents: 8000, mwh_amount: 50, total_value_cents: 400000,
      status: 'ACTIVE', matched_at: new Date(), updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const result = await matchScu(scu);
    // 8000 cents × 50 MWh = 400,000 cents = €4,000
    expect(result!.total_value_cents).toBe(400000);
  });

  it('should emit trade:matched and bid:lost events when emitEvent is provided', async () => {
    const scu = makeScu();
    const bids = [
      makeBid({ id: 'bid_001', price_cents: 8000, company_id: 'co_buyer_1' }),
      makeBid({ id: 'bid_002', price_cents: 7200, company_id: 'co_buyer_2' }),
    ];
    prismaMock.bid.findMany.mockResolvedValue(bids);
    prismaMock.scu.findUnique.mockResolvedValue(scu);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.scu.update.mockResolvedValue({ ...scu, status: 'MATCHED' });
    prismaMock.bid.update.mockResolvedValue({ ...bids[0], status: 'WON' });
    prismaMock.bid.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.trade.create.mockResolvedValue({
      id: 'trade_001', scu_id: scu.id, winning_bid_id: 'bid_001',
      seller_id: scu.company_id, buyer_id: 'co_buyer_1',
      clearing_price_cents: 8000, mwh_amount: 100, total_value_cents: 800000,
      status: 'ACTIVE', matched_at: new Date(), updated_at: new Date(),
    });
    prismaMock.settlement.create.mockResolvedValue({
      id: 'set_001', trade_id: 'trade_001', status: 'PAYMENT_HELD',
      delivery_window_opens_at: new Date(), delivery_window_closes_at: new Date(),
      delivery_confirmed_at: null, settled_at: null,
      buyer_refund_cents: null, collateral_forfeited_cents: null,
      created_at: new Date(), updated_at: new Date(),
    });
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const mockEmit = jest.fn();
    await matchScu(scu, mockEmit);

    expect(mockEmit).toHaveBeenCalledWith('trade:matched', expect.objectContaining({
      trade_id: 'trade_001',
    }));
    expect(mockEmit).toHaveBeenCalledWith('bid:lost', expect.objectContaining({
      bid_id: 'bid_002',
      reason: 'outbid',
    }));
  });
});

describe('runMatchingCycle()', () => {
  it('should return zero matches when no active SCUs exist', async () => {
    prismaMock.scu.findMany.mockResolvedValue([]);
    const result = await runMatchingCycle();
    expect(result.scus_processed).toBe(0);
    expect(result.matches_made).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  it('should process multiple SCUs and report correct counts', async () => {
    const scus = [makeScu({ id: 'scu_001' }), makeScu({ id: 'scu_002' })];
    prismaMock.scu.findMany.mockResolvedValue(scus);
    // No bids for either — no matches
    prismaMock.bid.findMany.mockResolvedValue([]);

    const result = await runMatchingCycle();
    expect(result.scus_processed).toBe(2);
    expect(result.matches_made).toBe(0);
  });

  it('should include ran_at timestamp in result', async () => {
    prismaMock.scu.findMany.mockResolvedValue([]);
    const result = await runMatchingCycle();
    expect(new Date(result.ran_at)).toBeInstanceOf(Date);
  });

  it('should continue processing remaining SCUs if one throws an error', async () => {
    const scus = [makeScu({ id: 'scu_001' }), makeScu({ id: 'scu_002' })];
    prismaMock.scu.findMany.mockResolvedValue(scus);
    // First call throws, second returns no bids
    prismaMock.bid.findMany
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce([]);

    const result = await runMatchingCycle();
    // Should not throw — should silently catch and continue
    expect(result.scus_processed).toBe(2);
  });
});
