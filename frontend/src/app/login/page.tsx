'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { auth as authApi, ApiClientError } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await authApi.login({ email, password })
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
    <div className="min-h-screen flex">
      {/* Left: form */}
      <div className="w-full max-w-md flex flex-col justify-center px-10 py-16">
        {/* Logo */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-8 h-8 rounded-lg bg-grid-500 flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
              </svg>
            </div>
            <span className="font-display font-semibold text-white">GridSlot</span>
          </div>

          <h1 className="font-display text-3xl font-semibold text-white mb-2">Sign in</h1>
          <p className="text-slate-400 text-sm">
            Access the Dutch grid capacity marketplace
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="label block mb-2">Email</label>
            <input
              type="email"
              className="input"
              placeholder="company@example.nl"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="label block mb-2">Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-sm text-slate-500">
          No account?{' '}
          <Link href="/register" className="text-grid-400 hover:text-grid-300 transition-colors">
            Register your company
          </Link>
        </p>

        {/* Demo credentials */}
        <div className="mt-8 p-4 bg-surface-2 border border-white/5 rounded-xl">
          <p className="text-xs font-medium text-slate-400 mb-3">Demo accounts</p>
          <div className="space-y-2">
            {[
              { label: 'Seller', email: 'seller@portams.nl', pw: 'demo1234' },
              { label: 'Buyer', email: 'buyer@sdc-holding.nl', pw: 'demo1234' },
              { label: 'Both', email: 'both@nhsolar.nl', pw: 'demo1234' },
            ].map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => { setEmail(acc.email); setPassword(acc.pw) }}
                className="w-full text-left px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-4 transition-colors"
              >
                <span className="text-xs text-slate-400">{acc.label}</span>
                <span className="text-xs text-slate-500 font-mono ml-2">{acc.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right: hero visual */}
      <div className="flex-1 relative overflow-hidden bg-surface-1 border-l border-white/5 hidden lg:block">
        <div className="absolute inset-0 bg-grid-pattern opacity-40" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, rgba(11,128,255,0.12) 0%, transparent 70%)',
          }}
        />

        {/* Floating stats */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-16">
          <div className="text-center mb-4">
            <p className="font-display text-4xl font-semibold text-white mb-2">
              Grid capacity,<br />
              <span className="text-grid-400">traded efficiently.</span>
            </p>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">
              The first digital marketplace for GTO-compliant electricity grid capacity in the Netherlands.
            </p>
          </div>

          {[
            { value: '20,000+', label: 'Companies on waiting lists' },
            { value: 'ACM', label: 'Regulated since April 2024' },
            { value: '< 5 min', label: 'Matching cycle' },
          ].map((stat) => (
            <div key={stat.label} className="card px-6 py-4 text-center w-full max-w-xs gradient-border">
              <p className="font-display text-2xl font-semibold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
