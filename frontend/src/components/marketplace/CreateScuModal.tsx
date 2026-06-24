'use client'

import { useState, FormEvent, useEffect, useRef } from 'react'
import { scus as scusApi, congestion as congestionApi } from '@/lib/api'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { CongestionPoint } from '@/types'
import { cn, eurosToCents } from '@/lib/utils'

interface CreateScuModalProps {
  onClose: () => void
  onCreated: () => void
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS   = ['Mo','Tu','We','Th','Fr','Sa','Su']

function toIsoLocal(date: string, time: string) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

interface DateTimePickerProps {
  label: string
  value: string
  onChange: (v: string) => void
  min?: string
}

function DateTimePicker({ label, value, onChange, min }: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const today = new Date()
  const minDate = min ? min.slice(0, 10) : today.toISOString().slice(0, 10)

  const selectedDate = value ? value.slice(0, 10) : ''
  const selectedTime = value ? value.slice(11, 16) : '09:00'

  const [viewYear, setViewYear]   = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function selectDay(day: number) {
    const d = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    onChange(toIsoLocal(d, selectedTime))
  }

  function changeTime(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(toIsoLocal(selectedDate || minDate, e.target.value))
  }

  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const offset   = (firstDow + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const displayValue = value
    ? `${value.slice(8,10)} ${MONTHS[parseInt(value.slice(5,7))-1].slice(0,3)} ${value.slice(0,4)}  ${value.slice(11,16)}`
    : ''

  return (
    <div className="relative" ref={ref}>
      <label className="label block mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'input w-full text-left font-mono flex items-center justify-between gap-2 text-sm',
          !displayValue && 'text-slate-500'
        )}
      >
        <span className="truncate">{displayValue || 'Select…'}</span>
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-slate-500 shrink-0">
          <path d="M5 2a1 1 0 00-1 1v1H3a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H6V3a1 1 0 00-1-1zM3 8h10v5H3V8z"/>
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 bg-surface-1 border border-white/10 rounded-xl shadow-2xl p-3 w-56 left-0">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M9.78 3.22a.75.75 0 010 1.06L6.56 7.5l3.22 3.22a.75.75 0 11-1.06 1.06L4.94 8.03a.75.75 0 010-1.06l3.78-3.75a.75.75 0 011.06 0z"/></svg>
            </button>
            <span className="text-xs font-semibold text-white">{MONTHS[viewMonth].slice(0,3)} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="text-slate-400 hover:text-white p-1 rounded transition-colors">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.22 3.22a.75.75 0 000 1.06L9.44 7.5 6.22 10.72a.75.75 0 101.06 1.06l3.78-3.75a.75.75 0 000-1.06L7.28 3.22a.75.75 0 00-1.06 0z"/></svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-0.5">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[9px] font-medium text-slate-600 py-0.5">{d}</div>
            ))}
          </div>

          {/* Calendar cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />
              const cellDate = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const isSelected = cellDate === selectedDate
              const isDisabled = cellDate < minDate
              const isToday    = cellDate === today.toISOString().slice(0,10)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => selectDay(day)}
                  className={cn(
                    'h-7 w-full rounded-md text-[11px] transition-colors',
                    isSelected  && 'bg-grid-500 text-white font-semibold',
                    !isSelected && !isDisabled && 'text-slate-300 hover:bg-white/10',
                    !isSelected && isToday && 'text-grid-300 font-semibold',
                    isDisabled  && 'text-slate-700 cursor-not-allowed',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Time picker */}
          <div className="mt-3 pt-2.5 border-t border-white/5">
            <label className="text-[10px] text-slate-500 block mb-1.5">Time</label>
            <input
              type="time"
              value={selectedTime}
              onChange={changeTime}
              className="input w-full font-mono text-center text-sm py-1.5"
            />
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2.5 w-full btn-primary text-xs py-1.5"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function CreateScuModal({ onClose, onCreated }: CreateScuModalProps) {
  const { addNotification } = useMarketplaceStore()
  const [points, setPoints] = useState<CongestionPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    congestion_point_id: '',
    start_time: '',
    end_time: '',
    mwh: '',
    ask_price_euros: '',
  })

  useEffect(() => {
    congestionApi.list().then(setPoints).catch(() => {})
  }, [])

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.start_time) return setError('Please select a start time.')
    if (!form.end_time)   return setError('Please select an end time.')
    if (new Date(form.end_time) <= new Date(form.start_time))
      return setError('End time must be after start time.')

    setLoading(true)
    try {
      await scusApi.create({
        congestion_point_id: form.congestion_point_id,
        time_window_start: new Date(form.start_time).toISOString(),
        time_window_end:   new Date(form.end_time).toISOString(),
        mwh_amount: Math.round(Number(form.mwh)),
        ask_price_cents: eurosToCents(Number(form.ask_price_euros)),
      })
      addNotification({ type: 'success', title: 'SCU listed', message: 'Your capacity unit is now live on the marketplace.' })
      onCreated()
      onClose()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const totalCents      = eurosToCents(Number(form.ask_price_euros)) * Number(form.mwh)
  const collateralCents = Math.ceil(totalCents * 0.05)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-2 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-white">List capacity unit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create a new SCU on the marketplace</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-5 h-5">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Congestion point */}
          <div>
            <label className="label block mb-2">Congestion point</label>
            <select
              className="input"
              value={form.congestion_point_id}
              onChange={(e) => update('congestion_point_id', e.target.value)}
              required
            >
              <option value="">Select a grid point…</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.operator} ({p.severity})
                </option>
              ))}
            </select>
          </div>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-4">
            <DateTimePicker
              label="Start time"
              value={form.start_time}
              onChange={(v) => update('start_time', v)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <DateTimePicker
              label="End time"
              value={form.end_time}
              onChange={(v) => update('end_time', v)}
              min={form.start_time || new Date().toISOString().slice(0, 16)}
            />
          </div>

          {/* Capacity + price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label block mb-2">Capacity (MWh)</label>
              <input
                type="number"
                className="input font-mono"
                placeholder="e.g. 5"
                min="1"
                step="1"
                value={form.mwh}
                onChange={(e) => update('mwh', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label block mb-2">Ask price (€/MWh)</label>
              <input
                type="number"
                className="input font-mono"
                placeholder="e.g. 12.50"
                min="0.01"
                step="0.01"
                value={form.ask_price_euros}
                onChange={(e) => update('ask_price_euros', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Summary */}
          {form.mwh && form.ask_price_euros && (
            <div className="bg-surface-3 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Total listing value</span>
                <span className="text-white tabular font-medium">
                  €{(Number(form.ask_price_euros) * Number(form.mwh)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Collateral required (5%)</span>
                <span className="text-amber-400 tabular">
                  €{(collateralCents / 100).toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 pt-1 border-t border-white/5">
                Collateral is forfeited if you fail to deliver. Released on confirmed settlement.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'Listing…' : 'List SCU'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}