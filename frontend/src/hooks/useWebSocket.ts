'use client'

import { useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { Trade, Bid, CongestionPoint } from '@/types'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000'

export function useWebSocket() {
  const { token, isAuthenticated } = useAuthStore()
  const { addNotification, addRecentTrade, markScuUpdated, updateCongestionPoint } =
    useMarketplaceStore()
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!isAuthenticated || !token) return

    const socket = io(WS_URL, {
      path: '/ws',
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[WS] connected')
    })

    socket.on('disconnect', () => {
      console.log('[WS] disconnected')
    })

    socket.on('trade:matched', (trade: Trade) => {
      addRecentTrade(trade)
      markScuUpdated(trade.scu_id)
      addNotification({
        type: 'success',
        title: 'Trade matched!',
        message: `Your SCU was matched at €${(trade.clearing_price_cents / 100).toFixed(2)}`,
      })
    })

    socket.on('bid:lost', (bid: Bid) => {
      markScuUpdated(bid.scu_id)
      addNotification({
        type: 'info',
        title: 'Bid not matched',
        message: 'A higher bid won this round. You can place a new bid.',
      })
    })

    socket.on('settlement:update', (data: { trade_id: string; status: string }) => {
      addNotification({
        type: 'info',
        title: 'Settlement update',
        message: `Settlement status changed to ${data.status}`,
      })
    })

    socket.on('congestion:update', (data: Partial<CongestionPoint> & { id: string }) => {
      const { id, ...updates } = data
      updateCongestionPoint(id, updates)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated, token])

  return socketRef
}