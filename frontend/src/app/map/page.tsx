'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AppShell } from '@/components/layout/AppShell';
import { congestion } from '@/lib/api';
import { formatEuros, formatDateTime, cn } from '@/lib/utils';
import type { CongestionPoint, Scu } from '@/types';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-surface-1">
      <p className="text-slate-500 text-sm">Loading map…</p>
    </div>
  ),
});

const SEVERITY_CONFIG = {
  RED:   { label: 'Congested', dot: 'bg-red-500',   text: 'text-red-400',   badge: 'bg-red-500/10 border border-red-500/20',   ring: 'border-l-red-500'   },
  AMBER: { label: 'Limited',   dot: 'bg-amber-400',  text: 'text-amber-400', badge: 'bg-amber-400/10 border border-amber-400/20', ring: 'border-l-amber-400' },
  GREEN: { label: 'Available', dot: 'bg-emerald-400', text: 'text-emerald-400', badge: 'bg-emerald-400/10 border border-emerald-400/20', ring: 'border-l-emerald-400' },
} as const;

type Severity = keyof typeof SEVERITY_CONFIG;
type DetailedPoint = CongestionPoint & {
  active_scus: Scu[];
  price_history: { clearing_price_cents: number; matched_at: string }[];
};

export default function MapPage() {
  const [points, setPoints] = useState<CongestionPoint[]>([]);
  const [selected, setSelected] = useState<DetailedPoint | null>(null);
  const [selectedBase, setSelectedBase] = useState<CongestionPoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | Severity>('ALL');

  useEffect(() => {
    congestion.list()
      .then(setPoints)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handlePointClick = async (pt: CongestionPoint) => {
    setSelectedBase(pt);
    setSelected(null);
    setDetailLoading(true);
    try {
      const detail = await congestion.get(pt.id);
      setSelected(detail as DetailedPoint);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = filter === 'ALL' ? points : points.filter(p => p.severity === filter);

  const counts = {
    RED:   points.filter(p => p.severity === 'RED').length,
    AMBER: points.filter(p => p.severity === 'AMBER').length,
    GREEN: points.filter(p => p.severity === 'GREEN').length,
    total: points.reduce((a, p) => a + (p.active_scu_count ?? 0), 0),
  };

  return (
    <AppShell>
      <div className="flex h-screen overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className="w-80 shrink-0 flex flex-col bg-surface-1 border-r border-white/5 overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-6 pb-4 border-b border-white/5 shrink-0">
            <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-1">Grid Map</p>
            <h1 className="font-display text-lg font-semibold text-white mb-4">Congestion Points</h1>

            {/* Filter tabs */}
            <div className="flex gap-1.5">
              {(['ALL', 'RED', 'AMBER', 'GREEN'] as const).map(f => {
                const active = filter === f;
                const cfg = f !== 'ALL' ? SEVERITY_CONFIG[f] : null;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'flex-1 py-1.5 rounded text-[11px] font-mono tracking-wide transition-colors border',
                      active
                        ? cfg
                          ? `${cfg.badge} ${cfg.text}`
                          : 'bg-surface-3 border-white/10 text-white'
                        : 'border-transparent text-slate-600 hover:text-slate-400'
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 divide-x divide-white/5 border-b border-white/5 shrink-0">
            {(
              [
                { value: counts.RED,   label: 'Red',   cls: 'text-red-400'     },
                { value: counts.AMBER, label: 'Amber', cls: 'text-amber-400'   },
                { value: counts.GREEN, label: 'Green', cls: 'text-emerald-400' },
                { value: counts.total, label: 'Active SCUs', cls: 'text-white' },
              ] as const
            ).map(({ value, label, cls }) => (
              <div key={label} className="py-3 text-center">
                <p className={cn('text-lg font-semibold font-display', cls)}>{value}</p>
                <p className="text-[9px] font-mono tracking-widest text-slate-600 uppercase mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Point list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 p-5 text-slate-500 text-sm">
                <div className="w-4 h-4 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                Loading grid data…
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">No points match this filter.</p>
            ) : (
              filtered.map(pt => {
                const cfg = SEVERITY_CONFIG[pt.severity as Severity] ?? { label: pt.severity, dot: 'bg-slate-500', text: 'text-slate-400', badge: '', ring: 'border-l-slate-500' };
                const isSelected = selectedBase?.id === pt.id;
                return (
                  <button
                    key={pt.id}
                    onClick={() => handlePointClick(pt)}
                    className={cn(
                      'w-full text-left px-5 py-3.5 border-b border-white/5 border-l-2 transition-colors',
                      isSelected
                        ? `bg-surface-3 ${cfg.ring}`
                        : 'border-l-transparent hover:bg-surface-2'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm text-slate-200 font-medium leading-snug">
                        {pt.name.split('—')[0].trim()}
                      </span>
                      <span className={cn('shrink-0 text-[10px] font-mono px-2 py-0.5 rounded', cfg.badge, cfg.text)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{pt.operator} · {pt.region}</span>
                      {pt.active_scu_count !== undefined && (
                        <span className={pt.active_scu_count > 0 ? 'text-amber-400' : ''}>
                          {pt.active_scu_count} SCUs
                        </span>
                      )}
                    </div>
                    {pt.last_clearing_price_cents && (
                      <p className="mt-1 text-[11px] font-mono text-slate-500">
                        Last: {formatEuros(pt.last_clearing_price_cents)}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Detail drawer */}
          {selectedBase && (
            <div className="shrink-0 border-t border-white/5 bg-surface-2 max-h-64 overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div>
                  <p className="text-sm font-medium text-white leading-tight">
                    {selectedBase.name.split('—')[0].trim()}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{selectedBase.operator}</p>
                </div>
                <button
                  onClick={() => { setSelected(null); setSelectedBase(null); }}
                  className="text-slate-600 hover:text-slate-300 transition-colors text-lg leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className="px-5 py-4">
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-slate-400 rounded-full animate-spin" />
                    Loading…
                  </div>
                ) : selected ? (
                  <>
                    {selected.active_scus?.length > 0 && (
                      <div className="mb-4">
                        <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-2">Active listings</p>
                        <div className="space-y-1.5">
                          {selected.active_scus.slice(0, 4).map(scu => (
                            <div key={scu.id} className="flex justify-between text-xs">
                              <span className="text-slate-400">{scu.mwh_amount} MWh</span>
                              <span className="font-mono text-amber-400">{formatEuros(scu.ask_price_cents)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.price_history?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-2">Price history</p>
                        <div className="space-y-1">
                          {selected.price_history.slice(-4).map((ph, i) => (
                            <div key={i} className="flex justify-between text-[11px]">
                              <span className="text-slate-500">{formatDateTime(ph.matched_at)}</span>
                              <span className="font-mono text-emerald-400">{formatEuros(ph.clearing_price_cents)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selected.active_scus?.length === 0 && selected.price_history?.length === 0 && (
                      <p className="text-xs text-slate-500">No active listings or price history.</p>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          )}
        </aside>

        {/* ── Map ── */}
        <div className="flex-1 relative">
          <MapView points={filtered} selected={selectedBase} onSelect={handlePointClick} />

          {/* Legend */}
          <div className="absolute bottom-6 right-6 z-[1000] bg-surface-1 border border-white/10 rounded-lg px-4 py-3">
            <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-2.5">Severity</p>
            <div className="space-y-1.5">
              {(Object.entries(SEVERITY_CONFIG) as [Severity, typeof SEVERITY_CONFIG[Severity]][]).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot)} />
                  <span className="text-xs text-slate-400">{cfg.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}