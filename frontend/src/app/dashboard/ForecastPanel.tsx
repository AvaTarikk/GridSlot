'use client';
import { useEffect, useState } from 'react';
import { congestion } from '@/lib/api';
import { cn } from '@/lib/utils';

type Severity = 'GREEN' | 'AMBER' | 'RED';

interface ForecastBucket {
  hour_offset: number;
  predicted_severity: Severity;
  confidence: number;
}

interface PointForecast {
  congestion_point_id: string;
  code: string;
  name: string;
  current_severity: Severity;
  forecast_buckets: ForecastBucket[];
}

interface ForecastResponse {
  generated_at: string;
  model: string;
  forecast: PointForecast[];
}

const SEV: Record<Severity, { label: string; dot: string; text: string; bg: string; border: string; hex: string }> = {
  RED:   { label: 'Congested',   dot: 'bg-red-400',     text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     hex: '#f87171' },
  AMBER: { label: 'Constrained', dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   hex: '#fbbf24' },
  GREEN: { label: 'Available',   dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', hex: '#34d399' },
};

const RANK: Record<Severity, number> = { RED: 0, AMBER: 1, GREEN: 2 };
const BAR_MAX_PX = 96;
const BAR_HEIGHT: Record<Severity, number> = { RED: 96, AMBER: 58, GREEN: 24 };
const short = (n: string) => n.split('—')[0].trim();

function TrendArrow({ buckets }: { buckets: ForecastBucket[] }) {
  if (buckets.length < 2) return null;
  const first = RANK[buckets[0].predicted_severity];
  const last = RANK[buckets[buckets.length - 1].predicted_severity];
  if (first === last) return <span className="text-slate-500 text-xs">→ stable</span>;
  if (last < first) return <span className="text-red-400 text-xs font-medium">↑ worsening</span>;
  return <span className="text-emerald-400 text-xs font-medium">↓ improving</span>;
}

export default function ForecastPanel() {
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);

  useEffect(() => {
    congestion.forecast()
      .then((d) => {
        const f = d as ForecastResponse;
        setForecast(f);
        if (f.forecast?.length) {
          const worst = [...f.forecast].sort((a, b) => RANK[a.current_severity] - RANK[b.current_severity])[0];
          setSelected(worst.congestion_point_id);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3 mb-8">
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 card animate-pulse" />)}
      </div>
      <div className="h-56 card animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="card px-5 py-4 mb-8" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
      <p className="text-sm text-red-400">Forecast unavailable: {error}</p>
    </div>
  );

  if (!forecast?.forecast?.length) return (
    <div className="card px-5 py-6 mb-8 text-center text-sm text-slate-500">No forecast data available.</div>
  );

  const ordered = [...forecast.forecast].sort((a, b) => RANK[a.current_severity] - RANK[b.current_severity]);
  const counts = forecast.forecast.reduce(
    (acc, p) => { acc[p.current_severity]++; return acc; },
    { RED: 0, AMBER: 0, GREEN: 0 } as Record<Severity, number>
  );
  const pt = ordered.find(p => p.congestion_point_id === selected) ?? ordered[0];

  const worstSev = pt.forecast_buckets.reduce(
    (w, b) => RANK[b.predicted_severity] > RANK[w] ? b.predicted_severity : w,
    'GREEN' as Severity
  );
  const peakHour = pt.forecast_buckets.find(b => b.predicted_severity === worstSev)?.hour_offset ?? null;
  const avgConf = Math.round(
    pt.forecast_buckets.reduce((a, b) => a + b.confidence, 0) / pt.forecast_buckets.length * 100
  );

  return (
    <div className="mb-8 space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {(['RED', 'AMBER', 'GREEN'] as Severity[]).map(s => (
          <div key={s} className={cn('card px-4 py-3 border', SEV[s].bg, SEV[s].border)}>
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('w-2 h-2 rounded-full', SEV[s].dot)} />
              <p className="text-[10px] font-mono text-slate-400 tracking-widest">{SEV[s].label.toUpperCase()}</p>
            </div>
            <p className={cn('text-3xl font-display font-bold', SEV[s].text)}>{counts[s]}</p>
            <p className="text-[10px] text-slate-500 mt-1">grid points</p>
          </div>
        ))}
      </div>

      {/* Main forecast card */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <h2 className="text-sm font-medium text-white">24h Congestion Forecast</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-slate-600">{forecast.model}</span>
            <span className="text-[10px] font-mono text-slate-500">
              Updated {new Date(forecast.generated_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <div className="px-5 py-4">
          {/* Point selector */}
          <div className="flex gap-2 flex-wrap mb-5">
            {ordered.slice(0, 7).map(p => {
              const s = SEV[p.current_severity];
              const active = p.congestion_point_id === pt.congestion_point_id;
              return (
                <button key={p.congestion_point_id} onClick={() => setSelected(p.congestion_point_id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all',
                    active
                      ? cn(s.bg, s.border, s.text, 'font-medium')
                      : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.dot)} />
                  {short(p.name).split(' ').slice(0, 2).join(' ')}
                </button>
              );
            })}
          </div>

          {/* Point summary */}
          <div className="flex items-start justify-between mb-5 gap-4">
            <div>
              <p className="text-sm font-medium text-white mb-1">{short(pt.name)}</p>
              <div className="flex items-center gap-3">
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', SEV[pt.current_severity].bg, SEV[pt.current_severity].border, SEV[pt.current_severity].text)}>
                  {SEV[pt.current_severity].label} now
                </span>
                <TrendArrow buckets={pt.forecast_buckets} />
              </div>
            </div>
            {peakHour !== null && (
              <div className="text-right shrink-0">
                <p className="text-[10px] text-slate-500 font-mono mb-0.5">PEAK WINDOW</p>
                <p className={cn('text-sm font-mono font-medium', SEV[worstSev].text)}>
                  {peakHour === 0 ? 'Now' : `+${peakHour}h`}
                </p>
              </div>
            )}
          </div>

          {/* Bar chart — pixel heights, no percentages */}
          <div className="flex gap-1 items-end" style={{ height: BAR_MAX_PX + 24 }}>
            {pt.forecast_buckets.map((b, i) => {
              const s = SEV[b.predicted_severity];
              const barH = BAR_HEIGHT[b.predicted_severity];
              const alpha = Math.max(0.35, b.confidence);
              const isHovered = hoveredBucket === i;
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center justify-end gap-1 relative cursor-pointer"
                  style={{ height: BAR_MAX_PX + 24 }}
                  onMouseEnter={() => setHoveredBucket(i)}
                  onMouseLeave={() => setHoveredBucket(null)}
                >
                  {/* Tooltip */}
                  {isHovered && (
                    <div
                      className="absolute z-10 pointer-events-none"
                      style={{ bottom: BAR_MAX_PX + 28, left: '50%', transform: 'translateX(-50%)' }}
                    >
                      <div className="rounded-lg px-3 py-2 text-center whitespace-nowrap shadow-xl"
                        style={{ background: '#1e2330', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <p className={cn('text-xs font-medium', s.text)}>{s.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{Math.round(b.confidence * 100)}% conf.</p>
                      </div>
                    </div>
                  )}

                  {/* Bar */}
                  <div
                    className="w-full rounded-t-sm transition-all duration-150"
                    style={{
                      height: barH,
                      backgroundColor: s.hex,
                      opacity: isHovered ? 1 : alpha,
                      boxShadow: isHovered ? `0 0 10px ${s.hex}60` : 'none',
                    }}
                  />

                  {/* X label */}
                  <span className="text-[9px] font-mono text-slate-600 shrink-0">
                    {b.hour_offset === 0 ? 'now' : `+${b.hour_offset}h`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-white/5">
            <div className="flex gap-4">
              {(['RED', 'AMBER', 'GREEN'] as Severity[]).map(s => (
                <span key={s} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="w-2 h-2 rounded-sm" style={{ background: SEV[s].hex }} />
                  {SEV[s].label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full" style={{ width: `${avgConf}%`, background: '#3b82f6' }} />
              </div>
              <span className="text-[10px] font-mono text-slate-500">{avgConf}% avg. confidence</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}