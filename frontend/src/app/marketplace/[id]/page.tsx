'use client'

import { useEffect, useState, useCallback, FormEvent } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { scus as scusApi, bids as bidsApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useMarketplaceStore } from '@/stores/marketplace'
import { useCountdown } from '@/hooks/useCountdown'
import type { Scu, Bid } from '@/types'
import {
  formatEuros,
  formatTimeWindow,
  formatRelative,
  congestionBg,
  congestionColor,
  congestionDot,
  cn,
  eurosToCents,
  centsToEuros,
} from '@/lib/utils'
import Link from 'next/link'

function nextMatchingCycle(): string {
  const now = new Date()
  const mins = now.getMinutes()
  const nextMin = Math.ceil((mins + 0.01) / 5) * 5
  const next = new Date(now)
  next.setMinutes(nextMin, 0, 0)
  if (next <= now) next.setMinutes(next.getMinutes() + 5)
  return next.toISOString()
}

export default function ScuDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { company } = useAuthStore()
  const { addNotification } = useMarketplaceStore()

  const [scu, setScu] = useState<Scu | null>(null)
  const [bidHistory, setBidHistory] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [bidAmount, setBidAmount] = useState('')
  const [bidLoading, setBidLoading] = useState(false)
  const [bidError, setBidError] = useState('')

  const [cycleTarget, setCycleTarget] = useState(() => nextMatchingCycle())
  const { display: countdown, expired } = useCountdown(cycleTarget)

  useEffect(() => {
    if (expired) setCycleTarget(nextMatchingCycle())
  }, [expired])

  useEffect(() => {
    Promise.all([
      scusApi.get(id),
      bidsApi.list({ scu_id: id }),
    ])
      .then(([scuData, bidsData]) => {
        setScu(scuData)
        setBidHistory(bidsData.data)
        setBidAmount(String(centsToEuros(scuData.ask_price_cents)))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const isSeller = scu?.company_id === company?.id
  const canBid = !isSeller && scu?.status === 'ACTIVE' && company?.kyb_status === 'ACTIVE'

  const mwh = scu?.mwh_amount ?? scu?.mwh ?? 0

  async function handleBid(e: FormEvent) {
    e.preventDefault()
    if (!scu) return
    setBidError('')
    setBidLoading(true)

    const priceCents = eurosToCents(Number(bidAmount))

    if (priceCents < scu.ask_price_cents) {
      setBidError(`Bid must be at least ${formatEuros(scu.ask_price_cents)} (ask price)`)
      setBidLoading(false)
      return
    }

    try {
      await bidsApi.place(scu.id, { price_cents: priceCents })
      addNotification({
        type: 'success',
        title: 'Bid placed',
        message: `${formatEuros(priceCents)} bid submitted. Matching runs in ${countdown}.`,
      })
      const updated = await bidsApi.list({ scu_id: id })
      setBidHistory(updated.data)
    } catch (err: unknown) {
      setBidError((err as Error).message)
    } finally {
      setBidLoading(false)
    }
  }

  async function handleWithdraw() {
    if (!scu) return
    try {
      await scusApi.withdraw(scu.id)
      addNotification({ type: 'info', title: 'Listing withdrawn' })
      router.push('/marketplace')
    } catch (err: unknown) {
      addNotification({ type: 'error', title: 'Could not withdraw', message: (err as Error).message })
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="px-8 py-8 max-w-4xl mx-auto space-y-4 animate-pulse">
          <div className="h-6 w-48 bg-surface-3 rounded" />
          <div className="h-48 bg-surface-2 rounded-xl" />
          <div className="h-48 bg-surface-2 rounded-xl" />
        </div>
      </AppShell>
    )
  }

  if (error || !scu) {
    return (
      <AppShell>
        <div className="px-8 py-8 max-w-4xl mx-auto">
          <p className="text-red-400">{error || 'SCU not found'}</p>
          <Link href="/marketplace" className="text-grid-400 text-sm mt-4 block">← Back to marketplace</Link>
        </div>
      </AppShell>
    )
  }

  const severity = scu.congestion_point?.severity ?? 'GREEN'

  // Bid cost breakdown
  const bidTotalCents = eurosToCents(Number(bidAmount)) * mwh
  const bidFeeCents   = Math.ceil(bidTotalCents * 10 / 10_000) // 0.1%

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-4xl mx-auto">
        <Link href="/marketplace" className="text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1.5 mb-6 transition-colors">
          ← Marketplace
        </Link>

        <div className="grid grid-cols-3 gap-6">
          {/* Main info */}
          <div className="col-span-2 space-y-5">
            <div className="card p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h1 className="font-display text-xl font-semibold text-white mb-1">
                    {scu.congestion_point?.name ?? 'SCU'}
                  </h1>
                  <p className="text-sm text-slate-400">
                    {scu.congestion_point?.operator} · SCU #{scu.id.slice(-8).toUpperCase()}
                  </p>
                </div>
                <div className={cn('badge', congestionBg[severity])}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', congestionDot[severity])} />
                  <span className={cn(congestionColor[severity])}>{severity}</span>
                </div>
              </div>

              <div className="bg-surface-3 rounded-lg px-4 py-3 font-mono text-sm text-slate-300 mb-5">
                {formatTimeWindow(scu.time_window_start ?? scu.start_time, scu.time_window_end ?? scu.end_time)}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-3 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Ask price</p>
                  <p className="font-display text-lg font-semibold text-white tabular">
                    {formatEuros(scu.ask_price_cents)}
                  </p>
                  <p className="text-[11px] text-slate-500">per MWh</p>
                </div>
                <div className="bg-surface-3 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Capacity</p>
                  <p className="font-display text-lg font-semibold text-white tabular">{mwh} MWh</p>
                  <p className="text-[11px] text-slate-500">available</p>
                </div>
                <div className="bg-surface-3 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Total value</p>
                  <p className="font-display text-lg font-semibold text-white tabular">
                    {formatEuros(scu.ask_price_cents * mwh)}
                  </p>
                  <p className="text-[11px] text-slate-500">at ask</p>
                </div>
              </div>

              {isSeller && scu.status === 'ACTIVE' && (
                <div className="mt-5 pt-5 border-t border-white/5">
                  <button onClick={handleWithdraw} className="btn-danger text-sm">
                    Withdraw listing
                  </button>
                </div>
              )}
            </div>

            {/* Bid history */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5">
                <h2 className="font-medium text-sm text-white">
                  Bid history
                  {bidHistory.length > 0 && (
                    <span className="ml-2 text-xs text-slate-500">{bidHistory.length} bids</span>
                  )}
                </h2>
              </div>

              {bidHistory.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No bids yet. Be the first.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {bidHistory.map((bid, i) => (
                    <div key={bid.id} className="px-5 py-3 flex items-center gap-3">
                      <span className="text-xs text-slate-600 w-5">{i + 1}</span>
                      <div className="flex-1">
                        <span className="text-sm text-white tabular font-medium">
                          {formatEuros(bid.price_cents)}
                        </span>
                        {bid.company?.id === company?.id && (
                          <span className="ml-2 text-[10px] text-grid-400 bg-grid-500/10 px-1.5 py-0.5 rounded">
                            Your bid
                          </span>
                        )}
                      </div>
                      <span className={cn('text-xs capitalize',
                        bid.status === 'WON' ? 'text-emerald-400' :
                        bid.status === 'LOST' ? 'text-slate-500' :
                        bid.status === 'OPEN' ? 'text-amber-400' : 'text-slate-600'
                      )}>
                        {bid.status === 'WON' ? 'Won' : bid.status === 'LOST' ? 'Lost' : bid.status === 'OPEN' ? 'Open' : bid.status.toLowerCase()}
                      </span>
                      <span className="text-xs text-slate-600">{formatRelative(bid.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="card px-4 py-4 text-center">
              <p className="text-xs text-slate-500 mb-2">Next matching cycle</p>
              <p className={cn('font-mono text-3xl font-bold tabular', expired ? 'text-amber-400 animate-pulse' : 'text-white')}>
                {countdown}
              </p>
              <p className="text-[10px] text-slate-600 mt-2">Highest bid at or above ask wins</p>
            </div>

            {canBid && (
              <form onSubmit={handleBid} className="card p-5 space-y-4">
                <h3 className="font-medium text-sm text-white">Place bid</h3>
                <div>
                  <label className="label block mb-2">Your bid (€/MWh)</label>
                  <input
                    type="number"
                    className="input font-mono text-lg"
                    step="0.01"
                    min={centsToEuros(scu.ask_price_cents)}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    Min: {formatEuros(scu.ask_price_cents)}
                  </p>
                </div>

                {bidAmount && Number(bidAmount) > 0 && (
                  <div className="bg-surface-3 rounded-lg px-3 py-3 text-xs text-slate-400 space-y-1.5">
                    <div className="flex justify-between">
                      <span>Total value</span>
                      <span className="text-white font-medium tabular">{formatEuros(bidTotalCents)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Platform fee (0.1%)</span>
                      <span className="text-amber-400 tabular">{formatEuros(bidFeeCents)}</span>
                    </div>
                    <div className="flex justify-between border-t border-white/5 pt-1.5">
                      <span>You pay</span>
                      <span className="text-white font-semibold tabular">{formatEuros(bidTotalCents + bidFeeCents)}</span>
                    </div>
                    <p className="text-[10px] text-slate-600">for {mwh} MWh · fee collected at settlement</p>
                  </div>
                )}

                {bidError && <p className="text-xs text-red-400">{bidError}</p>}

                <button type="submit" disabled={bidLoading} className="btn-primary w-full">
                  {bidLoading ? 'Placing bid…' : 'Place bid'}
                </button>

                <p className="text-[10px] text-slate-600 text-center">
                  Bids are binding. Payment held on match.
                </p>
              </form>
            )}

            {isSeller && (
              <div className="card px-4 py-4 text-center">
                <p className="text-xs text-slate-500">You're the seller of this SCU</p>
              </div>
            )}

            {!canBid && !isSeller && company?.kyb_status !== 'ACTIVE' && (
              <div className="card px-4 py-4 border-amber-500/20 bg-amber-500/5">
                <p className="text-xs text-amber-400">KYB verification required to place bids.</p>
              </div>
            )}

            {scu.company && (
              <div className="card px-4 py-4">
                <p className="text-xs text-slate-500 mb-3">Listed by</p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-surface-4 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {scu.company.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{scu.company.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {(scu.company.delivery_score * 100).toFixed(0)}% delivery score
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}