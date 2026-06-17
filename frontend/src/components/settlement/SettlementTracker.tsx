'use client';
import { useState } from 'react';
import { settlements } from '@/lib/api';
import { useToastStore } from '@/stores/toasts';
import type { Settlement } from '@/types';

const STEPS = [
  'MATCHED',
  'PAYMENT_HELD',
  'DELIVERY_PENDING',
  'CONFIRMED',
  'SETTLED',
] as const;

const STEP_LABELS: Record<string, string> = {
  MATCHED: 'Matched',
  PAYMENT_HELD: 'Payment Held',
  DELIVERY_PENDING: 'Awaiting Delivery',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  NON_DELIVERY: 'Non-Delivery',
  REFUNDED: 'Refunded',
};

interface Props {
  settlement: Settlement;
  isSeller: boolean;
  onUpdate: (s: Settlement) => void;
}

export default function SettlementTracker({ settlement, isSeller, onUpdate }: Props) {
  const { add } = useToastStore();
  const [loading, setLoading] = useState(false);

  const isTerminal = ['NON_DELIVERY', 'REFUNDED', 'SETTLED'].includes(settlement.status);
  const isFailed = ['NON_DELIVERY', 'REFUNDED'].includes(settlement.status);

  const currentIdx = STEPS.indexOf(settlement.status as typeof STEPS[number]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const updated = await settlements.confirmDelivery(settlement.id);
      onUpdate(updated);
      add({ type: 'success', title: 'Delivery confirmed' });
    } catch {
      add({ type: 'error', title: 'Failed to confirm delivery' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Progress steps */}
      {!isFailed && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          {STEPS.map((step, i) => {
            const done = currentIdx > i;
            const active = currentIdx === i;
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#10b981' : active ? '#f59e0b' : '#1f2535',
                    border: `2px solid ${done ? '#10b981' : active ? '#f59e0b' : '#2a3347'}`,
                    fontSize: 11, fontWeight: 700, color: (done || active) ? '#0b0d10' : '#4a5568',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ fontSize: 9, color: active ? '#f59e0b' : done ? '#10b981' : '#4a5568', fontFamily: 'monospace', letterSpacing: '0.04em', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {STEP_LABELS[step]}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: done ? '#10b981' : '#1f2535', margin: '0 4px', marginBottom: 20 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>
            {STEP_LABELS[settlement.status]}
          </div>
          <div style={{ fontSize: 12, color: '#8892a4' }}>
            {settlement.status === 'NON_DELIVERY'
              ? 'The seller did not confirm delivery. 5% collateral has been forfeited.'
              : 'Payment has been refunded to the buyer.'}
          </div>
        </div>
      )}

      {/* Current status label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0d0f14', border: '1px solid #1f2535', borderRadius: 4, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#8892a4' }}>Current status</span>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: isFailed ? '#ef4444' : isTerminal ? '#10b981' : '#f59e0b' }}>
          {STEP_LABELS[settlement.status] ?? settlement.status}
        </span>
      </div>

      {/* Seller confirm delivery button */}
      {isSeller && settlement.status === 'DELIVERY_PENDING' && (
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 4, fontSize: 13, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
            background: loading ? '#2a3347' : '#10b981', color: loading ? '#4a5568' : '#0b0d10',
          }}
        >
          {loading ? 'Confirming…' : 'Confirm Delivery'}
        </button>
      )}

      {/* Payment details */}
      {settlement.payment_held_cents !== undefined && settlement.payment_held_cents > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
          <span>Payment held</span>
          <span style={{ fontFamily: 'monospace', color: '#8892a4' }}>
            €{(settlement.payment_held_cents / 100).toFixed(2)}
          </span>
        </div>
      )}
      {settlement.collateral_forfeited_cents !== undefined && settlement.collateral_forfeited_cents > 0 && (
        <div style={{ fontSize: 12, color: '#ef4444', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>Collateral forfeited</span>
          <span style={{ fontFamily: 'monospace' }}>€{(settlement.collateral_forfeited_cents / 100).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}