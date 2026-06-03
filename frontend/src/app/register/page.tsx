'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { auth as authApi, ApiClientError } from '@/lib/api'
import type { UserRole } from '@/types'

const ROLES: { value: UserRole; label: string; desc: string }[] = [
  { value: 'SELLER', label: 'Seller', desc: 'List unused grid capacity' },
  { value: 'BUYER', label: 'Buyer', desc: 'Bid on available capacity' },
  { value: 'BOTH', label: 'Both', desc: 'Buy and sell capacity' },
]

const GRID_OPERATORS = [
  'Liander', 'Stedin', 'Enexis', 'Westland Infra', 'Coteq', 'Rendo', 'Zebra',
]

export default function RegisterPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    kvk_number: '',
    role: 'BUYER' as UserRole,
    grid_operator: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const update = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await authApi.register(form)
      setAuth(res.company, res.token)
      router.replace('/dashboard')
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Network error. Is the backend running?')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-7 h-7 rounded-lg bg-grid-500 flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
              <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
            </svg>
          </div>
          <span className="font-display font-semibold text-white">GridSlot</span>
        </div>

        <h1 className="font-display text-2xl font-semibold text-white mb-1">Register company</h1>
        <p className="text-slate-400 text-sm mb-8">KYB verification happens automatically via KVK number.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company name */}
          <div>
            <label className="label block mb-2">Company name</label>
            <input
              type="text"
              className="input"
              placeholder="Acme Energy B.V."
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
          </div>

          {/* KVK */}
          <div>
            <label className="label block mb-2">KVK number</label>
            <input
              type="text"
              className="input font-mono"
              placeholder="12345678"
              value={form.kvk_number}
              onChange={(e) => update('kvk_number', e.target.value.replace(/\D/g, '').slice(0, 8))}
              minLength={8}
              maxLength={8}
              required
            />
            <p className="text-[11px] text-slate-500 mt-1.5">8-digit Dutch Chamber of Commerce number</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Email */}
            <div className="col-span-2">
              <label className="label block mb-2">Work email</label>
              <input
                type="email"
                className="input"
                placeholder="you@company.nl"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="col-span-2">
              <label className="label block mb-2">Password</label>
              <input
                type="password"
                className="input"
                placeholder="min. 8 characters"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="label block mb-2">Trading role</label>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => update('role', r.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    form.role === r.value
                      ? 'border-grid-500/60 bg-grid-500/10'
                      : 'border-white/8 bg-surface-3 hover:border-white/15'
                  }`}
                >
                  <p className={`text-xs font-medium ${form.role === r.value ? 'text-grid-400' : 'text-slate-300'}`}>
                    {r.label}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Grid operator */}
          <div>
            <label className="label block mb-2">Grid operator <span className="normal-case text-slate-500 font-normal">(optional)</span></label>
            <select
              className="input"
              value={form.grid_operator}
              onChange={(e) => update('grid_operator', e.target.value)}
            >
              <option value="">Select grid operator…</option>
              {GRID_OPERATORS.map((op) => (
                <option key={op} value={op}>{op}</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          Already registered?{' '}
          <Link href="/login" className="text-grid-400 hover:text-grid-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
