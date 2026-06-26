/**
 * @file forecast.ts
 * @description Price forecasting routes for the GridSlot API.
 *
 * REPLACES: the previous implementation read a static `mock-data/price-history.json`
 * file and returned its `forecast` array verbatim — there was no actual model behind
 * it, which is why every congestion point produced visually identical, monotonically
 * decaying forecasts regardless of real severity or trend.
 *
 * NOW: a real statistical model (services/forecast.service.ts) runs:
 *   1. day-of-week seasonal decomposition
 *   2. OLS trend estimation over the deseasonalized series
 *   3. Holt-style level smoothing
 *   4. confidence intervals from in-sample residual variance, widened by √horizon
 *   5. tercile-based severity classification
 *
 * DATA SOURCE (hybrid, by design):
 * The platform's actual Trade table only contains the last ~4 days of demo
 * trades (seed-rich.ts seeds 5 trades total spanning h(-96) to h(0), only one
 * of which is SETTLED) — nowhere near enough distinct trading days to fit a
 * seasonal/trend model. The only place ~90 days of realistic daily price
 * history exists is mock-data/price-history.json.
 *
 * So: this route tries the database first (real SETTLED trades, aggregated
 * to one volume-weighted observation per day). If a congestion point has at
 * least MIN_HISTORY_DAYS of real trading history, that's what gets used —
 * meaning as the platform accumulates genuine trade activity, forecasts
 * transition to live data with zero code changes required. Until then, it
 * falls back to the seeded mock history file. Every response reports which
 * source was used via `data_source: 'live' | 'mock'` so the frontend (and
 * anyone reviewing this for the thesis) can see exactly what's backing each
 * forecast — never silently presenting demo data as if it were real.
 */

import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { forecastCongestionPoint, type HistoryPoint, type AnnotatedHistoryPoint } from '../services/forecast.service';

export const forecastRouter = Router();

const MIN_HISTORY_DAYS = 14;

// ─── Mock fallback data ────────────────────────────────────────────────────────

interface MockPriceHistoryEntry {
  congestion_point_id: string;
  history: Array<{
    date: string;
    clearing_price_cents: number;
    volume_mwh: number;
    trade_count: number;
  }>;
}

let mockHistoryByPoint: Map<string, HistoryPoint[]> | null = null;

function loadMockHistory(): Map<string, HistoryPoint[]> {
  if (mockHistoryByPoint) return mockHistoryByPoint;

  const mockPath = path.join(__dirname, '../../../mock-data/price-history.json');
  const raw: MockPriceHistoryEntry[] = JSON.parse(fs.readFileSync(mockPath, 'utf-8'));

  mockHistoryByPoint = new Map(
    raw.map((entry) => [
      entry.congestion_point_id,
      entry.history.map((h) => ({
        date: h.date,
        clearing_price_cents: h.clearing_price_cents,
        volume_mwh: h.volume_mwh,
        trade_count: h.trade_count,
      })),
    ])
  );

  return mockHistoryByPoint;
}

/**
 * Loads daily-aggregated settled-trade history for a single congestion point
 * from the real database.
 *
 * Aggregation: for each calendar day with at least one SETTLED trade at this
 * point, computes the volume-weighted average clearing price (so a single
 * large trade doesn't get equal weight to a single small one), total MWh
 * traded, and trade count. Days with zero trades are NOT included as
 * synthetic zero-price entries — the seasonal/trend model expects a real
 * price signal per observation, so gap days are dropped rather than
 * zero-filled (zero-filling would corrupt both the trend and seasonal
 * estimates with fake low prices).
 */
