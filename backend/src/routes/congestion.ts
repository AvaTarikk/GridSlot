import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import * as fs from 'fs';
import * as path from 'path';

export const congestionRouter = Router();

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
      include: { _count: { select: { scus: { where: { status: 'ACTIVE' } } } } },
      orderBy: [{ severity: 'desc' }, { name: 'asc' }],
    });

    const pointsWithPricing = await Promise.all(
      points.map(async (point: typeof points[0]) => {
        const lastTrade = await prisma.trade.findFirst({
          where: { scu: { congestion_point_id: point.id }, status: 'SETTLED' },
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
  } catch (err) { next(err); }
});

// ─── GET /api/congestion/points/:id ──────────────────────────────────────────

congestionRouter.get('/points/:id', requireAuth, async (req, res, next) => {
  try {
    const point = await prisma.congestionPoint.findUnique({ where: { id: req.params.id } });
    if (!point) throw new NotFoundError('Congestion point');

    const [activeScus, priceHistory] = await Promise.all([
      prisma.scu.findMany({
        where: { congestion_point_id: point.id, status: 'ACTIVE' },
        include: { company: { select: { id: true, name: true, delivery_score: true } } },
        orderBy: { ask_price_cents: 'asc' },
      }),
      prisma.trade.findMany({
        where: { scu: { congestion_point_id: point.id }, status: 'SETTLED' },
        orderBy: { matched_at: 'desc' },
        take: 10,
        select: { id: true, clearing_price_cents: true, mwh_amount: true, matched_at: true },
      }),
    ]);

    res.json({ ...point, active_scus: activeScus, price_history: priceHistory.reverse() });
  } catch (err) { next(err); }
});

// ─── Forecast helpers ─────────────────────────────────────────────────────────

type Severity = 'GREEN' | 'AMBER' | 'RED';
const SEV_RANK: Record<Severity, number> = { GREEN: 0, AMBER: 1, RED: 2 };
const SEV_LIST: Severity[] = ['GREEN', 'AMBER', 'RED'];

/**
 * Deterministic demand multiplier based on hour of day + day of week.
 * Models real Dutch industrial demand patterns:
 *   - Weekday morning ramp (07-09): high
 *   - Midday plateau (10-16): peak
 *   - Evening ramp-down (17-20): medium-high
 *   - Night (21-06): low
 *   - Weekend: ~30% lower overall
 */
function demandMultiplier(hour: number, dayOfWeek: number): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekendDiscount = isWeekend ? 0.65 : 1.0;

  let base: number;
  if (hour >= 7 && hour <= 9)   base = 0.85;   // morning ramp
  else if (hour >= 10 && hour <= 16) base = 1.0; // peak industrial
  else if (hour >= 17 && hour <= 20) base = 0.80; // evening
  else if (hour >= 21 || hour <= 4)  base = 0.35; // night
  else base = 0.55; // shoulder (5-6, transitions)

  return base * weekendDiscount;
}

/**
 * Compute forecast severity for a congestion point at a future hour.
 * Uses:
 *   - Current DB severity as baseline
 *   - Active SCU count (supply pressure)
 *   - Recent trade volume (demand pressure)
 *   - Time-of-day demand multiplier
 *   - Small seeded random for natural variation (seeded on point id + hour so stable per call)
 */
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h % 1000) / 1000;
}

function forecastSeverity(
  baseRank: number,
  hourOffset: number,
  activeScuCount: number,
  recentTradeVolume: number,
  now: Date,
  pointId: string,
): { severity: Severity; confidence: number } {
  const futureTime = new Date(now.getTime() + hourOffset * 3600000);
  const hour = futureTime.getHours();
  const dow = futureTime.getDay();

  const demand = demandMultiplier(hour, dow);

  // Supply pressure: more active SCUs = more sellers = slightly relieving
  const supplyRelief = Math.min(0.4, activeScuCount * 0.05);

  // Demand pressure: higher trade volume = more buyers = worsening
  const demandPressure = Math.min(0.4, recentTradeVolume * 0.08);

  // Net pressure on severity rank (0=GREEN, 1=AMBER, 2=RED)
  const netPressure = (demand + demandPressure - supplyRelief - 0.3);

  // Seeded noise — stable per (point, hour) combination, changes daily
  const dateKey = `${pointId}-${hourOffset}-${now.toDateString()}`;
  const noise = (seededRandom(dateKey) - 0.5) * 0.3;

  const rawRank = baseRank + netPressure + noise;
  const clampedRank = Math.max(0, Math.min(2, Math.round(rawRank)));
  const severity = SEV_LIST[clampedRank];

  // Confidence: higher near-term, lower further out, boosted by data richness
  const timeDecay = Math.max(0.55, 0.95 - hourOffset * 0.025);
  const dataBoost = Math.min(0.1, (activeScuCount + recentTradeVolume) * 0.01);
  const confidence = Math.min(0.97, timeDecay + dataBoost);

  return { severity, confidence };
}

