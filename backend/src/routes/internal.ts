import { Router } from 'express';
import { requireInternal } from '../middleware/auth.js';

export const internalRouter = Router();

// These routes are blocked in production by requireInternal middleware.

// ─── POST /api/internal/trigger-matching ──────────────────────────────────────

internalRouter.post('/trigger-matching', requireInternal, async (_req, res, next) => {
  try {
    // Dynamically import to avoid circular deps at startup
    const { runMatchingCycle } = await import('../services/matching-engine.js');
    const result = await runMatchingCycle();
    res.json({ triggered: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/internal/trigger-settlement ────────────────────────────────────

internalRouter.post('/trigger-settlement', requireInternal, async (_req, res, next) => {
  try {
    const { runSettlementChecks } = await import('../services/settlement.js');
    const result = await runSettlementChecks();
    res.json({ triggered: true, ...result });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/internal/stats ──────────────────────────────────────────────────

internalRouter.get('/stats', requireInternal, async (_req, res, next) => {
  try {
    const { prisma } = await import('../lib/prisma.js');

    const [companies, scus, bids, trades, settlements] = await Promise.all([
      prisma.company.count(),
      prisma.scu.groupBy({ by: ['status'], _count: true }),
      prisma.bid.groupBy({ by: ['status'], _count: true }),
      prisma.trade.groupBy({ by: ['status'], _count: true }),
      prisma.settlement.groupBy({ by: ['status'], _count: true }),
    ]);

    res.json({ companies, scus, bids, trades, settlements });
  } catch (err) {
    next(err);
  }
});
