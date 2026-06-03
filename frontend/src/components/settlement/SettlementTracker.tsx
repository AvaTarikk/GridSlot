import type { SettlementStatus } from '@/types'
import { settlementStatusLabel, cn } from '@/lib/utils'

const STEPS: { status: SettlementStatus; label: string }[] = [
  { status: 'PAYMENT_HELD', label: 'Payment held' },
  { status: 'DELIVERY_PENDING', label: 'Awaiting delivery' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'SETTLED', label: 'Settled' },
]

const STEP_ORDER: SettlementStatus[] = [
  'PENDING',
  'PAYMENT_HELD',
  'DELIVERY_PENDING',
  'CONFIRMED',
  'SETTLED',
]

const FAILURE_STATES: SettlementStatus[] = ['NON_DELIVERY', 'REFUNDED']

interface SettlementTrackerProps {
  status: SettlementStatus
  onConfirmDelivery?: () => void
  isConfirming?: boolean
}

export function SettlementTracker({
  status,
  onConfirmDelivery,
  isConfirming,
}: SettlementTrackerProps) {
  const failed = FAILURE_STATES.includes(status)
  const currentIdx = STEP_ORDER.indexOf(status)

  if (failed) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-red-400">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM6.47 6.47a.75.75 0 011.06 0L8 6.94l.47-.47a.75.75 0 111.06 1.06L9.06 8l.47.47a.75.75 0 11-1.06 1.06L8 9.06l-.47.47a.75.75 0 01-1.06-1.06L6.94 8l-.47-.47a.75.75 0 010-1.06z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-red-400">{settlementStatusLabel[status]}</p>
            {status === 'NON_DELIVERY' && (
              <p className="text-xs text-slate-500 mt-0.5">
                Seller failed to deliver. 5% collateral forfeited. Refund processing.
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progress steps */}
      <div className="relative flex items-center justify-between">
        {/* Connector line */}
        <div className="absolute left-4 right-4 top-4 h-px bg-surface-4" />
        <div
          className="absolute left-4 top-4 h-px bg-grid-500 transition-all duration-700"
          style={{
            width: `calc(${Math.max(0, currentIdx - 1) / (STEPS.length - 1)} * (100% - 32px))`,
          }}
        />

        {STEPS.map((step, i) => {
          const stepIdx = STEP_ORDER.indexOf(step.status)
          const done = stepIdx < currentIdx
          const active = stepIdx === currentIdx

          return (
            <div key={step.status} className="flex flex-col items-center z-10 flex-1">
              <div
                className={cn(
                  'w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300',
                  done
                    ? 'bg-grid-500 border-grid-500 text-white'
                    : active
                    ? 'bg-grid-500/20 border-grid-500 text-grid-400'
                    : 'bg-surface-2 border-surface-4 text-slate-600',
                )}
              >
                {done ? (
                  <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                    <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <p
                className={cn(
                  'text-[10px] mt-2 text-center',
                  active ? 'text-grid-400 font-medium' : done ? 'text-slate-300' : 'text-slate-600',
                )}
              >
                {step.label}
              </p>
            </div>
          )
        })}
      </div>

      {/* Confirm delivery CTA */}
      {status === 'DELIVERY_PENDING' && onConfirmDelivery && (
        <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <p className="text-sm text-amber-400 font-medium mb-1">Action required</p>
          <p className="text-xs text-slate-400 mb-3">
            Confirm that you have delivered the contracted grid capacity to the buyer.
          </p>
          <button
            onClick={onConfirmDelivery}
            disabled={isConfirming}
            className="btn-primary text-sm"
          >
            {isConfirming ? 'Confirming…' : 'Confirm delivery'}
          </button>
        </div>
      )}
    </div>
  )
}
