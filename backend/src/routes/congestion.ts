import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import * as fs from 'fs';
import * as path from 'path';

export const congestionRouter = Router();

// Load forecast scenarios from mock data
const forecastPath = path.join(__dirname, '../../../mock-data/forecast-scenarios.json');
const forecastScenarios = JSON.parse(fs.readFileSync(forecastPath, 'utf-8'));

// ─── GET /api/congestion/points ───────────────────────────────────────────────

congestionRouter.get('/points', requireAuth, async (req, res, next) => {
  try {
    const { severity, operator } = req.query;

    const where: Record<string, unknown> = {};
    if (severity) where.severity = severity;
    if (operator) where.operator = operator;

    const points = await prisma.congestionPoint.findMany({
      where,
      include: {
        _count: {
          select: { scus: { where: { status: 'ACTIVE' } } },
        },
      },
      orderBy: [
        // RED first, then AMBER, then GREEN
        { severity: 'desc' },
        { name: 'asc' },
      ],
    });

    // Attach latest clearing price per point (last settled trade)
    const pointsWithPricing = await Promise.all(
      points.map(async (point: typeof points[0]) => {
        const lastTrade = await prisma.trade.findFirst({
          where: {
            scu: { congestion_point_id: point.id },
            status: 'SETTLED',
          },
          orderBy: { matched_at: 'desc' },
          select: { clearing_price_cents: true, matched_at: true },
        });

        return {
          ...point,
          active_scu_count: point._count.scus,
          last_clearing_price_cents: lastTrade?.clearing_price_cents ?? null,
          last_cleared_at: lastTrade?.matched_at ?? null,
        };
      })
    );

    res.json(pointsWithPricing);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/congestion/points/:id ──────────────────────────────────────────

congestionRouter.get('/points/:id', requireAuth, async (req, res, next) => {
  try {
    const point = await prisma.congestionPoint.findUnique({
      where: { id: req.params.id },
    });

    if (!point) throw new NotFoundError('Congestion point');

    // Active SCUs at this point
    const activeScus = await prisma.scu.findMany({
      where: { congestion_point_id: point.id, status: 'ACTIVE' },
      include: {
        company: { select: { id: true, name: true, delivery_score: true } },
      },
      orderBy: { ask_price_cents: 'asc' },
    });

    // Price history: last 10 settled trades at this point
    const priceHistory = await prisma.trade.findMany({
      where: {
        scu: { congestion_point_id: point.id },
        status: 'SETTLED',
      },
      orderBy: { matched_at: 'desc' },
      take: 10,
      select: {
        id: true,
        clearing_price_cents: true,
        mwh_amount: true,
        matched_at: true,
      },
    });

    res.json({
      ...point,
      active_scus: activeScus,
      price_history: priceHistory.reverse(), // chronological
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/congestion/forecast ────────────────────────────────────────────

congestionRouter.get('/forecast', requireAuth, async (_req, res, next) => {
  try {
    const points = await prisma.congestionPoint.findMany({
      select: { id: true, code: true, name: true, severity: true },
    });

    // Rule-based simulation: apply a random scenario's adjustments
    const severityScale = ['GREEN', 'AMBER', 'RED'];

    const forecast = points.map((point: typeof points[0]) => {
      // Simulate 24h forecast buckets (every 4 hours)
      const buckets = Array.from({ length: 6 }, (_, i) => {
        const hour = i * 4;
        const baseIndex = severityScale.indexOf(point.severity);

        // Simple rule: peak congestion mid-day (hours 8-16), lighter at night
        let adjustment = 0;
        if (hour >= 8 && hour <= 16) adjustment = Math.random() > 0.6 ? 1 : 0;
        if (hour >= 20 || hour <= 4) adjustment = Math.random() > 0.7 ? -1 : 0;

        const forecastIndex = Math.max(0, Math.min(2, baseIndex + adjustment));

        return {
          hour_offset: hour,
          predicted_severity: severityScale[forecastIndex],
          confidence: 0.7 + Math.random() * 0.25, // 70–95%
        };
      });

      return {
        congestion_point_id: point.id,
        code: point.code,
        name: point.name,
        current_severity: point.severity,
        forecast_buckets: buckets,
      };
    });

    res.json({
      generated_at: new Date().toISOString(),
      model: 'rule_based_v1',
      note: 'MVP forecast uses rule-based simulation. ML-powered forecasting planned for v2.',
      scenarios: forecastScenarios,
      forecast,
    });
  } catch (err) {
    next(err);
  }
});
