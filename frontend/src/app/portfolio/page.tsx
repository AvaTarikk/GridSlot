'use client';
import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import SettlementTracker from '@/components/settlement/SettlementTracker';
import { scus, bids, trades, settlements } from '@/lib/api';
import {
  formatEuros,
  formatDateTime,
  formatTimeWindow,
  scuStatusLabel,
  scuStatusColor,
  bidStatusColor,
} from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toasts';
import type { Scu, Bid, Trade, Settlement } from '@/types';

type Tab = 'listings' | 'bids' | 'trades';

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
        bids.list({ }),
        trades.list({ }),
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
    <button onClick={() => setTab(t)} style={{
      padding: '8px 20px', borderRadius: 4, fontSize: 13, fontWeight: 500, cursor: 'pointer',
      border: '1px solid', transition: 'all 0.15s',
      background: tab === t ? '#1e2330' : 'transparent',
      borderColor: tab === t ? '#2a3347' : 'transparent',
      color: tab === t ? '#e8eaf0' : '#8892a4',
    }}>{label}</button>
  );

  return (
    <AppShell>
      <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: 6 }}>PORTFOLIO</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e8eaf0', margin: 0 }}>{company?.name}</h1>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'ACTIVE LISTINGS', value: String(myScus.filter(s => s.status === 'ACTIVE').length), color: '#e8eaf0' },
            { label: 'OPEN BIDS', value: String(bidList.filter(b => b.status === 'OPEN').length), color: '#e8eaf0' },
            { label: 'REVENUE (SETTLED)', value: formatEuros(totalRevenue), color: '#10b981' },
            { label: 'SPEND (SETTLED)', value: formatEuros(totalSpend), color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ padding: '16px 20px', background: '#111318', border: '1px solid #1f2535', borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.08em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#0d0f14', border: '1px solid #1f2535', borderRadius: 6, padding: 4, width: 'fit-content' }}>
          {isSeller && <TabBtn t="listings" label={`Listings (${myScus.length})`} />}
          {isBuyer && <TabBtn t="bids" label={`Bids (${bidList.length})`} />}
          <TabBtn t="trades" label={`Trades (${tradeList.length})`} />
        </div>

        {/* Listings tab */}
        {tab === 'listings' && (
          <div style={{ background: '#111318', border: '1px solid #1f2535', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2535' }}>
                  {['CONGESTION POINT', 'TIME WINDOW', 'VOLUME', 'ASK PRICE', 'BIDS', 'STATUS', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', fontSize: 10, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.06em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#4a5568', fontSize: 13 }}>Loading...</td></tr>
                ) : myScus.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#4a5568', fontSize: 13 }}>No listings yet.</td></tr>
                ) : myScus.map((s, i) => (
                  <tr key={s.id} style={{ borderBottom: i < myScus.length - 1 ? '1px solid #1a1f2e' : 'none' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ color: '#e8eaf0', fontWeight: 500, fontSize: 13 }}>
                        {(s as Scu & { congestion_point?: { name: string; operator: string } }).congestion_point?.name?.split('—')[0].trim() ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#4a5568' }}>
                        {(s as Scu & { congestion_point?: { operator: string } }).congestion_point?.operator}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4' }}>
                      {formatTimeWindow(s.time_window_start, s.time_window_end)}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#e8eaf0' }}>
                      {s.mwh_amount} MWh
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#f59e0b' }}>
                      {formatEuros(s.ask_price_cents)}/MWh
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13 }}>
                      <span style={{ color: (s as Scu & { _count?: { bids: number } })._count?.bids ? '#f59e0b' : '#4a5568' }}>
                        {(s as Scu & { _count?: { bids: number } })._count?.bids ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 3, fontFamily: 'monospace',
                        background: '#1f2535', color: scuStatusColor[s.status],
                      }}>
                        {scuStatusLabel[s.status]}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {s.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleWithdrawScu(s.id)}
                          style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: 3, cursor: 'pointer' }}
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bids tab */}
        {tab === 'bids' && (
          <div style={{ background: '#111318', border: '1px solid #1f2535', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2535' }}>
                  {['CONGESTION POINT', 'TIME WINDOW', 'MY BID', 'STATUS', 'TRADE', ''].map(h => (
                    <th key={h} style={{ padding: '12px 16px', fontSize: 10, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.06em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#4a5568' }}>Loading...</td></tr>
                ) : bidList.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#4a5568' }}>No bids placed yet.</td></tr>
                ) : bidList.map((b, i) => {
                  const extB = b as Bid & { scu?: Scu & { congestion_point?: { name: string } }; trade?: Trade & { settlement?: Settlement } };
                  return (
                    <tr key={b.id} style={{ borderBottom: i < bidList.length - 1 ? '1px solid #1a1f2e' : 'none' }}>
                      <td style={{ padding: '12px 16px', color: '#e8eaf0', fontSize: 13 }}>
                        {extB.scu?.congestion_point?.name?.split('—')[0].trim() ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4' }}>
                        {extB.scu ? formatTimeWindow(extB.scu.time_window_start, extB.scu.time_window_end) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#e8eaf0' }}>
                        {formatEuros(b.price_cents)}/MWh
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: bidStatusColor[b.status], marginRight: 6,
                        }} />
                        <span style={{ fontSize: 12, color: '#8892a4' }}>{b.status}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {extB.trade?.settlement && (
                          <button onClick={() => openSettlement(extB.trade!.settlement!.id)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', padding: 0 }}>
                            {extB.trade.settlement.status} →
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {b.status === 'OPEN' && (
                          <button
                            onClick={() => handleWithdrawBid(b.id)}
                            style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', borderRadius: 3, cursor: 'pointer' }}
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
          <div style={{ background: '#111318', border: '1px solid #1f2535', borderRadius: 6, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2535' }}>
                  {['CONGESTION POINT', 'ROLE', 'CLEARING PRICE', 'VOLUME', 'TOTAL', 'MATCHED', 'SETTLEMENT'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', fontSize: 10, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.06em', textAlign: 'left', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#4a5568' }}>Loading...</td></tr>
                ) : tradeList.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#4a5568' }}>No trades yet.</td></tr>
                ) : tradeList.map((t, i) => {
                  const extT = t as Trade & { scu?: Scu & { congestion_point?: { name: string } }; settlement?: Settlement };
                  const role = t.seller_id === company?.id ? 'SELLER' : 'BUYER';
                  return (
                    <tr key={t.id} style={{ borderBottom: i < tradeList.length - 1 ? '1px solid #1a1f2e' : 'none' }}>
                      <td style={{ padding: '12px 16px', color: '#e8eaf0', fontSize: 13 }}>
                        {extT.scu?.congestion_point?.name?.split('—')[0].trim() ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 3, fontFamily: 'monospace',
                          background: role === 'SELLER' ? 'rgba(245,158,11,.15)' : 'rgba(59,130,246,.15)',
                          color: role === 'SELLER' ? '#f59e0b' : '#60a5fa',
                          border: `1px solid ${role === 'SELLER' ? 'rgba(245,158,11,.3)' : 'rgba(59,130,246,.3)'}`,
                        }}>{role}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#f59e0b' }}>
                        {formatEuros(t.clearing_price_cents)}/MWh
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#e8eaf0' }}>
                        {t.mwh_amount} MWh
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: 13, color: '#10b981' }}>
                        {formatEuros(t.total_value_cents ?? 0)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#8892a4' }}>
                        {formatDateTime(t.matched_at ?? t.created_at)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {extT.settlement ? (
                          <button onClick={() => openSettlement(extT.settlement!.id)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', padding: 0 }}>
                            {extT.settlement.status} →
                          </button>
                        ) : '—'}
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#111318', border: '1px solid #1f2535', borderRadius: 8, padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4 }}>SETTLEMENT</div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e8eaf0', margin: 0 }}>
                  {(selectedSettlement as Settlement & { trade?: Trade & { scu?: Scu & { congestion_point?: { name: string } } } }).trade?.scu?.congestion_point?.name?.split('—')[0].trim() ?? 'Trade Settlement'}
                </h2>
              </div>
              <button onClick={() => setSelectedSettlement(null)} style={{ background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>

            {(selectedSettlement as Settlement & { trade?: Trade }).trade && (() => {
              const t = (selectedSettlement as Settlement & { trade: Trade }).trade;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'CLEARING PRICE', value: `${formatEuros(t.clearing_price_cents)}/MWh`, color: '#f59e0b' },
                    { label: 'VOLUME', value: `${t.mwh_amount} MWh`, color: '#e8eaf0' },
                    { label: 'TOTAL VALUE', value: formatEuros(t.total_value_cents ?? 0), color: '#10b981' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#0d0f14', border: '1px solid #1f2535', borderRadius: 4, padding: '10px 14px' }}>
                      <div style={{ fontSize: 10, color: '#4a5568', fontFamily: 'monospace', letterSpacing: '0.06em', marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: m.color }}>{m.value}</div>
                    </div>
                  ))}
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