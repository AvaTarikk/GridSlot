/**
 * @file congestion.ts
 * @description Congestion data and forecasting routes for the GridSlot API.
 *
 * OVERVIEW
 * --------
 * This module serves two types of data:
 *
 *   1. LIVE CONGESTION DATA — real-time (or near-real-time) severity status of
 *      Dutch electricity grid congestion points, sourced from the database.
 *      In production, this would be updated via live feeds from TenneT, Liander,
 *      Stedin, and Enexis using the USEF/UFTP 1.01 protocol. In the MVP, severity
 *      is seeded manually and reflects realistic Dutch grid conditions.
 *
 *   2. 24-HOUR FORECAST — a rule-based simulation of predicted congestion severity
 *      over the next 24 hours for each grid point. The model uses:
 *        - Current DB severity as a baseline
 *        - Active SCU listings (supply signal: more sellers = relief pressure)
 *        - Recent trade volume (demand signal: more buyers = congestion pressure)
 *        - Dutch industrial demand patterns (time-of-day + day-of-week curves)
 *        - Deterministic seeded noise (stable results per call on the same day)
 *
 * REGULATORY CONTEXT
 * ------------------
 * Congestion points correspond to physical grid nodes where transmission capacity
 * is constrained. Trading capacity at these points is regulated under the ACM
 * congestion service provider framework (April 2024) and the Energiewet (2026).
 * The severity levels (GREEN/AMBER/RED) map to:
 *   GREEN  — capacity available, no waiting list
 *   AMBER  — approaching congestion, limited capacity
 *   RED    — congested, active waiting list in effect
 *
 * PRODUCTION ROADMAP
 * ------------------
 * MVP:  Rule-based forecast (this file), manually seeded severity data
 * v2:   Live DSO API integration (TenneT/Liander/Stedin/Enexis USEF feeds)
 * v3:   ML-based forecast (LSTM + gradient boosting on historical telemetry)
 */

import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import * as fs from 'fs';
import * as path from 'path';

export const congestionRouter = Router();

// Load named forecast scenarios from mock data (used for UI scenario selector)
const forecastPath = path.join(__dirname, '../../../mock-data/forecast-scenarios.json');
const forecastScenarios = JSON.parse(fs.readFileSync(forecastPath, 'utf-8'));

// ─── GET /api/congestion/points ───────────────────────────────────────────────

/**
 * Returns all congestion points with live enrichment data.
 *
 * Each point is enriched with:
 *   - active_scu_count: number of ACTIVE SCU listings currently available at this point
 *   - last_clearing_price_cents: price from the most recent settled trade (price discovery)
 *   - last_cleared_at: timestamp of that last trade
 *
 * Points are ordered RED → AMBER → GREEN (worst congestion first), then alphabetically.
 * This ordering matches how traders would prioritise — worst points have the most
 * urgency and typically the highest clearing prices.
 *
 * Query params:
 *   - severity: filter by 'GREEN' | 'AMBER' | 'RED'
 *   - operator: filter by grid operator name (e.g. 'Liander', 'Stedin')
 *
 * NOTE: The last clearing price lookup runs one query per congestion point (N+1 pattern).
 * At the current scale (10 points) this is acceptable. At 100+ points, this should
 * be replaced with a single aggregation query or a materialised view.
 */
