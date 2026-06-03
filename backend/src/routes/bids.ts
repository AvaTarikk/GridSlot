import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  ValidationError,
  NotFoundError,
  AuthorisationError,
  ConflictError,
  KybNotActiveError,
} from '../middleware/errorHandler.js';

export const bidsRouter = Router();

// ─── Validation ───────────────────────────────────────────────────────────────

const PlaceBidSchema = z.object({
  scu_id: z.string().min(1),
  price_cents: z.number().int().positive(),
});

// ─── POST /api/bids ───────────────────────────────────────────────────────────

bidsRouter.post('/', requireAuth, requireRole('BUYER', 'BOTH'), async (req, res, next) => {
  try {
    const parsed = PlaceBidSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.errors.map((e) => [e.path.join('.'), e.message])
      );
      throw new ValidationError('Bid data is invalid', fields);
    }

    const { scu_id, price_cents } = parsed.data;
    const companyId = req.companyId!;

    // Verify company KYB
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundError('Company');
    if (company.kyb_status !== 'ACTIVE') throw new KybNotActiveError();

    // Verify SCU exists and is active
    const scu = await prisma.scu.findUnique({ where: { id: scu_id } });
    if (!scu) throw new NotFoundError('SCU');
    if (scu.status !== 'ACTIVE') {
      throw new ConflictError(`Cannot bid on an SCU with status ${scu.status}`);
    }

    // Cannot bid on own SCU
    if (scu.company_id === companyId) {
      throw new ConflictError('You cannot bid on your own SCU listing');
    }

    // Check for existing open bid by same company on same SCU
    const existingBid = await prisma.bid.findFirst({
      where: { scu_id, company_id: companyId, status: 'OPEN' },
    });
    if (existingBid) {
      throw new ConflictError(
        'You already have an open bid on this SCU. Withdraw it before placing a new one.'
      );
    }

    const bid = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.bid.create({
        data: {
          scu_id,
          company_id: companyId,
          price_cents,
          status: 'OPEN',
        },
        include: {
          scu: { include: { congestion_point: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'BID_PLACED',
          company_id: companyId,
          metadata: { bid_id: created.id, scu_id, price_cents },
        },
      });

      return created;
    });

    res.status(201).json(bid);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bids/my ─────────────────────────────────────────────────────────

bidsRouter.get('/my', requireAuth, async (req, res, next) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, parseInt(limit as string, 10));

    const where: Record<string, unknown> = { company_id: req.companyId };
    if (status) where.status = status;

    const [bids, total] = await Promise.all([
      prisma.bid.findMany({
        where,
        include: {
          scu: { include: { congestion_point: true } },
          trade: { select: { id: true, status: true, settlement: { select: { status: true } } } },
        },
        orderBy: { created_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.bid.count({ where }),
    ]);

    res.json({
      data: bids,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/bids/:id — withdraw bid ──────────────────────────────────────

bidsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const bid = await prisma.bid.findUnique({ where: { id: req.params.id } });
    if (!bid) throw new NotFoundError('Bid');
    if (bid.company_id !== req.companyId) throw new AuthorisationError('You do not own this bid');
    if (bid.status !== 'OPEN') {
      throw new ConflictError(`Cannot withdraw a bid with status ${bid.status}`);
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const withdrawn = await tx.bid.update({
        where: { id: bid.id },
        data: { status: 'WITHDRAWN' },
      });

      await tx.auditLog.create({
        data: {
          action: 'BID_WITHDRAWN',
          company_id: req.companyId,
          metadata: { bid_id: bid.id, scu_id: bid.scu_id },
        },
      });

      return withdrawn;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});
