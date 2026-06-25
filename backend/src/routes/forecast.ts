import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import * as fs from 'fs';
import * as path from 'path';

export const forecastRouter = Router();

// Load mock data once at startup
const priceHistory: any[] = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), '../mock-data/price-history.json'), 'utf-8')
);

// GET /api/forecast
forecastRouter.get('/', requireAuth, (_req, res) => {
  const summary = priceHistory.map(pt => ({
    congestion_point_id: pt.congestion_point_id,
    stats: pt.stats,
    history: pt.history.slice(-30),
    forecast: pt.forecast,
  }));
  res.json({ generated_at: new Date().toISOString(), data: summary });
});

// GET /api/forecast/:id
forecastRouter.get('/:id', requireAuth, (req, res, next) => {
  const pt = priceHistory.find(p => p.congestion_point_id === req.params.id);
  if (!pt) return next(new NotFoundError('Forecast data for this congestion point'));
  const days = Math.min(90, Math.max(7, parseInt((req.query.range as string) ?? '30', 10)));
  res.json({
    generated_at: new Date().toISOString(),
    congestion_point_id: pt.congestion_point_id,
    stats: pt.stats,
    history: pt.history.slice(-days),
    forecast: pt.forecast,
  });
});