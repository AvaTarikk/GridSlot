'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import SettlementTracker from '@/components/settlement/SettlementTracker';
import { scus, bids, trades, settlements } from '@/lib/api';
import {
  formatEuros,
  formatEurosCompact,
  formatDateTime,
  formatTimeWindow,
  scuStatusLabel,
  scuStatusColor,
  bidStatusColor,
  cn,
} from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toasts';
import type { Scu, Bid, Trade, Settlement } from '@/types';

type Tab = 'listings' | 'bids' | 'trades';

function StatCard({ label, value, sub, accent }: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="card px-5 py-4">
      <p className="stat-label">{label}</p>
      <p className={cn('stat-value mt-2', accent)}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function PortfolioPage() {
  const { company } = useAuthStore();
  const { add } = useToastStore();
  const [tab, setTab] = useState<Tab>('listings');
  const [scuList, setScuList] = useState<Scu[]>([]);
  const [bidList, setBidList] = useState<Bid[]>([]);
  const [tradeList, setTradeList] = useState<Trade[]>([]);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scuRes, bidRes, tradeRes] = await Promise.all([
        scus.list({ limit: 50 }),
        bids.list({}),
        trades.list({}),
      ]);
      setScuList(scuRes.data ?? []);
      setBidList(bidRes.data ?? []);
      setTradeList(tradeRes.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleWithdrawBid = async (id: string) => {
    try {
      await bids.withdraw(id);
      add({ type: 'success', title: 'Bid withdrawn' });
      load();
    } catch { add({ type: 'error', title: 'Failed to withdraw bid' }); }
  };

  const handleWithdrawScu = async (id: string) => {
    if (!confirm('Withdraw this listing? All open bids will be returned.')) return;
    try {
      await scus.withdraw(id);
      add({ type: 'success', title: 'Listing withdrawn' });
      load();
    } catch { add({ type: 'error', title: 'Failed to withdraw listing' }); }
  };

  const openSettlement = async (settlementId: string) => {
    try {
      const s = await settlements.get(settlementId);
      setSelectedSettlement(s);
    } catch { add({ type: 'error', title: 'Could not load settlement' }); }
  };

  const isSeller = company?.role === 'SELLER' || company?.role === 'BOTH';
  const isBuyer = company?.role === 'BUYER' || company?.role === 'BOTH';

  const myScus = scuList.filter(s => s.company_id === company?.id);
  const totalRevenue = tradeList
    .filter(t => t.seller_id === company?.id && t.status === 'SETTLED')
    .reduce((a, t) => a + (t.total_value_cents ?? 0), 0);
  const totalSpend = tradeList
    .filter(t => t.buyer_id === company?.id && t.status === 'SETTLED')
    .reduce((a, t) => a + (t.total_value_cents ?? 0), 0);

  const TabBtn = ({ t, label }: { t: Tab; label: string }) => (
    <button
      onClick={() => setTab(t)}
      className={cn(
        'px-4 py-1.5 rounded-md text-sm font-medium transition-colors border',
        tab === t
          ? 'bg-surface-3 border-white/10 text-white'
          : 'border-transparent text-slate-400 hover:text-slate-200'
      )}
    >
      {label}
    </button>
  );

  const thClass = "text-left py-2.5 px-4 text-[10px] font-mono tracking-widest text-slate-600 uppercase font-medium";
  const tdClass = "py-3 px-4 text-sm";

  return (
    <AppShell>
      <div className="px-8 py-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="stat-label mb-1">Portfolio</p>
          <h1 className="font-display text-2xl font-semibold text-white">{company?.name}</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active listings" value={String(myScus.filter(s => s.status === 'ACTIVE').length)} sub="SCUs on market" />
          <StatCard label="Open bids" value={String(bidList.filter(b => b.status === 'OPEN').length)} sub="Pending matching" />
          <StatCard label="Revenue (settled)" value={formatEurosCompact(totalRevenue)} sub="All-time" accent="text-emerald-400" />
          <StatCard label="Spend (settled)" value={formatEurosCompact(totalSpend)} sub="All-time" accent="text-grid-400" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 bg-surface-2 border border-white/5 rounded-lg p-1 w-fit">
          {isSeller && <TabBtn t="listings" label={`Listings (${myScus.length})`} />}
          {isBuyer && <TabBtn t="bids" label={`Bids (${bidList.length})`} />}
          <TabBtn t="trades" label={`Trades (${tradeList.length})`} />
        </div>

        {/* Listings tab */}
        {tab === 'listings' && (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className={thClass}>Congestion point</th>
                  <th className={thClass}>Time window</th>
                  <th className={thClass}>Volume</th>
                  <th className={thClass}>Ask price</th>
                  <th className={thClass}>Bids</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-500">Loading...</td></tr>
                ) : myScus.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-500">No listings yet.</td></tr>
                ) : myScus.map(s => {
                  const extS = s as Scu & { congestion_point?: { name: string; operator: string }; _count?: { bids: number } };
                  return (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className={tdClass}>
                        <p className="text-slate-200 font-medium">{extS.congestion_point?.name?.split('—')[0].trim() ?? '—'}</p>
                        <p className="text-xs text-slate-500">{extS.congestion_point?.operator}</p>
                      </td>
                      <td className={cn(tdClass, 'text-slate-400')}>{formatTimeWindow(s.time_window_start, s.time_window_end)}</td>
                      <td className={cn(tdClass, 'tabular text-slate-200')}>{s.mwh_amount} MWh</td>
                      <td className={cn(tdClass, 'tabular text-grid-400')}>{formatEuros(s.ask_price_cents)}/MWh</td>
                      <td className={cn(tdClass, 'tabular', extS._count?.bids ? 'text-grid-400' : 'text-slate-500')}>
                        {extS._count?.bids ?? 0}
                      </td>
                      <td className={tdClass}>
                        <span className={cn('text-xs font-mono px-2 py-0.5 rounded-full bg-surface-3', scuStatusColor[s.status])}>
                          {scuStatusLabel[s.status]}
                        </span>
                      </td>
                      <td className={tdClass}>
                        {s.status === 'ACTIVE' && (
                          <button
                            onClick={() => handleWithdrawScu(s.id)}
                            className="text-xs px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors"
                          >
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bids tab */}
        {tab === 'bids' && (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className={thClass}>Congestion point</th>
                  <th className={thClass}>Time window</th>
                  <th className={thClass}>My bid</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Trade</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-500">Loading...</td></tr>
                ) : bidList.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-500">No bids placed yet.</td></tr>
                ) : bidList.map(b => {
                  const extB = b as Bid & { scu?: Scu & { congestion_point?: { name: string } }; trade?: Trade & { settlement?: Settlement } };
                  return (
                    <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className={cn(tdClass, 'text-slate-200')}>{extB.scu?.congestion_point?.name?.split('—')[0].trim() ?? '—'}</td>
                      <td className={cn(tdClass, 'text-slate-400')}>
                        {extB.scu ? formatTimeWindow(extB.scu.time_window_start, extB.scu.time_window_end) : '—'}
                      </td>
                      <td className={cn(tdClass, 'tabular text-slate-200')}>{formatEuros(b.price_cents)}/MWh</td>
                      <td className={tdClass}>
                        <span className="flex items-center gap-1.5">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', bidStatusColor[b.status])} />
                          <span className="text-xs text-slate-400 capitalize">{b.status.toLowerCase()}</span>
                        </span>
                      </td>
                      <td className={tdClass}>
                        {extB.trade?.settlement && (
                          <button
                            onClick={() => openSettlement(extB.trade!.settlement!.id)}
                            className="text-xs font-mono text-grid-400 hover:text-grid-300 transition-colors"
                          >
                            {extB.trade.settlement.status} →
                          </button>
                        )}
                      </td>
                      <td className={tdClass}>
                        {b.status === 'OPEN' && (
                          <button
                            onClick={() => handleWithdrawBid(b.id)}
                            className="text-xs px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/15 transition-colors"
                          >
                            Withdraw
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Trades tab */}
        {tab === 'trades' && (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className={thClass}>Congestion point</th>
                  <th className={thClass}>Role</th>
                  <th className={thClass}>Clearing price</th>
                  <th className={thClass}>Volume</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Matched</th>
                  <th className={thClass}>Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-500">Loading...</td></tr>
                ) : tradeList.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm text-slate-500">No trades yet.</td></tr>
                ) : tradeList.map(t => {
                  const extT = t as Trade & { scu?: Scu & { congestion_point?: { name: string } }; settlement?: Settlement };
                  const role = t.seller_id === company?.id ? 'SELLER' : 'BUYER';
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className={cn(tdClass, 'text-slate-200')}>{extT.scu?.congestion_point?.name?.split('—')[0].trim() ?? '—'}</td>
                      <td className={tdClass}>
                        <span className={cn(
                          'text-xs font-mono px-2 py-0.5 rounded-full border',
                          role === 'SELLER'
                            ? 'bg-grid-500/10 border-grid-500/20 text-grid-400'
                            : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                        )}>
                          {role}
                        </span>
                      </td>
                      <td className={cn(tdClass, 'tabular text-grid-400')}>{formatEuros(t.clearing_price_cents)}/MWh</td>
                      <td className={cn(tdClass, 'tabular text-slate-200')}>{t.mwh_amount} MWh</td>
                      <td className={cn(tdClass, 'tabular text-emerald-400')}>{formatEuros(t.total_value_cents ?? 0)}</td>
                      <td className={cn(tdClass, 'text-slate-400')}>{formatDateTime(t.matched_at ?? t.created_at)}</td>
                      <td className={tdClass}>
                        {extT.settlement ? (
                          <button
                            onClick={() => openSettlement(extT.settlement!.id)}
                            className="text-xs font-mono text-grid-400 hover:text-grid-300 transition-colors"
                          >
                            {extT.settlement.status} →
                          </button>
                        ) : <span className="text-slate-500">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Settlement modal */}
      {selectedSettlement && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[100] p-6">
          <div className="card w-full max-w-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="stat-label mb-1">Settlement</p>
                <h2 className="font-display text-lg font-semibold text-white">
                  {(selectedSettlement as Settlement & { trade?: Trade & { scu?: Scu & { congestion_point?: { name: string } } } }).trade?.scu?.congestion_point?.name?.split('—')[0].trim() ?? 'Trade Settlement'}
                </h2>
              </div>
              <button
                onClick={() => setSelectedSettlement(null)}
                className="text-slate-500 hover:text-slate-300 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            {(selectedSettlement as Settlement & { trade?: Trade }).trade && (() => {
              const t = (selectedSettlement as Settlement & { trade: Trade }).trade;
              return (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-surface-2 border border-white/5 rounded-md px-3.5 py-2.5">
                    <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-1">Clearing price</p>
                    <p className="text-base font-display font-semibold text-grid-400">{formatEuros(t.clearing_price_cents)}/MWh</p>
                  </div>
                  <div className="bg-surface-2 border border-white/5 rounded-md px-3.5 py-2.5">
                    <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-1">Volume</p>
                    <p className="text-base font-display font-semibold text-white">{t.mwh_amount} MWh</p>
                  </div>
                  <div className="bg-surface-2 border border-white/5 rounded-md px-3.5 py-2.5">
                    <p className="text-[10px] font-mono tracking-widest text-slate-600 uppercase mb-1">Total value</p>
                    <p className="text-base font-display font-semibold text-emerald-400">{formatEuros(t.total_value_cents ?? 0)}</p>
                  </div>
                </div>
              );
            })()}

            <SettlementTracker
              settlement={selectedSettlement}
              isSeller={(selectedSettlement as Settlement & { trade?: Trade }).trade?.seller_id === company?.id}
              onUpdate={(updated) => setSelectedSettlement(updated)}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}