/**
 * GridSlot API Server
 * Express + Socket.io backend for the electricity grid capacity marketplace.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { requestLogger } from './middleware/logger.js';
import { standardLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './routes/auth.js';
import { scusRouter } from './routes/scus.js';
import { bidsRouter } from './routes/bids.js';
import { tradesRouter } from './routes/trades.js';
import { settlementsRouter } from './routes/settlements.js';
import { congestionRouter } from './routes/congestion.js';
import { internalRouter } from './routes/internal.js';
import { initWebSocket, emitEvent } from './websocket/events.js';
import { startMatchingEngine } from './services/matching-engine.js';
import { startSettlementChecker } from './services/settlement.js';

const app = express();
const httpServer = createServer(app);

// ── WebSocket ──────────────────────────────────────────────────────────────────
initWebSocket(httpServer);

// ── Global middleware ──────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use('/api', standardLimiter);

// ── Health check (no auth, no rate limit) ─────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'gridslot-api',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/scus', scusRouter);
app.use('/api/bids', bidsRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/settlements', settlementsRouter);
app.use('/api/congestion', congestionRouter);
app.use('/api/internal', internalRouter);

// ── 404 + error handlers (must be last) ───────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '4000', 10);

httpServer.listen(PORT, () => {
  console.warn(`\n🚀 GridSlot API running on http://localhost:${PORT}`);
  console.warn(`🔌 WebSocket on ws://localhost:${PORT}/ws`);
  console.warn(`🌱 Environment: ${process.env.NODE_ENV ?? 'development'}\n`);

  // Start background services (not in test environment)
  if (process.env.NODE_ENV !== 'test') {
    startMatchingEngine(emitEvent);
    startSettlementChecker(emitEvent);
  }
});

export default app;
export { httpServer };
