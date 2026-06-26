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
    <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#e8eaf0', display: 'flex', flexDirection: 'column' }}>

      {/* ── Nav ── */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', height: 56, padding: '0 24px' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#0b80ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 20 20" fill="white" style={{ width: 14, height: 14 }}>
                <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
              </svg>
            </div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 17, letterSpacing: '-0.02em', color: '#fff' }}>
              Grid<span style={{ color: '#0b80ff' }}>Slot</span>
            </span>
          </Link>
        </div>
      </nav>

      {/* ── Form area ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          {/* Heading */}
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', marginBottom: 6 }}>
            Sign in
          </h1>
          <p style={{ fontSize: 14, color: '#8494b2', marginBottom: 32 }}>
            Access the Dutch grid capacity marketplace
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#8494b2', letterSpacing: '0.06em', marginBottom: 8 }}>
                EMAIL
              </label>
              <input
                type="email"
                placeholder="company@example.nl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#0f1525',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8,
                  color: '#e8eaf0',
                  fontSize: 14,
                  fontFamily: 'Space Grotesk, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(11,128,255,0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#8494b2', letterSpacing: '0.06em', marginBottom: 8 }}>
                PASSWORD
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: '#0f1525',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8,
                  color: '#e8eaf0',
                  fontSize: 14,
                  fontFamily: 'Space Grotesk, sans-serif',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => (e.target.style.borderColor = 'rgba(11,128,255,0.5)')}
                onBlur={(e) => (e.target.style.borderColor = 'rgba(255,255,255,0.09)')}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f87171', marginBottom: 20 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 0',
                background: loading ? 'rgba(11,128,255,0.5)' : '#0b80ff',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'Space Grotesk, sans-serif',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 13, color: '#556070' }}>
            No account?{' '}
            <Link href="/register" style={{ color: '#0b80ff', textDecoration: 'none' }}>
              Register your company
            </Link>
          </p>

          {/* Demo accounts */}
          <div style={{ marginTop: 32, background: '#0f1525', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#556070', letterSpacing: '0.06em', marginBottom: 14 }}>
              DEMO ACCOUNTS
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Seller', email: 'seller@portams.nl', pw: 'demo1234' },
                { label: 'Buyer', email: 'buyer@sdc-holding.nl', pw: 'demo1234' },
                { label: 'Both', email: 'both@nhsolar.nl', pw: 'demo1234' },
              ].map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => { setEmail(acc.email); setPassword(acc.pw) }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(11,128,255,0.06)')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)')}
                >
                  <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#0b80ff', background: 'rgba(11,128,255,0.1)', border: '1px solid rgba(11,128,255,0.2)', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em', flexShrink: 0 }}>
                    {acc.label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#8494b2' }}>{acc.email}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}