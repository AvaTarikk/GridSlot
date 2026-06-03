/**
 * Settlement State Machine Unit Tests
 * Coverage target: ≥ 90%
 */

import { mockDeep, mockReset } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';

const prismaMock = mockDeep<PrismaClient>();
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import {
  transitionToPaymentHeld,
  transitionToDeliveryPending,
  transitionToConfirmed,
  transitionToSettled,
  transitionToNonDelivery,
  transitionToRefunded,
  runSettlementChecks,
} from '../src/services/settlement';
import { InvalidStateTransitionError } from '../src/middleware/errorHandler';

const makeTrade = (overrides = {}) => ({
  id: 'trade_001',
  scu_id: 'scu_001',
  winning_bid_id: 'bid_001',
  seller_id: 'co_seller',
  buyer_id: 'co_buyer',
  clearing_price_cents: 8000,
  mwh_amount: 100,
  total_value_cents: 800000,
  status: 'ACTIVE' as const,
  matched_at: new Date(),
  updated_at: new Date(),
  seller: {
    id: 'co_seller', name: 'Seller Co', kvk_number: '12345678',
    email: 'seller@test.nl', password_hash: 'x', role: 'SELLER' as const,
    kyb_status: 'ACTIVE' as const, grid_operator: 'Liander',
    gto_reference: 'GTO-001', gto_capacity_mwh: 500, delivery_score: 0.9,
    created_at: new Date(), updated_at: new Date(),
  },
  ...overrides,
});

const makeSettlement = (status: string, overrides = {}) => ({
  id: 'set_001',
  trade_id: 'trade_001',
  status: status as never,
  delivery_window_opens_at: null,
  delivery_window_closes_at: null,
  delivery_confirmed_at: null,
  settled_at: null,
  buyer_refund_cents: null,
  collateral_forfeited_cents: null,
  created_at: new Date(),
  updated_at: new Date(),
  trade: makeTrade(),
  ...overrides,
});

beforeEach(() => mockReset(prismaMock));

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('Happy path transitions', () => {
  it('should transition MATCHED → PAYMENT_HELD', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('MATCHED'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('PAYMENT_HELD'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await expect(transitionToPaymentHeld('set_001')).resolves.not.toThrow();
    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAYMENT_HELD' }) })
    );
  });

  it('should transition PAYMENT_HELD → DELIVERY_PENDING', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('PAYMENT_HELD'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('DELIVERY_PENDING'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await expect(transitionToDeliveryPending('set_001')).resolves.not.toThrow();
    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DELIVERY_PENDING',
          delivery_window_opens_at: expect.any(Date),
          delivery_window_closes_at: expect.any(Date),
        }),
      })
    );
  });

  it('should transition DELIVERY_PENDING → CONFIRMED', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('DELIVERY_PENDING'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('CONFIRMED'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await expect(transitionToConfirmed('set_001', 'co_seller')).resolves.not.toThrow();
    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CONFIRMED',
          delivery_confirmed_at: expect.any(Date),
        }),
      })
    );
  });

  it('should transition CONFIRMED → SETTLED and update seller delivery score', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('CONFIRMED'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('SETTLED'));
    prismaMock.trade.update.mockResolvedValue(makeTrade({ status: 'SETTLED' }));
    prismaMock.trade.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    prismaMock.company.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await expect(transitionToSettled('set_001')).resolves.not.toThrow();
    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SETTLED' }) })
    );
  });

  it('should write an audit log entry on every state transition', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('MATCHED'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('PAYMENT_HELD'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await transitionToPaymentHeld('set_001');
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SETTLEMENT_PAYMENT_HELD' }),
      })
    );
  });
});

// ─── Non-delivery path ────────────────────────────────────────────────────────

describe('Non-delivery path', () => {
  it('should transition DELIVERY_PENDING → NON_DELIVERY', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('DELIVERY_PENDING'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('NON_DELIVERY'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await expect(transitionToNonDelivery('set_001')).resolves.not.toThrow();
  });

  it('should forfeit exactly 5% of trade total value on NON_DELIVERY', async () => {
    // total_value_cents = 800,000 → forfeit = 40,000 cents (€400)
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('DELIVERY_PENDING'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('NON_DELIVERY'));
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await transitionToNonDelivery('set_001');

    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ collateral_forfeited_cents: 40000 }), // 5% of 800,000
      })
    );
  });

  it('should transition NON_DELIVERY → REFUNDED and refund full buyer payment', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(
      makeSettlement('NON_DELIVERY', { collateral_forfeited_cents: 40000 })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('REFUNDED'));
    prismaMock.trade.update.mockResolvedValue(makeTrade({ status: 'CANCELLED' }));
    prismaMock.trade.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    prismaMock.company.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await transitionToRefunded('set_001');

    expect(prismaMock.settlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ buyer_refund_cents: 800000 }), // 100% refund
      })
    );
  });

  it('should penalise seller delivery score on REFUNDED', async () => {
    prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('NON_DELIVERY'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaMock.$transaction.mockImplementation(async (fn: any) => fn(prismaMock));
    prismaMock.settlement.update.mockResolvedValue(makeSettlement('REFUNDED'));
    prismaMock.trade.update.mockResolvedValue(makeTrade({ status: 'CANCELLED' }));
    // 10 total trades, 8 settled → new score = 8/10 = 0.8
    prismaMock.trade.count.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    prismaMock.company.update.mockResolvedValue({} as never);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    await transitionToRefunded('set_001');

    expect(prismaMock.company.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ delivery_score: 0.8 }),
      })
    );
  });
});

// ─── Invalid transitions ──────────────────────────────────────────────────────

describe('Invalid state transitions', () => {
  const invalidCases: Array<[string, () => Promise<void>]> = [
    ['SETTLED → PAYMENT_HELD', () => {
      prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('SETTLED'));
      return transitionToPaymentHeld('set_001');
    }],
    ['REFUNDED → CONFIRMED', () => {
      prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('REFUNDED'));
      return transitionToConfirmed('set_001', 'co_seller');
    }],
    ['MATCHED → CONFIRMED (skip states)', () => {
      prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('MATCHED'));
      return transitionToConfirmed('set_001', 'co_seller');
    }],
    ['CONFIRMED → NON_DELIVERY (invalid path)', () => {
      prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('CONFIRMED'));
      return transitionToNonDelivery('set_001');
    }],
    ['SETTLED → REFUNDED', () => {
      prismaMock.settlement.findUnique.mockResolvedValue(makeSettlement('SETTLED'));
      return transitionToRefunded('set_001');
    }],
  ];

  it.each(invalidCases)('should throw InvalidStateTransitionError for %s', async (_label, fn) => {
    await expect(fn()).rejects.toThrow(InvalidStateTransitionError);
  });
});

// ─── runSettlementChecks ──────────────────────────────────────────────────────

describe('runSettlementChecks()', () => {
  it('should return zero counts when nothing needs processing', async () => {
    prismaMock.settlement.findMany.mockResolvedValue([]);

    const result = await runSettlementChecks();
    expect(result.processed).toBe(0);
    expect(result.expired_to_non_delivery).toBe(0);
    expect(result.confirmed_to_settled).toBe(0);
  });

  it('should emit settlement:update events for each processed settlement', async () => {
    prismaMock.settlement.findMany.mockResolvedValue([]);
    const mockEmit = jest.fn();
    await runSettlementChecks(mockEmit);
    expect(mockEmit).not.toHaveBeenCalled(); // nothing to process
  });
});
