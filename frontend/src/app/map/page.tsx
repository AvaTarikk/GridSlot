'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { AppShell } from '@/components/layout/AppShell'
import { congestion as congestionApi } from '@/lib/api'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { CongestionPoint } from '@/types'
import { congestionColor, congestionDot, cn } from '@/lib/utils'

// Leaflet must be loaded client-side only
const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-surface-1">
      <p className="text-slate-500 text-sm">Loading map…</p>
    </div>
  ),
})

export default function MapPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<CongestionPoint | null>(null)
  const { congestionPoints, setCongestionPoints } = useMarketplaceStore()

  useEffect(() => {
    congestionApi
      .list()
      .then((pts) => {
        setCongestionPoints(pts)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppShell>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Congestion Map</h1>
            <p className="text-slate-400 text-xs mt-0.5">
              {congestionPoints.length} monitored grid points · Netherlands
            </p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5">
            {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((s) => (
              <div key={s} className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', congestionDot[s])} />
                <span className={cn('text-xs', congestionColor[s])}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Map */}
          <div className="flex-1 relative">
            {error && (
              <div className="absolute top-4 left-4 z-10 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {!loading && (
              <MapView
                points={congestionPoints}
                selected={selected}
                onSelect={setSelected}
              />
            )}

            {loading && (
              <div className="h-full flex items-center justify-center bg-surface-1">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-6 h-6 border-2 border-grid-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500 text-sm">Loading congestion data…</p>
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          <div className="w-72 border-l border-white/5 bg-surface-1 overflow-y-auto shrink-0">
            {selected ? (
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="font-display font-semibold text-white text-sm">{selected.name}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">{selected.operator}</p>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                    </svg>
                  </button>
                </div>

                <div className={cn('badge mb-4', 
                  selected.severity === 'LOW' ? 'bg-congestion-low/15 border-congestion-low/30' :
                  selected.severity === 'MEDIUM' ? 'bg-congestion-medium/15 border-congestion-medium/30' :
                  'bg-congestion-high/15 border-congestion-high/30'
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', congestionDot[selected.severity])} />
                  <span className={cn(congestionColor[selected.severity], 'text-xs')}>
                    {selected.severity} congestion
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-500">Operator</span>
                    <span className="text-slate-200">{selected.operator}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-500">Active SCUs</span>
                    <span className="text-slate-200">{selected.active_scus ?? 0}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-slate-500">Coordinates</span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>

                <a
                  href={`/marketplace?congestion_point_id=${selected.id}`}
                  className="btn-secondary w-full text-center text-xs mt-5 block"
                >
                  View SCUs at this point →
                </a>
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-slate-500 text-center mt-8">
                  Click a point on the map to see details.
                </p>
                <div className="mt-6 space-y-2">
                  {congestionPoints
                    .sort((a, b) => {
                      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
                      return order[a.severity] - order[b.severity]
                    })
                    .map((pt) => (
                      <button
                        key={pt.id}
                        onClick={() => setSelected(pt)}
                        className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-3 transition-colors"
                      >
                        <span className={cn('w-2 h-2 rounded-full shrink-0', congestionDot[pt.severity])} />
                        <span className="text-sm text-slate-300 truncate">{pt.name}</span>
                        <span className="ml-auto text-[10px] text-slate-600">{pt.active_scus ?? 0} SCUs</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
