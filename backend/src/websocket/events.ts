/**
 * GridSlot WebSocket Event System
 * Built on Socket.io. Authentication via JWT on connection.
 *
 * Events:
 *   Server → Client:
 *     trade:matched      — A bid you placed or an SCU you listed was matched
 *     bid:lost           — A bid you placed lost the auction
 *     settlement:update  — A settlement you're party to changed status
 *     congestion:update  — A congestion point's severity changed (broadcast)
 */

import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../middleware/auth.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TradeMatchedEvent {
  trade_id: string;
  scu_id: string;
  clearing_price_cents: number;
  seller_id: string;
  buyer_id: string;
}

export interface BidLostEvent {
  bid_id: string;
  scu_id: string;
  reason: 'outbid' | 'scu_withdrawn' | 'scu_expired';
  company_id: string;
}

export interface SettlementUpdateEvent {
  settlement_id: string;
  new_status: string;
  timestamp?: string;
}

export interface CongestionUpdateEvent {
  point_id: string;
  severity: 'GREEN' | 'AMBER' | 'RED';
  timestamp: string;
}

// ─── Socket.io setup ──────────────────────────────────────────────────────────

let io: SocketServer | null = null;

// Map of company_id → socket IDs for targeted delivery
const companySocketMap = new Map<string, Set<string>>();

export function initWebSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  // ── JWT authentication on connection ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) return next(new Error('Server configuration error'));

      const payload = jwt.verify(token, secret) as JwtPayload;
      socket.data.companyId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const companyId = socket.data.companyId as string;

    // Register socket for this company
    if (!companySocketMap.has(companyId)) {
      companySocketMap.set(companyId, new Set());
    }
    companySocketMap.get(companyId)!.add(socket.id);

    // Join company-specific room for targeted events
    void socket.join(`company:${companyId}`);

    socket.on('disconnect', () => {
      const sockets = companySocketMap.get(companyId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) companySocketMap.delete(companyId);
      }
    });
  });

  console.warn('🔌 WebSocket server initialised');
  return io;
}

// ─── Event emitters ───────────────────────────────────────────────────────────

/**
 * Emit an event to a specific company (all their connected sockets).
 */
export function emitToCompany(companyId: string, event: string, payload: unknown): void {
  io?.to(`company:${companyId}`).emit(event, payload);
}

/**
 * Broadcast an event to all connected clients.
 */
export function broadcast(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

/**
 * Generic event emitter — routes to the right company based on payload.
 * Used by matching engine and settlement checker.
 */
export function emitEvent(event: string, payload: unknown): void {
  const p = payload as Record<string, unknown>;

  switch (event) {
    case 'trade:matched': {
      const e = payload as TradeMatchedEvent;
      emitToCompany(e.seller_id, event, payload);
      emitToCompany(e.buyer_id, event, payload);
      break;
    }
    case 'bid:lost': {
      const e = payload as BidLostEvent;
      emitToCompany(e.company_id, event, payload);
      break;
    }
    case 'settlement:update': {
      // settlement:update is sent by settlement service which includes company IDs separately
      if (p.seller_id) emitToCompany(p.seller_id as string, event, payload);
      if (p.buyer_id) emitToCompany(p.buyer_id as string, event, payload);
      break;
    }
    case 'congestion:update':
      broadcast(event, payload);
      break;
    default:
      broadcast(event, payload);
  }
}
