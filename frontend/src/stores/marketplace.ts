import { create } from 'zustand'
import type { Scu, Trade, Bid, CongestionPoint } from '@/types'

interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
  timestamp: number
}

interface MarketplaceState {
  // Real-time notifications
  notifications: Notification[]
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void

  // Live data patches from WebSocket
  updatedScuIds: Set<string>
  markScuUpdated: (id: string) => void
  clearScuUpdated: (id: string) => void

  // Congestion points cache
  congestionPoints: CongestionPoint[]
  setCongestionPoints: (points: CongestionPoint[]) => void
  updateCongestionPoint: (id: string, updates: Partial<CongestionPoint>) => void

  // Recent matched trades (for dashboard feed)
  recentTrades: Trade[]
  addRecentTrade: (trade: Trade) => void
}

export const useMarketplaceStore = create<MarketplaceState>()((set) => ({
  notifications: [],
  addNotification: (n) => {
    const id = Math.random().toString(36).slice(2)
    const notification: Notification = { ...n, id, timestamp: Date.now() }
    set((s) => ({ notifications: [notification, ...s.notifications].slice(0, 5) }))
    // Auto-dismiss after 6s
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) }))
    }, 6000)
  },
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  updatedScuIds: new Set(),
  markScuUpdated: (id) =>
    set((s) => ({ updatedScuIds: new Set([...s.updatedScuIds, id]) })),
  clearScuUpdated: (id) =>
    set((s) => {
      const next = new Set(s.updatedScuIds)
      next.delete(id)
      return { updatedScuIds: next }
    }),

  congestionPoints: [],
  setCongestionPoints: (points) => set({ congestionPoints: points }),
  updateCongestionPoint: (id, updates) =>
    set((s) => ({
      congestionPoints: s.congestionPoints.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    })),

  recentTrades: [],
  addRecentTrade: (trade) =>
    set((s) => ({ recentTrades: [trade, ...s.recentTrades].slice(0, 10) })),
}))
