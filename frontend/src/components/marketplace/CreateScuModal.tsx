'use client'

import { useState, FormEvent, useEffect } from 'react'
import { scus as scusApi, congestion as congestionApi } from '@/lib/api'
import { useMarketplaceStore } from '@/stores/marketplace'
import type { CongestionPoint } from '@/types'
import { cn, eurosToCents } from '@/lib/utils'

interface CreateScuModalProps {
  onClose: () => void
  onCreated: () => void
}

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
    setLoading(true)

    try {
      await scusApi.create({
        congestion_point_id: form.congestion_point_id,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString(),
        mwh: Number(form.mwh),
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

  // Collateral estimate: 5% of total value
  const totalCents = eurosToCents(Number(form.ask_price_euros)) * Number(form.mwh)
  const collateralCents = Math.round(totalCents * 0.05)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-surface-2 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-display font-semibold text-white">List capacity unit</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create a new SCU on the marketplace</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
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
            <div>
              <label className="label block mb-2">Start time</label>
              <input
                type="datetime-local"
                className="input"
                value={form.start_time}
                onChange={(e) => update('start_time', e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                required
              />
            </div>
            <div>
              <label className="label block mb-2">End time</label>
              <input
                type="datetime-local"
                className="input"
                value={form.end_time}
                onChange={(e) => update('end_time', e.target.value)}
                min={form.start_time || new Date().toISOString().slice(0, 16)}
                required
              />
            </div>
          </div>

          {/* Capacity + price */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label block mb-2">Capacity (MWh)</label>
              <input
                type="number"
                className="input font-mono"
                placeholder="e.g. 5"
                min="0.1"
                step="0.1"
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
              <p className="text-[11px] text-slate-600 pt-1 border-t border-white/5">
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