congestionRouter.get('/points', requireAuth, async (req, res, next) => {
  try {
    const { severity, operator } = req.query;

    // Build dynamic filter — only add fields that were provided
    const where: Record<string, unknown> = {};
    if (severity) where.severity = severity;
    if (operator) where.operator = operator;

    const points = await prisma.congestionPoint.findMany({
      where,
      include: {
        // Count only ACTIVE SCUs — matched/withdrawn listings don't represent available capacity
        _count: { select: { scus: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [
        { severity: 'desc' }, // RED > AMBER > GREEN (Postgres enum sort order)
        { name: 'asc' },
      ],
    });

    // Enrich each point with the last settled trade price for price discovery
    const pointsWithPricing = await Promise.all(
      points.map(async (point: typeof points[0]) => {
        const lastTrade = await prisma.trade.findFirst({
          where: {
            scu: { congestion_point_id: point.id },
            status: 'SETTLED', // only completed trades reflect real market prices
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
  } catch (err) { next(err); }
});

// ─── GET /api/congestion/points/:id ──────────────────────────────────────────

/**
 * Returns detailed data for a single congestion point.
 *
 * Used by the map sidebar and SCU detail pages to show:
 *   - active_scus: all current listings at this point (ordered by ask price ascending
 *     so buyers see the cheapest capacity first)
 *   - price_history: last 10 settled trade prices, chronological order
 *     (used to render the price discovery chart on the map)
 *
 * The two DB queries (active SCUs + price history) run in parallel via Promise.all
 * to minimise response latency.
 */
congestionRouter.get('/points/:id', requireAuth, async (req, res, next) => {
  try {
    const point = await prisma.congestionPoint.findUnique({
      where: { id: req.params.id },
    });
    if (!point) throw new NotFoundError('Congestion point');

    // Run both enrichment queries in parallel — independent data, no need to sequence
    const [activeScus, priceHistory] = await Promise.all([
      prisma.scu.findMany({
        where: { congestion_point_id: point.id, status: 'ACTIVE' },
        include: {
          // Include enough seller data for the UI to show the delivery score indicator
          company: { select: { id: true, name: true, delivery_score: true } },
        },
        orderBy: { ask_price_cents: 'asc' }, // cheapest first for buyers
      }),
      prisma.trade.findMany({
        where: {
          scu: { congestion_point_id: point.id },
          status: 'SETTLED', // only real completed trades for price discovery
        },
        orderBy: { matched_at: 'desc' },
        take: 10, // last 10 trades is sufficient for the price chart
        select: {
          id: true,
          clearing_price_cents: true,
          mwh_amount: true,
          matched_at: true,
        },
      }),
    ]);

    res.json({
      ...point,
      active_scus: activeScus,
      price_history: priceHistory.reverse(), // return chronological (oldest first)
    });
  } catch (err) { next(err); }
});

// ─── Forecast model helpers ───────────────────────────────────────────────────

/** Severity type mirroring the Prisma enum */
type Severity = 'GREEN' | 'AMBER' | 'RED';

/**
 * Numeric rank for severity — used for arithmetic comparisons and array indexing.
 * Higher rank = worse congestion.
 */
const SEV_RANK: Record<Severity, number> = { GREEN: 0, AMBER: 1, RED: 2 };

/** Reverse lookup: rank → severity label */
const SEV_LIST: Severity[] = ['GREEN', 'AMBER', 'RED'];

/**
 * Returns a demand multiplier (0.0–1.0) based on time of day and day of week.
 *
 * Modelled on real Dutch industrial electricity demand patterns:
 *   - Peak hours (10:00–16:00 weekdays): multiplier = 1.0 (maximum demand)
 *   - Morning ramp (07:00–09:00): multiplier = 0.85 (factories starting up)
 *   - Evening wind-down (17:00–20:00): multiplier = 0.80
 *   - Shoulder hours (05:00–06:00): multiplier = 0.55 (overnight to morning)
 *   - Night (21:00–04:00): multiplier = 0.35 (minimal industrial activity)
 *   - Weekends: all values reduced by 35% (lower industrial activity)
 *
 * Source: demand curve approximated from TenneT Security of Supply Monitor 2025.
 *
 * @param hour - Hour of day (0–23) in local time
 * @param dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 * @returns Demand multiplier between 0.0 and 1.0
 */
function demandMultiplier(hour: number, dayOfWeek: number): number {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekendDiscount = isWeekend ? 0.65 : 1.0;

  let base: number;
  if (hour >= 7 && hour <= 9)        base = 0.85; // morning ramp
  else if (hour >= 10 && hour <= 16) base = 1.0;  // peak industrial hours
  else if (hour >= 17 && hour <= 20) base = 0.80; // evening wind-down
  else if (hour >= 21 || hour <= 4)  base = 0.35; // night (minimal activity)
  else                               base = 0.55; // shoulder (05:00–06:00)

  return base * weekendDiscount;
}

/**
 * Produces a deterministic pseudo-random number in [0, 1) from a string seed.
 *
 * Uses the djb2-style hash function (Bernstein hash). The seed includes the
 * congestion point ID, hour offset, and date string — so the same forecast
 * request on the same day always returns identical results (stable/consistent
 * for the user), but results change day-to-day (realistic variation).
 *
 * This replaces Math.random() to avoid flickering charts on repeated API calls.
 *
 * @param seed - Arbitrary string to hash
 * @returns Pseudo-random float in [0, 1)
 */
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    // Bernstein hash: h = 31 * h + charCode (with 32-bit integer overflow)
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h % 1000) / 1000;
}

/**
 * Computes the predicted severity and confidence for a single forecast bucket.
 *
 * MODEL LOGIC
 * -----------
 * The model expresses severity as a numeric rank (0=GREEN, 1=AMBER, 2=RED)
 * and calculates a net pressure score that shifts the rank up or down:
 *
 *   rawRank = baseRank + demand + demandPressure - supplyRelief - 0.3 + noise
 *
 * Where:
 *   baseRank       = current DB severity rank (the anchor)
 *   demand         = time-of-day multiplier (0.35–1.0)
 *   demandPressure = recent trade volume signal (capped at 0.4)
 *   supplyRelief   = active SCU count signal — more sellers ease congestion (capped at 0.4)
 *   -0.3           = base offset so neutral conditions don't push RED points higher
 *   noise          = seeded ±0.15 variation for natural-looking variation
 *
 * The result is clamped to [0, 2] and rounded to the nearest integer rank.
 *
 * CONFIDENCE MODEL
 * ----------------
 * Confidence starts at 95% and decays 2.5% per hour into the future (time decay).
 * It is boosted slightly by data richness (more SCUs and trades = better signal).
 * Minimum confidence floor: 55% (we never claim more certainty than we have).
 *
 * @param baseRank - Current severity rank from DB (0=GREEN, 1=AMBER, 2=RED)
 * @param hourOffset - Hours into the future for this bucket
 * @param activeScuCount - Number of active SCU listings at this point
 * @param recentTradeVolume - Number of trades in the last 48h at this point
 * @param now - Reference time for calculating future timestamps
 * @param pointId - Congestion point ID (used in seeded noise key)
 * @returns Predicted severity and confidence score [0, 1]
 */
function forecastSeverity(
  baseRank: number,
  hourOffset: number,
  activeScuCount: number,
  recentTradeVolume: number,
  now: Date,
  pointId: string,
): { severity: Severity; confidence: number } {
  // Calculate the actual future time for this bucket
  const futureTime = new Date(now.getTime() + hourOffset * 3600000);
  const hour = futureTime.getHours();
  const dow = futureTime.getDay();

  const demand = demandMultiplier(hour, dow);

  // More active SCU listings = more sellers offering capacity = mild relief signal
  const supplyRelief = Math.min(0.4, activeScuCount * 0.05);

  // More recent trades = higher market activity = demand pressure on the grid
  const demandPressure = Math.min(0.4, recentTradeVolume * 0.08);

  // Net pressure: positive = worsening, negative = improving
  const netPressure = demand + demandPressure - supplyRelief - 0.3;

  // Deterministic noise — stable per (point, hour, date) so repeated calls return
  // the same result, but variation differs across days
  const dateKey = `${pointId}-${hourOffset}-${now.toDateString()}`;
  const noise = (seededRandom(dateKey) - 0.5) * 0.3; // ±0.15 range

  // Clamp to valid rank range and convert back to severity label
  const rawRank = baseRank + netPressure + noise;
  const clampedRank = Math.max(0, Math.min(2, Math.round(rawRank)));
  const severity = SEV_LIST[clampedRank];

  // Confidence decays with forecast horizon; richer data slightly boosts confidence
  const timeDecay = Math.max(0.55, 0.95 - hourOffset * 0.025);
  const dataBoost = Math.min(0.1, (activeScuCount + recentTradeVolume) * 0.01);
  const confidence = Math.min(0.97, timeDecay + dataBoost);

  return { severity, confidence };
}

// ─── GET /api/congestion/forecast ────────────────────────────────────────────

/**
 * Returns a 24-hour congestion severity forecast for all grid points.
 *
 * RESPONSE STRUCTURE
 * ------------------
 * {
 *   generated_at: ISO timestamp,
 *   model: 'rule_based_v2',
 *   interval_hours: 2,       // one bucket per 2 hours
 *   horizon_hours: 24,       // 12 buckets total
 *   forecast: [
 *     {
 *       congestion_point_id, code, name, current_severity,
 *       forecast_buckets: [{ hour_offset, predicted_severity, confidence }, ...],
 *       insights: {
 *         peak_hour_offset,     // when worst congestion is expected
 *         peak_severity,
 *         improving_from_hour,  // when congestion first starts improving (or null)
 *         active_scu_count,     // inputs used by the model (transparency)
 *         recent_trade_count,
 *       }
 *     }, ...
 *   ]
 * }
 *
 * PERFORMANCE
 * -----------
 * The forecast endpoint runs two aggregation queries (SCU counts, recent trades)
 * that cover all congestion points in a single round-trip each. The per-point
 * forecast computation is CPU-only (no additional DB queries). This keeps the
 * endpoint at O(1) DB queries regardless of how many points exist.
 *
 * ORDERING
 * --------
 * Results are sorted by current_severity DESC (worst first) so the UI can
 * immediately display the most critical points without client-side sorting.
 */
congestionRouter.get('/forecast', requireAuth, async (_req, res, next) => {
  try {
    const now = new Date();

    // Fetch all congestion points (minimal fields — we don't need full records)
    const points = await prisma.congestionPoint.findMany({
      select: { id: true, code: true, name: true, severity: true },
    });

    // Batch-load market signals for all points in two queries (not N queries)
    const [scuCounts, recentTrades] = await Promise.all([
      // Supply signal: active SCU count per congestion point
      prisma.scu.groupBy({
        by: ['congestion_point_id'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
      }),
      // Demand signal: trades in the last 48 hours
      // 48h window captures recent market activity without stale data bias
      prisma.trade.findMany({
        where: {
          matched_at: { gte: new Date(now.getTime() - 48 * 3600000) },
          status: { in: ['ACTIVE', 'SETTLED'] }, // exclude cancelled/disputed
        },
        include: { scu: { select: { congestion_point_id: true } } },
      }),
    ]);

    // Convert array results to O(1) lookup maps keyed by congestion_point_id
    const scuCountMap = Object.fromEntries(
      scuCounts.map((r: { congestion_point_id: string; _count: { id: number } }) =>
        [r.congestion_point_id, r._count.id]
      )
    );

    // Count trades per congestion point
    const tradeVolumeMap: Record<string, number> = {};
    for (const trade of recentTrades) {
      const cpId = trade.scu?.congestion_point_id;
      if (cpId) tradeVolumeMap[cpId] = (tradeVolumeMap[cpId] ?? 0) + 1;
    }

    // Forecast parameters
    const BUCKETS = 12;     // number of time buckets
    const INTERVAL_H = 2;   // hours between each bucket → 12 × 2h = 24h horizon

    const forecast = points.map((point: typeof points[0]) => {
      const baseRank = SEV_RANK[point.severity as Severity];
      const activeScus = scuCountMap[point.id] ?? 0;
      const tradeVolume = tradeVolumeMap[point.id] ?? 0;

      // Generate one bucket per interval across the 24h horizon
      const buckets = Array.from({ length: BUCKETS }, (_, i) => {
        const hourOffset = i * INTERVAL_H;
        const { severity, confidence } = forecastSeverity(
          baseRank, hourOffset, activeScus, tradeVolume, now, point.id
        );
        return { hour_offset: hourOffset, predicted_severity: severity, confidence };
      });

      // Derive actionable insights from the bucket array
      const worstBucket = buckets.reduce((w, b) =>
        SEV_RANK[b.predicted_severity] > SEV_RANK[w.predicted_severity] ? b : w
      );

      // First bucket where severity improves relative to the previous bucket
      const improvingFrom = buckets.findIndex((b, i) =>
        i > 0 && SEV_RANK[b.predicted_severity] < SEV_RANK[buckets[i - 1].predicted_severity]
      );

      return {
        congestion_point_id: point.id,
        code: point.code,
        name: point.name,
        current_severity: point.severity,
        forecast_buckets: buckets,
        // Insights allow the frontend to surface actionable summaries
        // ("peak congestion at +4h", "improving from +10h") without re-computing
        insights: {
          peak_hour_offset: worstBucket.hour_offset,
          peak_severity: worstBucket.predicted_severity,
          improving_from_hour: improvingFrom >= 0 ? buckets[improvingFrom].hour_offset : null,
          active_scu_count: activeScus,     // model input transparency
          recent_trade_count: tradeVolume,  // model input transparency
        },
      };
    });

    // Sort worst-severity points first for immediate visual priority in the UI
    forecast.sort((a: typeof forecast[0], b: typeof forecast[0]) =>
      SEV_RANK[b.current_severity as Severity] - SEV_RANK[a.current_severity as Severity]
    );

    res.json({
      generated_at: now.toISOString(),
      model: 'rule_based_v2',
      interval_hours: INTERVAL_H,
      horizon_hours: BUCKETS * INTERVAL_H,
      note: 'Rule-based forecast using demand patterns, SCU supply, and trade volume. ML model (LSTM) planned for v3.',
      scenarios: forecastScenarios,
      forecast,
    });
  } catch (err) { next(err); }
});