import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  ValidationError,
  NotFoundError,
  AuthorisationError,
  KybNotActiveError,
  CapacityExceededError,
  InsufficientCollateralError,
  ConflictError,
} from '../middleware/errorHandler';

export const scusRouter = Router();

// ─── Validation ───────────────────────────────────────────────────────────────

const CreateScuSchema = z.object({
  congestion_point_id: z.string().min(1),
  time_window_start: z.string().datetime(),
  time_window_end: z.string().datetime(),
  mwh_amount: z.number().int().positive(),
  ask_price_cents: z.number().int().positive(),
}).refine(
  (d) => new Date(d.time_window_end) > new Date(d.time_window_start),
  { message: 'time_window_end must be after time_window_start', path: ['time_window_end'] }
).refine(
  (d) => new Date(d.time_window_start) > new Date(),
  { message: 'time_window_start must be in the future', path: ['time_window_start'] }
);

// ─── GET /api/scus ────────────────────────────────────────────────────────────
// Optional query param: ?mine=true  → scopes to the authenticated company only.
// Without it, all ACTIVE SCUs are returned (marketplace view for buyers).

scusRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const {
      congestion_point_id,
      status = 'ACTIVE',
      page = '1',
      limit = '20',
      mine,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { status };
    if (congestion_point_id) where.congestion_point_id = congestion_point_id;

    // BUG 4 FIX: ?mine=true scopes results to the authenticated company.
    // Without this flag the route returns all companies' SCUs (correct for
    // the marketplace view); with it, only the caller's own SCUs are returned
    // (correct for dashboard / portfolio). Previously the dashboard fetched
    // all SCUs and displayed the total, inflating the count with other
    // companies' listings.
    if (mine === 'true') {
      where.company_id = req.companyId!;
    }

    const [scus, total] = await Promise.all([
      prisma.scu.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, delivery_score: true } },
          congestion_point: true,
          _count: { select: { bids: { where: { status: 'OPEN' } } } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.scu.count({ where }),
    ]);

    res.json({
      data: scus,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/scus/:id ────────────────────────────────────────────────────────

scusRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const scu = await prisma.scu.findUnique({
      where: { id: req.params.id },
      include: {
        company: { select: { id: true, name: true, delivery_score: true, grid_operator: true } },
        congestion_point: true,
        bids: {
          where: { status: 'OPEN' },
          select: { id: true, price_cents: true, created_at: true },
          orderBy: [{ price_cents: 'desc' }, { created_at: 'asc' }],
        },
        trade: { include: { settlement: { select: { status: true } } } },
      },
    });

    if (!scu) throw new NotFoundError('SCU');
    res.json(scu);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/scus ───────────────────────────────────────────────────────────

scusRouter.post('/', requireAuth, requireRole('SELLER', 'BOTH'), async (req, res, next) => {
  try {
    const parsed = CreateScuSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.errors.map((e) => [e.path.join('.'), e.message])
      );
      throw new ValidationError('SCU data is invalid', fields);
    }

    const data = parsed.data;
    const companyId = req.companyId!;

    // Load company to verify KYB and GTO capacity
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundError('Company');
    if (company.kyb_status !== 'ACTIVE') throw new KybNotActiveError();

    // GTO capacity check (mock: compare against gto_capacity_mwh)
    if (company.gto_capacity_mwh !== null && data.mwh_amount > company.gto_capacity_mwh) {
      throw new CapacityExceededError(data.mwh_amount, company.gto_capacity_mwh);
    }

    // Verify congestion point exists
    const point = await prisma.congestionPoint.findUnique({
      where: { id: data.congestion_point_id },
    });
    if (!point) throw new NotFoundError('Congestion point');

    // Calculate collateral: 5% of total value
    const totalValue = data.ask_price_cents * data.mwh_amount;
    const collateral = Math.ceil(totalValue * 0.05);

    // In production: verify seller has funds for collateral via payment provider
    // MVP: simulate — always succeed
    if (collateral < 0) throw new InsufficientCollateralError(collateral, 0);

    const scu = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.scu.create({
        data: {
          company_id: companyId,
          congestion_point_id: data.congestion_point_id,
          time_window_start: new Date(data.time_window_start),
          time_window_end: new Date(data.time_window_end),
          mwh_amount: data.mwh_amount,
          ask_price_cents: data.ask_price_cents,
          collateral_held_cents: collateral,
          status: 'ACTIVE',
        },
        include: { congestion_point: true },
      });

      await tx.auditLog.create({
        data: {
          action: 'SCU_LISTED',
          company_id: companyId,
          metadata: {
            scu_id: created.id,
            mwh_amount: created.mwh_amount,
            ask_price_cents: created.ask_price_cents,
            collateral_held_cents: created.collateral_held_cents,
          },
        },
      });

      return created;
    });

    res.status(201).json(scu);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/scus/:id — withdraw listing ───────────────────────────────────

scusRouter.patch('/:id', requireAuth, requireRole('SELLER', 'BOTH'), async (req, res, next) => {
  try {
    const scu = await prisma.scu.findUnique({ where: { id: req.params.id } });
    if (!scu) throw new NotFoundError('SCU');
    if (scu.company_id !== req.companyId) throw new AuthorisationError('You do not own this SCU');
    if (scu.status !== 'ACTIVE') throw new ConflictError(`Cannot withdraw an SCU with status ${scu.status}`);

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Return losing bids
      await tx.bid.updateMany({
        where: { scu_id: scu.id, status: 'OPEN' },
        data: { status: 'LOST' },
      });

      const withdrawn = await tx.scu.update({
        where: { id: scu.id },
        data: { status: 'WITHDRAWN' },
      });

      await tx.auditLog.create({
        data: {
          action: 'SCU_WITHDRAWN',
          company_id: req.companyId,
          metadata: { scu_id: scu.id },
        },
      });

      return withdrawn;
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});