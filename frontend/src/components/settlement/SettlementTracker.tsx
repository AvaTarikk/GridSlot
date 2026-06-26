'use client';
import { useState } from 'react';
import { settlements } from '@/lib/api';
import { formatEuros, cn } from '@/lib/utils';
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
        <div className="flex items-center mb-5">
          {STEPS.map((step, i) => {
            const done = currentIdx > i;
            const active = currentIdx === i;
            return (
              <div key={step} className={cn('flex items-center', i < STEPS.length - 1 ? 'flex-1' : '')}>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors',
                      done && 'bg-emerald-400 border-emerald-400 text-surface-1',
                      active && 'bg-grid-400 border-grid-400 text-surface-1',
                      !done && !active && 'bg-surface-3 border-white/10 text-slate-600'
                    )}
                  >
                    {done ? '✓' : i + 1}
                  </div>
                  <p
                    className={cn(
                      'text-[9px] font-mono tracking-wide text-center whitespace-nowrap',
                      active && 'text-grid-400',
                      done && 'text-emerald-400',
                      !done && !active && 'text-slate-600'
                    )}
                  >
                    {STEP_LABELS[step]}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-0.5 mx-1 mb-5', done ? 'bg-emerald-400' : 'bg-white/10')} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-md mb-4">
          <p className="text-sm font-semibold text-red-400 mb-1">{STEP_LABELS[settlement.status]}</p>
          <p className="text-xs text-slate-400">
            {settlement.status === 'NON_DELIVERY'
              ? 'The seller did not confirm delivery. 5% collateral has been forfeited.'
              : 'Payment has been refunded to the buyer.'}
          </p>
        </div>
      )}

      {/* Current status label */}
      <div className="flex justify-between items-center px-3.5 py-2.5 bg-surface-2 border border-white/5 rounded-md mb-4">
        <span className="text-sm text-slate-400">Current status</span>
        <span
          className={cn(
            'text-sm font-semibold font-mono',
            isFailed ? 'text-red-400' : isTerminal ? 'text-emerald-400' : 'text-grid-400'
          )}
        >
          {STEP_LABELS[settlement.status] ?? settlement.status}
        </span>
      </div>

      {/* Seller confirm delivery button */}
      {isSeller && settlement.status === 'DELIVERY_PENDING' && (
        <button
          onClick={handleConfirm}
          disabled={loading}
          className={cn(
            'w-full py-2.5 rounded-md text-sm font-semibold transition-colors',
            loading
              ? 'bg-surface-3 text-slate-600 cursor-not-allowed'
              : 'bg-emerald-400 text-surface-1 hover:bg-emerald-300'
          )}
        >
          {loading ? 'Confirming…' : 'Confirm Delivery'}
        </button>
      )}

      {/* Payment details */}
      {settlement.payment_held_cents !== undefined && settlement.payment_held_cents > 0 && (
        <div className="flex justify-between text-xs text-slate-500 mt-3">
          <span>Payment held</span>
          <span className="font-mono tabular text-slate-300">{formatEuros(settlement.payment_held_cents)}</span>
        </div>
      )}
      {settlement.collateral_forfeited_cents !== undefined && settlement.collateral_forfeited_cents > 0 && (
        <div className="flex justify-between text-xs text-red-400 mt-1">
          <span>Collateral forfeited</span>
          <span className="font-mono tabular">{formatEuros(settlement.collateral_forfeited_cents)}</span>
        </div>
      )}
    </div>
  );
}