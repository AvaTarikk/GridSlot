'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { useAuthStore } from '@/stores/auth'
import { scus as scusApi, bids as bidsApi, trades as tradesApi } from '@/lib/api'
import type { Scu, Bid, Trade, PaginatedResponse } from '@/types'
import {
  formatEuros,
  formatEurosCompact,
  formatDeliveryScore,
  deliveryScoreColor,
  formatRelative,
  tradeStatusLabel,
  tradeStatusDot,
  bidStatusColor,
  cn,
} from '@/lib/utils'
import Link from 'next/link'

interface PortfolioSnapshot {
  activeListings: number
  openBids: number
  totalRevenueCents: number
  totalSpendCents: number
  recentTrades: Trade[]
  recentBids: Bid[]
}

async function fetchSnapshot(): Promise<PortfolioSnapshot> {
  const [scuRes, bidRes, tradeRes] = await Promise.all([
    scusApi.list({ status: 'ACTIVE', limit: 100 }),
    bidsApi.list({ status: 'OPEN', limit: 100 }),
    tradesApi.list({ limit: 20 }),
  ])

  const getTotal = (res: PaginatedResponse<unknown>) =>
    res.pagination?.total ?? res.total ?? res.data.length

  const settledTrades = tradeRes.data.filter((t) => t.status === 'SETTLED')

  return {
    activeListings: getTotal(scuRes),
    openBids: getTotal(bidRes),
    totalRevenueCents: settledTrades.reduce((sum, t) => sum + t.clearing_price_cents, 0),
    totalSpendCents: settledTrades.reduce((sum, t) => sum + t.clearing_price_cents, 0),
    recentTrades: tradeRes.data.slice(0, 6),
    recentBids: bidRes.data.slice(0, 6),
  }
}

function StatCard({ label, value, sub, accent }: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="card px-5 py-4">
      <p className="stat-label">{label}</p>
      <p className={cn('stat-value mt-2', accent)}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { company } = useAuthStore()
  const [data, setData] = useState<PortfolioSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSnapshot()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-white">
            {greeting}, {company?.name ?? '…'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">Here's your portfolio snapshot.</p>
        </div>

        {loading && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card px-5 py-4 animate-pulse">
                <div className="h-3 w-24 bg-surface-4 rounded mb-3" />
                <div className="h-7 w-20 bg-surface-4 rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="card px-5 py-4 border-red-500/20 bg-red-500/5 mb-6">
            <p className="text-sm text-red-400">Could not load dashboard: {error}</p>
            <p className="text-xs text-slate-500 mt-1">
              Is the backend running at {process.env.NEXT_PUBLIC_API_URL}?
            </p>
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-fade-in">
              <StatCard label="Active listings" value={String(data.activeListings)} sub="SCUs on market" />
              <StatCard label="Open bids" value={String(data.openBids)} sub="Pending matching" />
              <StatCard label="Revenue" value={formatEurosCompact(data.totalRevenueCents)} sub="All-time settled" accent="text-emerald-400" />
              <StatCard label="Spend" value={formatEurosCompact(data.totalSpendCents)} sub="All-time" accent="text-grid-400" />
            </div>

            {company && (
              <div className="card px-5 py-4 mb-8 flex items-center gap-6">
                <div className="shrink-0">
                  <p className="stat-label mb-1">Delivery score</p>
                  <p className={cn('font-display text-3xl font-semibold tabular', deliveryScoreColor(company.delivery_score))}>
                    {formatDeliveryScore(company.delivery_score)}
                  </p>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-surface-4 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700',
                        company.delivery_score >= 0.95 ? 'bg-congestion-low' :
                        company.delivery_score >= 0.85 ? 'bg-congestion-medium' : 'bg-congestion-high'
                      )}
                      style={{ width: `${company.delivery_score * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Affects collateral requirements and market access. Keep above 95% for full access.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6">
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <h2 className="font-medium text-sm text-white">Recent trades</h2>
                  <Link href="/portfolio" className="text-xs text-grid-400 hover:text-grid-300 transition-colors">View all →</Link>
                </div>
                <div className="divide-y divide-white/5">
                  {data.recentTrades.length === 0 && (
                    <p className="px-5 py-6 text-sm text-slate-500 text-center">No trades yet</p>
                  )}
                  {data.recentTrades.map((trade) => (
                    <div key={trade.id} className="px-5 py-3.5 flex items-center gap-3">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', tradeStatusDot[trade.status] ?? 'bg-slate-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 tabular">{formatEuros(trade.clearing_price_cents)}</p>
                        <p className="text-xs text-slate-500">{tradeStatusLabel[trade.status]}</p>
                      </div>
                      <span className="text-xs text-slate-600">{formatRelative(trade.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <h2 className="font-medium text-sm text-white">Recent bids</h2>
                  <Link href="/portfolio" className="text-xs text-grid-400 hover:text-grid-300 transition-colors">View all →</Link>
                </div>
                <div className="divide-y divide-white/5">
                  {data.recentBids.length === 0 && (
                    <p className="px-5 py-6 text-sm text-slate-500 text-center">No bids placed yet</p>
                  )}
                  {data.recentBids.map((bid) => (
                    <div key={bid.id} className="px-5 py-3.5 flex items-center gap-3">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', bidStatusColor[bid.status])} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 tabular">{formatEuros(bid.price_cents)}</p>
                        <p className="text-xs text-slate-500 capitalize">{bid.status.toLowerCase()}</p>
                      </div>
                      <span className="text-xs text-slate-600">{formatRelative(bid.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {(company?.role === 'SELLER' || company?.role === 'BOTH') && (
              <div className="mt-6 card px-5 py-5 flex items-center justify-between gradient-border">
                <div>
                  <p className="text-sm font-medium text-white">Got unused capacity?</p>
                  <p className="text-xs text-slate-400 mt-0.5">List an SCU and earn from idle grid access.</p>
                </div>
                <Link href="/marketplace" className="btn-primary whitespace-nowrap">List capacity</Link>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
