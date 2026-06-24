import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { NotFoundError, AuthorisationError } from '../middleware/errorHandler';

export const tradesRouter = Router();

// ─── GET /api/trades ──────────────────────────────────────────────────────────

tradesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));
    const companyId = req.companyId!;

    const where = {
      OR: [{ seller_id: companyId }, { buyer_id: companyId }],
    };

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        include: {
          scu: { include: { congestion_point: true } },
          seller: { select: { id: true, name: true, delivery_score: true } },
          buyer: { select: { id: true, name: true } },
          settlement: { select: { status: true, delivery_window_closes_at: true } },
        },
        orderBy: { matched_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.trade.count({ where }),
    ]);

    res.json({
      data: trades,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/trades/:id ──────────────────────────────────────────────────────

tradesRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const companyId = req.companyId!;

    const trade = await prisma.trade.findUnique({
      where: { id: req.params.id },
      include: {
        scu: { include: { congestion_point: true } },
        seller: { select: { id: true, name: true, delivery_score: true, grid_operator: true } },
        buyer: { select: { id: true, name: true } },
        winning_bid: { select: { id: true, price_cents: true } },
        settlement: true,
      },
    });

    if (!trade) throw new NotFoundError('Trade');

    // Only parties to the trade can view it
    if (trade.seller_id !== companyId && trade.buyer_id !== companyId && req.companyRole !== 'ADMIN') {
      throw new AuthorisationError('You are not a party to this trade');
    }

    res.json(trade);
  } catch (err) {
    next(err);
  }
});
