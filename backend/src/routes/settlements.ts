import { Router } from 'express';
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  NotFoundError,
  AuthorisationError,
  InvalidStateTransitionError,
} from '../middleware/errorHandler';

export const settlementsRouter = Router();

// ─── POST /api/settlements/:id/confirm-delivery ───────────────────────────────

settlementsRouter.post(
  '/:id/confirm-delivery',
  requireAuth,
  requireRole('SELLER', 'BOTH'),
  async (req, res, next) => {
    try {
      const settlement = await prisma.settlement.findUnique({
        where: { id: req.params.id },
        include: { trade: true },
      });

      if (!settlement) throw new NotFoundError('Settlement');
      if (settlement.trade.seller_id !== req.companyId) {
        throw new AuthorisationError('Only the seller can confirm delivery');
      }
      if (settlement.status !== 'DELIVERY_PENDING') {
        throw new InvalidStateTransitionError(settlement.status, 'CONFIRMED');
      }

      const now = new Date();

      const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const confirmed = await tx.settlement.update({
          where: { id: settlement.id },
          data: {
            status: 'CONFIRMED',
            delivery_confirmed_at: now,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'SETTLEMENT_CONFIRMED',
            company_id: req.companyId,
            settlement_id: settlement.id,
            metadata: {
              trade_id: settlement.trade_id,
              confirmed_at: now.toISOString(),
            },
          },
        });

        return confirmed;
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/settlements/:id ─────────────────────────────────────────────────

settlementsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const settlement = await prisma.settlement.findUnique({
      where: { id: req.params.id },
      include: {
        trade: {
          include: {
            seller: { select: { id: true, name: true } },
            buyer: { select: { id: true, name: true } },
            scu: { include: { congestion_point: true } },
          },
        },
        audit_logs: {
          orderBy: { created_at: 'asc' },
          select: { action: true, created_at: true, metadata: true },
        },
      },
    });

    if (!settlement) throw new NotFoundError('Settlement');

    const companyId = req.companyId!;
    const isParty =
      settlement.trade.seller_id === companyId ||
      settlement.trade.buyer_id === companyId ||
      req.companyRole === 'ADMIN';

    if (!isParty) throw new AuthorisationError('You are not a party to this settlement');

    res.json(settlement);
  } catch (err) {
    next(err);
  }
});
