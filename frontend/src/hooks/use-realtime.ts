'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useToastStore } from '@/stores/toasts';
import { useAuthStore } from '@/stores/auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

interface WebSocketMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface TradeMatchedPayload {
  clearing_price_cents: number;
}

interface BidLostPayload {
  reason: 'outbid' | 'withdrawn';
}

interface SettlementUpdatePayload {
  new_status: string;
}

interface CongestionUpdatePayload {
  severity: string;
}

/**
 * Connects to the GridSlot WebSocket server and shows toast notifications
 * for real-time events: trade matched, bid lost, settlement updates.
 *
 * Drop this hook into any top-level component (e.g. AppShell).
 */
export function useRealtimeEvents() {
  const { token } = useAuthStore();
  const { add } = useToastStore();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!token || typeof window === 'undefined') return;

    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Socket.io uses HTTP upgrade — connect via the socket.io client path
    // We're using native WebSocket here for simplicity; swap for socket.io-client if needed
    const wsUrl = `${WS_URL.replace('ws://', 'ws://').replace('wss://', 'wss://')}/ws?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to GridSlot real-time feed');
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string) as WebSocketMessage;
          const { type, payload } = message;

          switch (type) {
            case 'trade:matched': {
              const typedPayload = payload as TradeMatchedPayload;
              add({
                type: 'success',
                title: 'Trade Matched!',
                message: `Clearing price: €${((typedPayload.clearing_price_cents as number) / 100).toFixed(0)}/MWh`,
              });
              break;
            }

            case 'bid:lost': {
              const typedPayload = payload as BidLostPayload;
              add({
                type: 'warning',
                title: 'Bid not selected',
                message: typedPayload.reason === 'outbid'
                  ? 'You were outbid in the last auction cycle.'
                  : 'The SCU was withdrawn.',
              });
              break;
            }

            case 'settlement:update': {
              const typedPayload = payload as SettlementUpdatePayload;
              add({
                type: 'info',
                title: 'Settlement Update',
                message: `Status changed to ${typedPayload.new_status}`,
              });
              break;
            }

            case 'congestion:update': {
              const typedPayload = payload as CongestionUpdatePayload;
              add({
                type: 'warning',
                title: 'Congestion Alert',
                message: `Severity changed to ${typedPayload.severity}`,
              });
              break;
            }

            default:
              console.debug('[WS] Unknown message type:', type);
          }
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.warn('[WS] Disconnected:', event.code, event.reason);
        socketRef.current = null;

        // Attempt reconnection if we haven't exceeded max attempts
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(`[WS] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else {
          console.error('[WS] Max reconnection attempts reached');
          add({
            type: 'error',
            title: 'Real-time connection lost',
            message: 'Unable to reconnect. Please refresh the page.',
          });
        }
      };

      return () => {
        ws.close();
        socketRef.current = null;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
    }
  }, [token, add]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);
}
