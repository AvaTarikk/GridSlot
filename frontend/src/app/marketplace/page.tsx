'use client'

import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { ScuCard } from '@/components/marketplace/ScuCard'
import { CreateScuModal } from '@/components/marketplace/CreateScuModal'
import { scus as scusApi, congestion as congestionApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { Scu, CongestionPoint } from '@/types'
import { cn } from '@/lib/utils'

export default function MarketplacePage() {
  const { company } = useAuthStore()
  const [scuList, setScuList] = useState<Scu[]>([])
  const [points, setPoints] = useState<CongestionPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Filters
  const [selectedPoint, setSelectedPoint] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const { updatedScuIds } = useMarketplaceStore()

  const canSell = company?.role === 'SELLER' || company?.role === 'BOTH'

  const fetchScus = useCallback(async () => {
    try {
      const res = await scusApi.list({
        congestion_point_id: selectedPoint || undefined,
        min_price: minPrice ? Number(minPrice) * 100 : undefined,
        max_price: maxPrice ? Number(maxPrice) * 100 : undefined,
        status: 'LISTED',
        limit: 50,
      })
      setScuList(res.data)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [selectedPoint, minPrice, maxPrice])

  useEffect(() => {
    congestionApi.list().then(setPoints).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetchScus()
  }, [fetchScus])

  // Re-fetch when SCUs updated via WS
  useEffect(() => {
    if (updatedScuIds.size > 0) fetchScus()
  }, [updatedScuIds, fetchScus])

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold text-white">Marketplace</h1>
            <p className="text-slate-400 text-sm mt-1">
              {scuList.length} active capacity unit{scuList.length !== 1 ? 's' : ''} available
            </p>
          </div>
          {canSell && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
              </svg>
              List capacity
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="card px-5 py-4 mb-6 flex flex-wrap gap-4 items-end">
          <div className="min-w-48">
            <label className="label block mb-2">Congestion point</label>
            <select
              className="input"
              value={selectedPoint}
              onChange={(e) => setSelectedPoint(e.target.value)}
            >
              <option value="">All points</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="w-32">
            <label className="label block mb-2">Min price (€)</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder="0"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
          </div>

          <div className="w-32">
            <label className="label block mb-2">Max price (€)</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder="Any"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>

          {(selectedPoint || minPrice || maxPrice) && (
            <button
              className="btn-secondary text-sm"
              onClick={() => { setSelectedPoint(''); setMinPrice(''); setMaxPrice('') }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* SCU grid */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse space-y-3">
                <div className="h-4 w-3/4 bg-surface-4 rounded" />
                <div className="h-3 w-1/2 bg-surface-4 rounded" />
                <div className="h-8 bg-surface-4 rounded-lg" />
                <div className="grid grid-cols-3 gap-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-10 bg-surface-4 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="card px-5 py-8 text-center border-red-500/15">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && scuList.length === 0 && (
          <div className="card px-5 py-16 text-center">
            <p className="text-slate-400">No capacity units match your filters.</p>
            <p className="text-sm text-slate-500 mt-1">
              Try broadening your search or check back after the next matching cycle.
            </p>
          </div>
        )}

        {!loading && !error && scuList.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            {scuList.map((scu) => (
              <ScuCard
                key={scu.id}
                scu={scu}
                highlight={updatedScuIds.has(scu.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateScuModal
          onClose={() => setShowCreate(false)}
          onCreated={fetchScus}
        />
      )}
    </AppShell>
  )
}
