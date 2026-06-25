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
const BAR_MAX_PX = 80;
const BAR_HEIGHT: Record<Severity, number> = { RED: 80, AMBER: 48, GREEN: 20 };
const short = (n: string) => n.split('—')[0].trim();

function TrendArrow({ buckets }: { buckets: ForecastBucket[] }) {
  if (buckets.length < 2) return null;
  const first = RANK[buckets[0].predicted_severity];
  const last = RANK[buckets[buckets.length - 1].predicted_severity];
  if (first === last) return <span className="text-slate-500 text-xs">→ stable</span>;
  if (last < first) return <span className="text-red-400 text-xs font-medium">↑ worsening</span>;
  return <span className="text-emerald-400 text-xs font-medium">↓ improving</span>;
}

function BestWindowBadge({ buckets }: { buckets: ForecastBucket[] }) {
  // Find the longest consecutive GREEN or AMBER window
  const greenWindows: { start: number; end: number }[] = [];
  let start: number | null = null;

  buckets.forEach((b, i) => {
    if (b.predicted_severity === 'GREEN' || b.predicted_severity === 'AMBER') {
      if (start === null) start = i;
    } else {
      if (start !== null) { greenWindows.push({ start, end: i - 1 }); start = null; }
    }
  });
  if (start !== null) greenWindows.push({ start, end: buckets.length - 1 });

  if (greenWindows.length === 0) return (
    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-red-400 shrink-0">
        <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0V5zm.75 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
      </svg>
      <span className="text-xs text-red-400">High congestion expected all day — consider delaying bids</span>
    </div>
  );

  const best = greenWindows.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  const startH = buckets[best.start].hour_offset;
  const endH = buckets[best.end].hour_offset;
  const sev = buckets[best.start].predicted_severity;

  return (
    <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 border', SEV[sev].bg, SEV[sev].border)}>
      <svg viewBox="0 0 16 16" fill="currentColor" className={cn('w-3.5 h-3.5 shrink-0', SEV[sev].text)}>
        <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm3.78 4.97a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L4.22 9.03a.75.75 0 011.06-1.06L7 9.69l3.72-3.72a.75.75 0 011.06 0z" clipRule="evenodd"/>
      </svg>
      <span className={cn('text-xs font-medium', SEV[sev].text)}>
        Best window to list: {startH === 0 ? 'now' : `+${startH}h`}{endH !== startH ? ` – +${endH}h` : ''} · Lower congestion expected
      </span>
    </div>
  );
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
    <div className="space-y-3">
      <div className="h-8 w-48 bg-surface-3 rounded animate-pulse" />
      <div className="h-48 bg-surface-2 rounded-xl animate-pulse" />
    </div>
  );

  if (error) return (
    <div className="card px-5 py-4" style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
      <p className="text-sm text-red-400">Forecast unavailable: {error}</p>
    </div>
  );

  if (!forecast?.forecast?.length) return (
    <div className="card px-5 py-6 text-center text-sm text-slate-500">No forecast data available.</div>
  );

  const ordered = [...forecast.forecast].sort((a, b) => RANK[a.current_severity] - RANK[b.current_severity]);
  const pt = ordered.find(p => p.congestion_point_id === selected) ?? ordered[0];

  const avgConf = Math.round(
    pt.forecast_buckets.reduce((a, b) => a + b.confidence, 0) / pt.forecast_buckets.length * 100
  );

  const worstSev = pt.forecast_buckets.reduce(
    (w, b) => RANK[b.predicted_severity] < RANK[w] ? b.predicted_severity : w,
    'GREEN' as Severity
  );
  const peakHour = pt.forecast_buckets.find(b => b.predicted_severity === worstSev)?.hour_offset ?? null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-sm font-medium text-white">24h Congestion Forecast</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-600">{forecast.model}</span>
          <span className="text-[10px] font-mono text-slate-500">
            Updated {new Date(forecast.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Point selector */}
      <div className="flex gap-1.5 flex-wrap">
        {ordered.slice(0, 7).map(p => {
          const s = SEV[p.current_severity];
          const active = p.congestion_point_id === pt.congestion_point_id;
          return (
            <button key={p.congestion_point_id} onClick={() => setSelected(p.congestion_point_id)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border transition-all',
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

      {/* Point summary row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-white">{short(pt.name)}</p>
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', SEV[pt.current_severity].bg, SEV[pt.current_severity].border, SEV[pt.current_severity].text)}>
            {SEV[pt.current_severity].label} now
          </span>
          <TrendArrow buckets={pt.forecast_buckets} />
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500 shrink-0">
          {peakHour !== null && (
            <span>Peak: <span className={cn('font-medium', SEV[worstSev].text)}>{peakHour === 0 ? 'now' : `+${peakHour}h`}</span></span>
          )}
          <span>Conf: <span className="text-slate-400">{avgConf}%</span></span>
        </div>
      </div>

      {/* Best window recommendation */}
      <BestWindowBadge buckets={pt.forecast_buckets} />

      {/* Bar chart */}
      <div className="flex gap-1 items-end" style={{ height: BAR_MAX_PX + 20 }}>
        {pt.forecast_buckets.map((b, i) => {
          const s = SEV[b.predicted_severity];
          const barH = BAR_HEIGHT[b.predicted_severity];
          const alpha = Math.max(0.35, b.confidence);
          const isHovered = hoveredBucket === i;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1 relative cursor-pointer"
              style={{ height: BAR_MAX_PX + 20 }}
              onMouseEnter={() => setHoveredBucket(i)}
              onMouseLeave={() => setHoveredBucket(null)}
            >
              {isHovered && (
                <div className="absolute z-10 pointer-events-none"
                  style={{ bottom: BAR_MAX_PX + 24, left: '50%', transform: 'translateX(-50%)' }}>
                  <div className="rounded-lg px-2.5 py-1.5 text-center whitespace-nowrap shadow-xl"
                    style={{ background: '#1e2330', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <p className={cn('text-xs font-medium', s.text)}>{s.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{Math.round(b.confidence * 100)}% confidence</p>
                    <p className="text-[10px] text-slate-500">{b.hour_offset === 0 ? 'Now' : `+${b.hour_offset}h`}</p>
                  </div>
                </div>
              )}
              <div
                className="w-full rounded-t-sm transition-all duration-150"
                style={{
                  height: barH,
                  backgroundColor: s.hex,
                  opacity: isHovered ? 1 : alpha,
                  boxShadow: isHovered ? `0 0 8px ${s.hex}60` : 'none',
                }}
              />
              <span className="text-[9px] font-mono text-slate-600 shrink-0">
                {b.hour_offset === 0 ? 'now' : `+${b.hour_offset}h`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <div className="flex gap-3">
          {(['RED', 'AMBER', 'GREEN'] as Severity[]).map(s => (
            <span key={s} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span className="w-2 h-2 rounded-sm" style={{ background: SEV[s].hex }} />
              {SEV[s].label}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-slate-600 font-mono">
          Opacity = confidence
        </span>
      </div>
    </div>
  );
}