async function loadLiveHistory(congestionPointId: string): Promise<HistoryPoint[]> {
  const trades = await prisma.trade.findMany({
    where: {
      scu: { congestion_point_id: congestionPointId },
      status: 'SETTLED',
    },
    select: {
      clearing_price_cents: true,
      mwh_amount: true,
      matched_at: true,
    },
    orderBy: { matched_at: 'asc' },
  });

  const byDay = new Map<string, { priceWeightedSum: number; volume: number; count: number }>();

  for (const t of trades) {
    const day = t.matched_at.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { priceWeightedSum: 0, volume: 0, count: 0 };
    entry.priceWeightedSum += t.clearing_price_cents * t.mwh_amount;
    entry.volume += t.mwh_amount;
    entry.count += 1;
    byDay.set(day, entry);
  }

  return Array.from(byDay.entries())
    .map(([date, agg]) => ({
      date,
      clearing_price_cents: Math.round(agg.priceWeightedSum / agg.volume),
      volume_mwh: agg.volume,
      trade_count: agg.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Resolves the best available history for a congestion point: real trade
 * data if there's enough of it, otherwise the seeded mock series. Always
 * reports which source was used.
 */
async function resolveHistory(
  congestionPointId: string
): Promise<{ history: HistoryPoint[]; source: 'live' | 'mock' }> {
  const live = await loadLiveHistory(congestionPointId);
  if (live.length >= MIN_HISTORY_DAYS) {
    return { history: live, source: 'live' };
  }

  const mock = loadMockHistory().get(congestionPointId) ?? [];
  return { history: mock, source: 'mock' };
}

// ─── GET /api/forecast ────────────────────────────────────────────────────────

/**
 * Returns a forecast summary for every congestion point that has enough
 * settled-trade history to fit the model. Points with fewer than
 * MIN_HISTORY_DAYS days of distinct trading days are skipped (rather than
 * returning a misleadingly confident forecast off near-empty data) and
 * reported in `skipped` so the frontend/dashboard can surface that
 * distinction instead of silently showing nothing.
 */
forecastRouter.get('/', requireAuth, async (_req, res, next) => {
  try {
    const points = await prisma.congestionPoint.findMany({
      select: { id: true, code: true, name: true },
    });

    const results: Array<{
      congestion_point_id: string;
      code: string;
      name: string;
      data_source: 'live' | 'mock';
      stats: ReturnType<typeof forecastCongestionPoint>['stats'];
      history: AnnotatedHistoryPoint[];
      forecast: ReturnType<typeof forecastCongestionPoint>['forecast'];
      model_diagnostics: ReturnType<typeof forecastCongestionPoint>['model_diagnostics'];
    }> = [];
    const skipped: Array<{ congestion_point_id: string; name: string; days_available: number }> = [];

    for (const point of points) {
      const { history, source } = await resolveHistory(point.id);
      if (history.length < MIN_HISTORY_DAYS) {
        skipped.push({ congestion_point_id: point.id, name: point.name, days_available: history.length });
        continue;
      }
      const { stats, forecast, model_diagnostics, history: annotatedHistory } = forecastCongestionPoint(history);
      results.push({
        congestion_point_id: point.id,
        code: point.code,
        name: point.name,
        data_source: source,
        stats,
        history: annotatedHistory.slice(-30),
        forecast,
        model_diagnostics,
      });
    }

    res.json({
      generated_at: new Date().toISOString(),
      data: results,
      skipped,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/forecast/:id ────────────────────────────────────────────────────

/**
 * Returns the forecast for a single congestion point.
 *
 * Query params:
 *   - range: number of trailing history days to include in the response
 *     (7-90, default 30). Note this only trims how much HISTORY is returned
 *     for charting — it does not change the model fit, which always uses the
 *     full available history for the most statistically stable estimate.
 *     (The previous implementation re-sliced a static forecast array per
 *     range value, which is why every range looked identical: the underlying
 *     `forecast` data never actually changed, only the history window did.)
 */
forecastRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const point = await prisma.congestionPoint.findUnique({
      where: { id: req.params.id },
      select: { id: true, code: true, name: true },
    });
    if (!point) throw new NotFoundError('Congestion point');

    const { history, source } = await resolveHistory(point.id);

    if (history.length < MIN_HISTORY_DAYS) {
      throw new AppError(
        422,
        'INSUFFICIENT_HISTORY',
        `This congestion point has only ${history.length} day(s) of trade history available ` +
          `(live or mock); at least ${MIN_HISTORY_DAYS} are required to fit a seasonal trend forecast.`
      );
    }

    const days = Math.min(90, Math.max(7, parseInt((req.query.range as string) ?? '30', 10)));
    const { stats, forecast, model_diagnostics, history: annotatedHistory } = forecastCongestionPoint(history);

    res.json({
      generated_at: new Date().toISOString(),
      congestion_point_id: point.id,
      code: point.code,
      name: point.name,
      data_source: source,
      stats,
      history: annotatedHistory.slice(-days),
      forecast,
      model_diagnostics,
    });
  } catch (err) {
    next(err);
  }
});