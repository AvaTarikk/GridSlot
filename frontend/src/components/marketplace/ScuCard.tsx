import Link from 'next/link'
import type { Scu } from '@/types'
import { formatEuros, formatTimeWindow, cn } from '@/lib/utils'

interface ScuCardProps {
  scu: Scu
  highlight?: boolean
}

const SEV_COLORS = {
  RED:   { bar: '#f87171', text: 'text-red-400',     label: 'Congested',   dot: 'bg-red-400' },
  AMBER: { bar: '#fbbf24', text: 'text-amber-400',   label: 'Constrained', dot: 'bg-amber-400' },
  GREEN: { bar: '#34d399', text: 'text-emerald-400', label: 'Available',   dot: 'bg-emerald-400' },
} as const

type Severity = keyof typeof SEV_COLORS

export function ScuCard({ scu, highlight }: ScuCardProps) {
  const severity = (scu.congestion_point?.severity ?? 'GREEN') as Severity
  const sev = SEV_COLORS[severity]
  const mwh = scu.mwh ?? scu.mwh_amount
  const bidCount = scu.bid_count ?? 0
  const totalValue = scu.ask_price_cents * mwh

  return (
    <Link
      href={`/marketplace/${scu.id}`}
      className={cn(
        'group relative block rounded-xl overflow-hidden transition-all duration-200',
        'bg-surface-1 border border-white/5 hover:border-white/10 hover:bg-surface-2',
        highlight && 'ring-1 ring-grid-500/50',
      )}
    >
      {/* Severity accent bar top */}
      <div className="h-0.5 w-full" style={{ background: sev.bar }} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white leading-tight truncate group-hover:text-grid-300 transition-colors">
              {scu.congestion_point?.name?.split('—')[0].trim() ?? 'Unknown point'}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[11px] text-slate-500">{scu.congestion_point?.operator}</span>
              <span className="text-slate-700">·</span>
              <span className={cn('text-[11px] font-medium', sev.text)}>{sev.label}</span>
            </div>
          </div>

          {/* Bid activity indicator */}
          {bidCount > 0 && (
            <div className="shrink-0 flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              <div className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[10px] font-mono text-amber-400">{bidCount} bid{bidCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Time window */}
        <div className="mb-4 text-[11px] text-slate-500 bg-surface-3 rounded-lg px-3 py-2 font-mono leading-relaxed">
          {formatTimeWindow(scu.start_time ?? scu.time_window_start, scu.end_time ?? scu.time_window_end)}
        </div>

        {/* Price — hero element */}
        <div className="mb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-display font-bold text-white tabular-nums">
              {formatEuros(scu.ask_price_cents)}
            </span>
            <span className="text-xs text-slate-500">/ MWh</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">{mwh} MWh total</span>
            <span className="text-slate-700">·</span>
            <span className="text-xs text-slate-500">{formatEuros(totalValue)} total value</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/5 pt-3">
          {scu.company ? (
            <div className="flex items-center gap-2">
              {/* Avatar */}
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                {scu.company.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[11px] text-slate-400 truncate flex-1">{scu.company.name}</span>
              {/* Delivery score */}
              <div className="flex items-center gap-1 shrink-0">
                <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(scu.company.delivery_score * 100).toFixed(0)}%`,
                      background: scu.company.delivery_score >= 0.95 ? '#34d399' : scu.company.delivery_score >= 0.8 ? '#fbbf24' : '#f87171',
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500">
                  {(scu.company.delivery_score * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ) : (
            <div className="h-6" />
          )}
        </div>
      </div>

      {/* Hover CTA */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: `linear-gradient(90deg, transparent, ${sev.bar}60, transparent)` }} />
    </Link>
  )
}