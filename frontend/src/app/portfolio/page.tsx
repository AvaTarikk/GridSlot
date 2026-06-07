'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { SettlementTracker } from '@/components/settlement/SettlementTracker'
import { scus as scusApi, bids as bidsApi, trades as tradesApi, settlements as settlementsApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { Scu, Bid, Trade } from '@/types'
import {
  formatEuros,
  formatDateTime,
  formatRelative,
  formatTimeWindow,
  scuStatusLabel,
  scuStatusColor,
  tradeStatusLabel,
  bidStatusColor,
  cn,
} from '@/lib/utils'

type Tab = 'listings' | 'bids' | 'trades'

export default function PortfolioPage() {
  const { company } = useAuthStore()
  const { addNotification } = useMarketplaceStore()

  const [tab, setTab] = useState<Tab>('listings')
  const [myScus, setMyScus] = useState<Scu[]>([])
  const [myBids, setMyBids] = useState<Bid[]>([])
  const [myTrades, setMyTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      scusApi.list({ limit: 100 }),
      bidsApi.list({ limit: 100 }),
      tradesApi.list({ limit: 100 }),
    ])
      .then(([s, b, t]) => {
        setMyScus(s.data)
        setMyBids(b.data)
        setMyTrades(t.data)
      })
      .finally(() => setLoading(false))
  }, [])

  async function handleConfirmDelivery(settlementId: string) {
    setConfirmingId(settlementId)
    try {
      await settlementsApi.confirmDelivery(settlementId)
      addNotification({ type: 'success', title: 'Delivery confirmed', message: 'Settlement will complete shortly.' })
      const updated = await tradesApi.list({ limit: 100 })
      setMyTrades(updated.data)
    } catch (err: unknown) {
      addNotification({ type: 'error', title: 'Confirmation failed', message: (err as Error).message })
    } finally {
      setConfirmingId(null)
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'listings', label: 'My SCUs', count: myScus.length },
    { key: 'bids', label: 'My Bids', count: myBids.length },
    { key: 'trades', label: 'Trades & Settlements', count: myTrades.length },
  ]

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-white">Portfolio</h1>
          <p className="text-slate-400 text-sm mt-1">Your capacity listings, bids, and settlement history.</p>
        </div>

        <div className="flex gap-1 bg-surface-2 p-1 rounded-xl mb-6 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.key ? 'bg-surface-4 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t.label}
              <span className={cn('ml-2 text-xs', tab === t.key ? 'text-slate-400' : 'text-slate-600')}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="card px-5 py-4 h-16" />)}
          </div>
        ) : (
          <>
            {tab === 'listings' && (
              <div className="space-y-3">
                {myScus.length === 0 && (
                  <div className="card px-5 py-12 text-center">
                    <p className="text-slate-400">No SCUs listed yet.</p>
                    <a href="/marketplace" className="btn-primary text-sm mt-4 inline-block">List your first SCU →</a>
                  </div>
                )}
                {myScus.map((scu) => (
                  <div key={scu.id} className="card px-5 py-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-white truncate">
                            {scu.congestion_point?.name ?? 'Unknown point'}
                          </p>
                          <span className={cn('text-xs font-medium', scuStatusColor[scu.status])}>
                            {scuStatusLabel[scu.status]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-mono">
                          {formatTimeWindow(scu.start_time ?? scu.time_window_start, scu.end_time ?? scu.time_window_end)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-white tabular">
                          {formatEuros(scu.ask_price_cents)}<span className="text-slate-500 font-normal">/MWh</span>
                        </p>
                        <p className="text-xs text-slate-500">{scu.mwh ?? scu.mwh_amount} MWh</p>
                      </div>
                      {scu.status === 'ACTIVE' && (
                        <a href={`/marketplace/${scu.id}`} className="btn-secondary text-xs shrink-0">View</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'bids' && (
              <div className="space-y-3">
                {myBids.length === 0 && (
                  <div className="card px-5 py-12 text-center">
                    <p className="text-slate-400">No bids placed yet.</p>
                    <a href="/marketplace" className="btn-primary text-sm mt-4 inline-block">Browse marketplace →</a>
                  </div>
                )}
                {myBids.map((bid) => (
                  <div key={bid.id} className="card px-5 py-4">
                    <div className="flex items-center gap-4">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', bidStatusColor[bid.status])} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-white tabular font-medium">{formatEuros(bid.price_cents)}</p>
                          <span className="text-xs text-slate-500 capitalize">{bid.status.toLowerCase()}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {bid.scu?.congestion_point?.name ?? `SCU #${bid.scu_id.slice(-8).toUpperCase()}`}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-600">{formatRelative(bid.created_at)}</div>
                      {bid.status === 'OPEN' && (
                        <a href={`/marketplace/${bid.scu_id}`} className="btn-secondary text-xs">View SCU</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'trades' && (
              <div className="space-y-5">
                {myTrades.length === 0 && (
                  <div className="card px-5 py-12 text-center">
                    <p className="text-slate-400">No trades yet.</p>
                  </div>
                )}
                {myTrades.map((trade) => {
                  const isBuyer = trade.buyer_id === company?.id
                  return (
                    <div key={trade.id} className="card p-5 space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full',
                              isBuyer ? 'bg-grid-500/15 text-grid-400' : 'bg-emerald-500/15 text-emerald-400'
                            )}>
                              {isBuyer ? 'Bought' : 'Sold'}
                            </span>
                            <p className="text-sm font-medium text-white tabular">
                              {formatEuros(trade.clearing_price_cents)}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500">
                            Trade #{trade.id.slice(-8).toUpperCase()} · {formatDateTime(trade.created_at ?? trade.matched_at)}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">{tradeStatusLabel[trade.status]}</span>
                      </div>

                      {trade.settlement && (
                        <div className="pt-4 border-t border-white/5">
                          <p className="text-xs text-slate-500 mb-4">Settlement progress</p>
                          <SettlementTracker
                            status={trade.settlement.status}
                            onConfirmDelivery={
                              !isBuyer && trade.settlement.status === 'DELIVERY_PENDING'
                                ? () => handleConfirmDelivery(trade.settlement!.id)
                                : undefined
                            }
                            isConfirming={confirmingId === trade.settlement.id}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
