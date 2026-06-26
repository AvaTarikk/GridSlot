'use client';
import { useState, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { congestion } from '@/lib/api';
import { formatEuros, cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = 'GREEN' | 'AMBER' | 'RED';
type Scenario = 'baseline' | 'heat_wave' | 'solar_peak' | 'ev_charging';

interface HistoryDay {
  date: string;
  clearing_price_cents: number;
  volume_mwh: number;
  severity: Severity;
  trade_count: number;
}

interface ForecastDay {
  date: string;
  predicted_price_cents: number;
  lower_bound_cents: number;
  upper_bound_cents: number;
  predicted_severity: Severity;
  confidence: number;
}

interface PointStats {
  avg_price_cents: number;
  peak_price_cents: number;
  low_price_cents: number;
  trend_7d_pct: number;
  total_volume_mwh: number;
  total_trades: number;
}

interface PointForecast {
  congestion_point_id: string;
  stats: PointStats;
  history: HistoryDay[];
  forecast: ForecastDay[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POINTS = [
  { id: 'cp_001', name: 'Amsterdam West', severity: 'RED'   as Severity },
  { id: 'cp_002', name: 'Amsterdam Noord', severity: 'AMBER' as Severity },
  { id: 'cp_003', name: 'Rotterdam Maasvlakte', severity: 'RED'   as Severity },
  { id: 'cp_004', name: 'Rotterdam Centrum', severity: 'AMBER' as Severity },
  { id: 'cp_005', name: 'Eindhoven HTC', severity: 'RED'   as Severity },
  { id: 'cp_006', name: 'Groningen Eemshaven', severity: 'AMBER' as Severity },
  { id: 'cp_007', name: 'Utrecht Lage Weide', severity: 'GREEN' as Severity },
  { id: 'cp_008', name: 'Haarlem Waarderpolder', severity: 'AMBER' as Severity },
  { id: 'cp_009', name: 'Den Haag Binckhorst', severity: 'GREEN' as Severity },
  { id: 'cp_010', name: 'Tilburg Katsbogten', severity: 'RED'   as Severity },
];

const SEV_CFG: Record<Severity, { hex: string; label: string; text: string; bg: string; border: string; dot: string }> = {
  RED:   { hex: '#f87171', label: 'Congested',   text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
  AMBER: { hex: '#fbbf24', label: 'Limited',     text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400'   },
  GREEN: { hex: '#34d399', label: 'Available',   text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
};

const SCENARIOS: Record<Scenario, { label: string; desc: string; multiplier: number }> = {
  baseline:   { label: 'Baseline',        desc: 'Average weekday demand',           multiplier: 1.00 },
  heat_wave:  { label: 'Heat Wave',       desc: 'Cooling demand surge (+32°C)',     multiplier: 1.28 },
  solar_peak: { label: 'Solar Peak',      desc: 'Max solar feed-in, southern nodes', multiplier: 0.84 },
  ev_charging: { label: 'EV Night Fleet', desc: 'Fleet charging 22:00–06:00',       multiplier: 1.17 },
};

const HISTORY_DAYS = 30;

// ─── SVG Chart ────────────────────────────────────────────────────────────────

function PriceChart({
  history,
  forecast,
  scenario,
}: {
  history: HistoryDay[];
  forecast: ForecastDay[];
  scenario: Scenario;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; price: number; isForecast: boolean } | null>(null);
  const mult = SCENARIOS[scenario].multiplier;

  const W = 900, H = 220, PAD = { top: 16, right: 24, bottom: 32, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allPrices = [
    ...history.map(d => d.clearing_price_cents),
    ...forecast.map(d => d.predicted_price_cents * mult),
    ...forecast.map(d => d.upper_bound_cents * mult),
  ];
  const minP = Math.min(...allPrices) * 0.92;
  const maxP = Math.max(...allPrices) * 1.06;

  const total = history.length + forecast.length;
  const px = (i: number) => PAD.left + (i / (total - 1)) * chartW;
  const py = (v: number) => PAD.top + chartH - ((v - minP) / (maxP - minP)) * chartH;

  const histPoints = history.map((d, i) => ({ x: px(i), y: py(d.clearing_price_cents) }));
  const forePoints = forecast.map((d, i) => ({
    x: px(history.length + i),
    y: py(d.predicted_price_cents * mult),
    yLo: py(d.upper_bound_cents * mult),
    yHi: py(d.lower_bound_cents * mult),
    conf: d.confidence,
  }));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const bandPath = [
    ...forePoints.map(p => `${p.x.toFixed(1)},${p.yLo.toFixed(1)}`),
    ...[...forePoints].reverse().map(p => `${p.x.toFixed(1)},${p.yHi.toFixed(1)}`),
  ].join(' ');

  const ticks = 5;
  const yTicks = Array.from({ length: ticks }, (_, i) => minP + ((maxP - minP) * i) / (ticks - 1));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const idx = Math.round(((mx - PAD.left) / chartW) * (total - 1));
    if (idx < 0 || idx >= total) { setTooltip(null); return; }
    const isForecast = idx >= history.length;
    const fIdx = idx - history.length;
    const price = isForecast
      ? forecast[fIdx]?.predicted_price_cents * mult
      : history[idx]?.clearing_price_cents;
    const label = isForecast ? forecast[fIdx]?.date : history[idx]?.date;
    if (!price || !label) return;
    const x = px(idx), y = py(price);
    setTooltip({ x, y, label, price, isForecast });
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 220 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={py(v)} x2={W - PAD.right} y2={py(v)}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"
            />
            <text x={PAD.left - 8} y={py(v) + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.25)">
              €{(v / 100).toFixed(0)}
            </text>
          </g>
        ))}

        <line
          x1={px(history.length)} y1={PAD.top}
          x2={px(history.length)} y2={H - PAD.bottom}
          stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4,3"
        />
        <text x={px(history.length) + 4} y={PAD.top + 11} fontSize="9" fill="rgba(255,255,255,0.3)" fontFamily="monospace">
          FORECAST
        </text>

        <polygon points={bandPath} fill="rgba(251,191,36,0.07)" />

        <path d={toPath(histPoints)} fill="none" stroke="#60a5fa" strokeWidth="1.5" />

        <path
          d={toPath([histPoints[histPoints.length - 1], ...forePoints.map(p => ({ x: p.x, y: p.y }))])}
          fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="5,3"
        />

        {tooltip && (
          <circle cx={tooltip.x} cy={tooltip.y} r="4"
            fill={tooltip.isForecast ? '#fbbf24' : '#60a5fa'}
            stroke="rgba(0,0,0,0.5)" strokeWidth="1.5"
          />
        )}

        {history.filter((_, i) => i % Math.ceil(history.length / 6) === 0).map((d, i) => {
          const realIdx = i * Math.ceil(history.length / 6);
          return (
            <text key={i} x={px(realIdx)} y={H - 8} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.2)" fontFamily="monospace">
              {d.date.slice(5)}
            </text>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-xl"
          style={{
            left: `${(tooltip.x / W) * 100}%`,
            top: `${(tooltip.y / H) * 100}%`,
            transform: 'translate(-50%, -110%)',
            background: '#1a1f2e',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <p className="font-mono text-slate-400">{tooltip.label}</p>
          <p className={cn('font-semibold', tooltip.isForecast ? 'text-amber-400' : 'text-blue-400')}>
            {formatEuros(Math.round(tooltip.price))}
          </p>
          {tooltip.isForecast && <p className="text-slate-500 text-[10px]">Forecast {scenario !== 'baseline' ? `· ${SCENARIOS[scenario].label}` : ''}</p>}
        </div>
      )}

      <div className="flex gap-4 mt-2 px-1">
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-6 h-0.5 bg-blue-400 inline-block rounded" /> Historical price
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-6 h-0.5 bg-amber-400 inline-block rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #fbbf24 0 4px, transparent 4px 7px)' }} /> Forecast
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="w-4 h-3 rounded-sm inline-block" style={{ background: 'rgba(251,191,36,0.15)' }} /> Confidence band
        </span>
      </div>
    </div>
  );
}

// ─── Volume bars ──────────────────────────────────────────────────────────────

function VolumeChart({ history }: { history: HistoryDay[] }) {
  const maxVol = Math.max(...history.map(d => d.volume_mwh));
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div className="flex items-end gap-px" style={{ height: 48 }}>
      {history.map((d, i) => {
        const h = Math.max(2, (d.volume_mwh / maxVol) * 44);
        const cfg = SEV_CFG[d.severity];
        return (
          <div
            key={i}
            className="flex-1 relative cursor-default"
            style={{ height: 48 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered === i && (
              <div className="absolute z-10 pointer-events-none bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded text-[9px] font-mono"
                style={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="text-slate-400">{d.volume_mwh} MWh</span>
              </div>
            )}
            <div
              className="absolute bottom-0 w-full rounded-t-sm transition-opacity"
              style={{ height: h, background: cfg.hex, opacity: hovered === i ? 0.9 : 0.35 }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Calendar Heatmap ─────────────────────────────────────────────────────────

function CalendarHeatmap({ history }: { history: HistoryDay[] }) {
  const [hovered, setHovered] = useState<HistoryDay | null>(null);

  return (
    <div>
      <div className="flex gap-1 flex-wrap">
        {history.map((d, i) => {
          const cfg = SEV_CFG[d.severity];
          return (
            <div
              key={i}
              className="relative cursor-default rounded-sm transition-all"
              style={{ width: 12, height: 12, background: cfg.hex, opacity: hovered === d ? 1 : 0.55 }}
              onMouseEnter={() => setHovered(d)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </div>
      {hovered && (
        <div className="mt-2 flex items-center gap-3 text-[11px] font-mono">
          <span className="text-slate-500">{hovered.date}</span>
          <span className={SEV_CFG[hovered.severity].text}>{SEV_CFG[hovered.severity].label}</span>
          <span className="text-slate-400">{formatEuros(hovered.clearing_price_cents)}</span>
          <span className="text-slate-500">{hovered.volume_mwh} MWh · {hovered.trade_count} trades</span>
        </div>
      )}
      <div className="flex gap-3 mt-2">
        {(['GREEN', 'AMBER', 'RED'] as Severity[]).map(s => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: SEV_CFG[s].hex, opacity: 0.7 }} />
            {SEV_CFG[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number }) {
  return (
    <div className="rounded-xl border border-white/8 bg-surface-2 px-4 py-3">
      <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-1">{label}</p>
      <p className="text-xl font-semibold text-white font-display">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      {trend !== undefined && (
        <p className={cn('text-[11px] font-mono mt-0.5', trend > 0 ? 'text-red-400' : trend < 0 ? 'text-emerald-400' : 'text-slate-500')}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}% vs prev 7d
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

let _cachedForecast: Record<string, PointForecast> = {};

export default function ForecastPage() {
  const [selectedId, setSelectedId] = useState('cp_001');
  const [scenario, setScenario] = useState<Scenario>('baseline');
  const [data, setData] = useState<PointForecast | null>(_cachedForecast[selectedId] ?? null);
  const [loading, setLoading] = useState(!_cachedForecast[selectedId]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (_cachedForecast[selectedId]) {
      setData(_cachedForecast[selectedId]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/forecast/${selectedId}?range=30`, {
      headers: { Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('gs_token') : ''}` }
    })
      .then(r => r.json())
      .then(d => {
        _cachedForecast[selectedId] = d;
        setData(d);
      })
      .catch(() => setError('Failed to load forecast data'))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const selectedPoint = POINTS.find(p => p.id === selectedId)!;
  const sevCfg = SEV_CFG[selectedPoint.severity];

  const displayedHistory = data ? data.history.slice(-HISTORY_DAYS) : [];

  return (
    <AppShell>
      <div className="flex flex-col h-screen overflow-hidden">

        {/* ── Top bar ── */}
        <div className="shrink-0 border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-0.5">Price Intelligence</p>
            <h1 className="text-lg font-semibold text-white font-display">Market Forecast</h1>
          </div>

          {/* Scenario selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest mr-1">Scenario</span>
            {(Object.entries(SCENARIOS) as [Scenario, typeof SCENARIOS[Scenario]][]).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setScenario(key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[11px] font-mono border transition-all',
                  scenario === key
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                )}
                title={s.desc}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Point sidebar ── */}
          <aside className="w-52 shrink-0 border-r border-white/5 overflow-y-auto py-3">
            {POINTS.map(pt => {
              const cfg = SEV_CFG[pt.severity];
              const active = pt.id === selectedId;
              return (
                <button
                  key={pt.id}
                  onClick={() => setSelectedId(pt.id)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 border-l-2 transition-colors flex items-center gap-2.5',
                    active ? `bg-surface-2 border-l-${cfg.dot.replace('bg-', '')}` : 'border-l-transparent hover:bg-surface-2/50'
                  )}
                  style={active ? { borderLeftColor: cfg.hex } : {}}
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                  <span className={cn('text-xs leading-snug', active ? 'text-white font-medium' : 'text-slate-400')}>
                    {pt.name}
                  </span>
                </button>
              );
            })}
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {loading && (
              <div className="space-y-4">
                <div className="h-6 w-48 bg-surface-3 rounded animate-pulse" />
                <div className="h-56 bg-surface-2 rounded-xl animate-pulse" />
                <div className="grid grid-cols-4 gap-3">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />)}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {!loading && !error && data && (
              <>
                {/* Point header */}
                <div className="flex items-center gap-3">
                  <span className={cn('w-2.5 h-2.5 rounded-full', sevCfg.dot)} />
                  <h2 className="text-base font-semibold text-white">{selectedPoint.name}</h2>
                  <span className={cn('text-[11px] font-mono px-2 py-0.5 rounded-full border', sevCfg.bg, sevCfg.border, sevCfg.text)}>
                    {sevCfg.label}
                  </span>
                  {scenario !== 'baseline' && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                      {SCENARIOS[scenario].label} · {SCENARIOS[scenario].desc}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  <StatCard
                    label="Avg clearing price"
                    value={formatEuros(Math.round(data.stats.avg_price_cents * SCENARIOS[scenario].multiplier))}
                    trend={data.stats.trend_7d_pct}
                  />
                  <StatCard
                    label="Peak price (30d)"
                    value={formatEuros(Math.round(data.stats.peak_price_cents * SCENARIOS[scenario].multiplier))}
                    sub="Highest cleared bid"
                  />
                  <StatCard
                    label="Total volume"
                    value={`${data.stats.total_volume_mwh.toLocaleString()} MWh`}
                    sub={`${data.stats.total_trades} trades · 30 days`}
                  />
                  <StatCard
                    label="14d forecast"
                    value={formatEuros(Math.round(data.forecast[6]?.predicted_price_cents * SCENARIOS[scenario].multiplier ?? 0))}
                    sub={`Day 7 midpoint · ${data.forecast[6]?.confidence ?? 0}% confidence`}
                  />
                </div>

                {/* Price chart */}
                <div className="rounded-xl border border-white/8 bg-surface-2 px-5 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">Clearing price — 30d history + 14d forecast</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                      <span className="text-[10px] text-slate-500">€/MWh</span>
                    </div>
                  </div>
                  <PriceChart history={displayedHistory} forecast={data.forecast} scenario={scenario} />
                </div>

                {/* Volume chart */}
                <div className="rounded-xl border border-white/8 bg-surface-2 px-5 py-4">
                  <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-3">Daily volume — MWh traded</p>
                  <VolumeChart history={displayedHistory} />
                </div>

                {/* Calendar heatmap */}
                <div className="rounded-xl border border-white/8 bg-surface-2 px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">30-day congestion calendar</p>
                    <p className="text-[10px] text-slate-600 font-mono">Hover to inspect</p>
                  </div>
                  <CalendarHeatmap history={displayedHistory} />
                </div>

                {/* Forecast table */}
                <div className="rounded-xl border border-white/8 bg-surface-2 px-5 py-4">
                  <p className="text-[10px] font-mono tracking-widest text-slate-500 uppercase mb-3">14-day price forecast</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/5">
                          <th className="text-left py-2 text-[10px] font-mono text-slate-600 uppercase">Date</th>
                          <th className="text-right py-2 text-[10px] font-mono text-slate-600 uppercase">Low</th>
                          <th className="text-right py-2 text-[10px] font-mono text-slate-600 uppercase">Mid</th>
                          <th className="text-right py-2 text-[10px] font-mono text-slate-600 uppercase">High</th>
                          <th className="text-center py-2 text-[10px] font-mono text-slate-600 uppercase">Status</th>
                          <th className="text-right py-2 text-[10px] font-mono text-slate-600 uppercase">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.forecast.map((f, i) => {
                          const cfg = SEV_CFG[f.predicted_severity];
                          const mult = SCENARIOS[scenario].multiplier;
                          return (
                            <tr key={i} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                              <td className="py-2 font-mono text-slate-400">{f.date}</td>
                              <td className="py-2 text-right font-mono text-slate-500">{formatEuros(Math.round(f.lower_bound_cents * mult))}</td>
                              <td className={cn('py-2 text-right font-mono font-medium', cfg.text)}>{formatEuros(Math.round(f.predicted_price_cents * mult))}</td>
                              <td className="py-2 text-right font-mono text-slate-500">{formatEuros(Math.round(f.upper_bound_cents * mult))}</td>
                              <td className="py-2 text-center">
                                <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded', cfg.bg, cfg.text)}>{cfg.label}</span>
                              </td>
                              <td className="py-2 text-right font-mono text-slate-500">
                                <span className={cn(f.confidence >= 80 ? 'text-emerald-400' : f.confidence >= 60 ? 'text-amber-400' : 'text-red-400')}>
                                  {f.confidence}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </AppShell>
  );
}