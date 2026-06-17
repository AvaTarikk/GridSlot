'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';

const STATS = [
  { value: '20,000+', label: 'companies on grid waiting lists' },
  { value: '€10–40B', label: 'annual economic cost of congestion' },
  { value: '10 years', label: 'average grid reinforcement timeline' },
];

const HOW = [
  { n: '01', title: 'List unused capacity', body: 'Sellers with Group Transport Agreements list their unused MWh as a Standardised Capacity Unit with a time window and ask price.' },
  { n: '02', title: 'Competitive bidding', body: 'Buyers browse active listings and place bids. The matching engine runs every 60 seconds — highest bid wins.' },
  { n: '03', title: 'Automated settlement', body: 'Funds are held in escrow. On confirmed delivery, funds release automatically. Non-delivery triggers a collateral penalty and full buyer refund.' },
];

export default function LandingPage() {
  const router = useRouter();
  const { company, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && company) router.push('/dashboard');
  }, [isLoading, company, router]);

  if (isLoading) return (
    <div style={{ minHeight: '100vh', background: '#0a0c0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#f59e0b', fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '0.1em' }}>LOADING...</div>
    </div>
  );

  if (company) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c0f', color: '#e8eaf0' }}>
      <nav style={{ borderBottom: '1px solid #1f2535', padding: '0 48px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'rgba(10,12,15,0.95)', backdropFilter: 'blur(8px)', zIndex: 50 }}>
        <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 20, letterSpacing: '-0.02em' }}>
          Grid<span style={{ color: '#f59e0b' }}>Slot</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/login" className="btn btn-ghost" style={{ fontSize: 13 }}>Sign in</Link>
          <Link href="/register" className="btn btn-primary" style={{ fontSize: 13 }}>Register company</Link>
        </div>
      </nav>

      <section style={{ padding: '96px 48px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 20, padding: '4px 14px', marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: '#f59e0b', fontFamily: 'IBM Plex Mono', letterSpacing: '0.06em' }}>BUILT ON THE ACM CONGESTION FRAMEWORK · NL</span>
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk', fontSize: 'clamp(36px,5vw,64px)', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 24px', maxWidth: 800 }}>
          The financial marketplace for{' '}
          <span style={{ color: '#f59e0b' }}>grid capacity</span>
        </h1>
        <p style={{ fontSize: 18, color: '#8892a4', lineHeight: 1.7, maxWidth: 560, marginBottom: 40 }}>
          GridSlot turns unused electricity transmission rights into tradeable assets. Buy and sell grid capacity through competitive auction — automated matching, transparent pricing, guaranteed settlement.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/register" className="btn btn-primary" style={{ fontSize: 15, padding: '12px 28px' }}>Get started free</Link>
          <Link href="/login" className="btn btn-ghost" style={{ fontSize: 15, padding: '12px 28px' }}>Sign in →</Link>
        </div>
      </section>

      <section style={{ borderTop: '1px solid #1f2535', borderBottom: '1px solid #1f2535', background: '#0d0f14' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 48px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0 }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: '28px 32px', borderRight: i < 2 ? '1px solid #1f2535' : 'none' }}>
              <div style={{ fontFamily: 'Space Grotesk', fontSize: 36, fontWeight: 700, color: '#f59e0b', letterSpacing: '-0.02em', marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 14, color: '#8892a4' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '80px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 11, color: '#4a5568', fontFamily: 'IBM Plex Mono', letterSpacing: '0.08em', marginBottom: 16 }}>HOW IT WORKS</div>
        <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 48px' }}>From congestion to cleared trade</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {HOW.map(h => (
            <div key={h.n} className="card" style={{ padding: 28 }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#f59e0b', marginBottom: 16, letterSpacing: '0.06em' }}>{h.n}</div>
              <h3 style={{ fontFamily: 'Space Grotesk', fontSize: 18, fontWeight: 600, color: '#e8eaf0', margin: '0 0 12px' }}>{h.title}</h3>
              <p style={{ fontSize: 14, color: '#8892a4', lineHeight: 1.7, margin: 0 }}>{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 48px 80px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="card" style={{ padding: 32 }}>
          <div style={{ fontSize: 11, color: '#4a5568', fontFamily: 'IBM Plex Mono', letterSpacing: '0.08em', marginBottom: 20 }}>SETTLEMENT PIPELINE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
            {['MATCHED', 'PAYMENT HELD', 'DELIVERY PENDING', 'CONFIRMED', 'SETTLED'].map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ textAlign: 'center', minWidth: 120, padding: '0 8px' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: i === 4 ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.1)', border: `2px solid ${i === 4 ? '#10b981' : '#f59e0b'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 12, color: i === 4 ? '#10b981' : '#f59e0b', fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <div style={{ fontSize: 10, color: '#8892a4', fontFamily: 'IBM Plex Mono', letterSpacing: '0.04em', lineHeight: 1.4 }}>{s}</div>
                </div>
                {i < 4 && <div style={{ width: 40, height: 2, background: '#1f2535', flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ borderTop: '1px solid #1f2535', padding: '80px 48px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Space Grotesk', fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 16px' }}>Ready to trade capacity?</h2>
        <p style={{ color: '#8892a4', fontSize: 16, marginBottom: 32 }}>Register your company and start trading in minutes.</p>
        <Link href="/register" className="btn btn-primary" style={{ fontSize: 15, padding: '12px 36px' }}>Register your company</Link>
      </section>

      <footer style={{ borderTop: '1px solid #1f2535', padding: '24px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'Space Grotesk', fontWeight: 700, color: '#e8eaf0' }}>Grid<span style={{ color: '#f59e0b' }}>Slot</span></div>
        <div style={{ fontSize: 12, color: '#4a5568' }}>MSc FinTech · University of Amsterdam · 2026</div>
        <div style={{ fontSize: 12, color: '#4a5568', fontFamily: 'IBM Plex Mono' }}>Built on ACM framework</div>
      </footer>
    </div>
  );
}