// ─── GET /api/congestion/forecast ────────────────────────────────────────────

congestionRouter.get('/forecast', requireAuth, async (_req, res, next) => {
  try {
    const now = new Date();

    const points = await prisma.congestionPoint.findMany({
      select: { id: true, code: true, name: true, severity: true },
    });

    // Batch load active SCU counts and recent trade counts for all points
    const [scuCounts, recentTrades] = await Promise.all([
      prisma.scu.groupBy({
        by: ['congestion_point_id'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
      }),
      prisma.trade.findMany({
        where: {
          matched_at: { gte: new Date(now.getTime() - 48 * 3600000) }, // last 48h
          status: { in: ['ACTIVE', 'SETTLED'] },
        },
        include: { scu: { select: { congestion_point_id: true } } },
      }),
    ]);

    const scuCountMap = Object.fromEntries(
      scuCounts.map((r: { congestion_point_id: string; _count: { id: number } }) => [r.congestion_point_id, r._count.id])
    );

    const tradeVolumeMap: Record<string, number> = {};
    for (const trade of recentTrades) {
      const cpId = trade.scu?.congestion_point_id;
      if (cpId) tradeVolumeMap[cpId] = (tradeVolumeMap[cpId] ?? 0) + 1;
    }

    // Generate 12 buckets × 2h intervals = 24h forecast (more granular than before)
    const BUCKETS = 12;
    const INTERVAL_H = 2;

    const forecast = points.map((point: typeof points[0]) => {
      const baseRank = SEV_RANK[point.severity as Severity];
      const activeScus = scuCountMap[point.id] ?? 0;
      const tradeVolume = tradeVolumeMap[point.id] ?? 0;

      const buckets = Array.from({ length: BUCKETS }, (_, i) => {
        const hourOffset = i * INTERVAL_H;
        const { severity, confidence } = forecastSeverity(
          baseRank, hourOffset, activeScus, tradeVolume, now, point.id
        );
        return { hour_offset: hourOffset, predicted_severity: severity, confidence };
      });

      // Derived insights
      const worstBucket = buckets.reduce((w, b) =>
        SEV_RANK[b.predicted_severity] > SEV_RANK[w.predicted_severity] ? b : w
      );
      const improvingFrom = buckets.findIndex((b, i) =>
        i > 0 && SEV_RANK[b.predicted_severity] < SEV_RANK[buckets[i - 1].predicted_severity]
      );

      return {
        congestion_point_id: point.id,
        code: point.code,
        name: point.name,
        current_severity: point.severity,
        forecast_buckets: buckets,
        insights: {
          peak_hour_offset: worstBucket.hour_offset,
          peak_severity: worstBucket.predicted_severity,
          improving_from_hour: improvingFrom >= 0 ? buckets[improvingFrom].hour_offset : null,
          active_scu_count: activeScus,
          recent_trade_count: tradeVolume,
        },
      };
    });

    // Sort: worst current severity first
    forecast.sort((a: typeof forecast[0], b: typeof forecast[0]) =>
      SEV_RANK[b.current_severity as Severity] - SEV_RANK[a.current_severity as Severity]
    );

    res.json({
      generated_at: now.toISOString(),
      model: 'rule_based_v2',
      interval_hours: INTERVAL_H,
      horizon_hours: BUCKETS * INTERVAL_H,
      note: 'Forecast uses demand patterns, active SCU supply, and recent trade volume. ML model planned for v3.',
      scenarios: forecastScenarios,
      forecast,
    });
  } catch (err) { next(err); }
});