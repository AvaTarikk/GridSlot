import Link from 'next/link'
import type { Scu } from '@/types'
import {
  formatEuros,
  formatTimeWindow,
  congestionColor,
  congestionBg,
  congestionDot,
  scuStatusColor,
  cn,
} from '@/lib/utils'

interface ScuCardProps {
  scu: Scu
  highlight?: boolean
}

export function ScuCard({ scu, highlight }: ScuCardProps) {
  const severity = scu.congestion_point?.severity ?? 'LOW'

  return (
    <Link
      href={`/marketplace/${scu.id}`}
      className={cn(
        'card-hover block p-5 transition-all duration-200',
        highlight && 'ring-1 ring-grid-500/40',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {scu.congestion_point?.name ?? 'Unknown point'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {scu.congestion_point?.operator}
          </p>
        </div>

        <div className={cn('badge shrink-0', congestionBg[severity])}>
          <span className={cn('w-1.5 h-1.5 rounded-full', congestionDot[severity])} />
          <span className={cn('text-[10px]', congestionColor[severity])}>
            {severity}
          </span>
        </div>
      </div>

      {/* Time window */}
      <div className="mb-4 text-xs text-slate-400 bg-surface-3 rounded-lg px-3 py-2 font-mono">
        {formatTimeWindow(scu.start_time, scu.end_time)}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-slate-500 mb-1">Ask price</p>
          <p className="text-sm font-semibold text-white tabular">
            {formatEuros(scu.ask_price_cents)}
          </p>
          <p className="text-[10px] text-slate-500">per MWh</p>
        </div>

        <div>
          <p className="text-[10px] text-slate-500 mb-1">Capacity</p>
          <p className="text-sm font-semibold text-white tabular">{scu.mwh} MWh</p>
          <p className="text-[10px] text-slate-500">total</p>
        </div>

        <div>
          <p className="text-[10px] text-slate-500 mb-1">Bids</p>
          <p className={cn('text-sm font-semibold tabular', (scu.bid_count ?? 0) > 0 ? 'text-amber-400' : 'text-slate-500')}>
            {scu.bid_count ?? 0}
          </p>
          {scu.highest_bid_cents && (
            <p className="text-[10px] text-slate-500">
              top {formatEuros(scu.highest_bid_cents)}
            </p>
          )}
        </div>
      </div>

      {/* Seller */}
      {scu.company && (
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-surface-4 flex items-center justify-center text-[9px] font-bold text-slate-400">
            {scu.company.name.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-[11px] text-slate-500">{scu.company.name}</span>
          <span className="ml-auto text-[10px] text-slate-600">
            {(scu.company.delivery_score * 100).toFixed(0)}% delivery
          </span>
        </div>
      )}
    </Link>
  )
}
