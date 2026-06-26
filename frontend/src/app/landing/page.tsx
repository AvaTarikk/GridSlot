'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth';

const MAX_W = 1100;

const HOW = [
  {
    n: '01',
    title: 'List your capacity',
    body: 'Sellers with Group Transport Agreements list unused MWh as a Standardised Capacity Unit with an ask price and delivery window.',
  },
  {
    n: '02',
    title: 'Bid competitively',
    body: 'Buyers browse active SCUs and place bids. The matching engine runs every 60 seconds — highest bid above ask clears the auction.',
  },
  {
    n: '03',
    title: 'Settle automatically',
    body: 'Payment is held the moment a trade matches. Funds release on delivery confirmation. No manual follow-up, no credit risk.',
  },
];

const PRODUCTS = [
  {
    badge: 'MARKETPLACE',
    name: 'SCU marketplace',
    desc: 'Browse and bid on active capacity slots in real time.',
    points: [
      'Highest bid wins, every 60 seconds',
      'Live bid updates as they happen',
      "Instant notification if you're outbid",
      'Per-slot delivery windows',
    ],
  },
  {
    badge: 'FORECAST',
    name: 'Price forecast',
    desc: '30-day price history and a 14-day forward outlook per grid location.',
    points: [
      'See where prices are heading',
      'Low / medium / high price bands',
      'Scenario planning (heat waves, EV charging...)',
      '10 congestion points across the Netherlands',
    ],
  },
];

const PIPELINE = [
  { n: '1', label: 'Matched' },
  { n: '2', label: 'Payment held' },
  { n: '3', label: 'Delivery pending' },
  { n: '4', label: 'Confirmed' },
  { n: '✓', label: 'Settled', done: true },
];

// Live bids to show in the hero panel
const LIVE_BIDS = [
  { location: 'Randstad Noord', mwh: 12, ask: 48.20, bid: 51.00, status: 'active' },
  { location: 'Zeeland Kust', mwh: 8, ask: 39.50, bid: 41.80, status: 'active' },
  { location: 'Noord-Holland', mwh: 25, ask: 55.00, bid: 55.00, status: 'matched' },
  { location: 'Groningen Noord', mwh: 6, ask: 33.10, bid: 35.40, status: 'active' },
];

const inner: React.CSSProperties = {
  maxWidth: MAX_W,
  margin: '0 auto',
  width: '100%',
};

// Readable body text color (was #3a4560 / #4a5568 — too dark)
const BODY = '#8494b2';
const LABEL = '#556070';

const CheckIcon = () => (
  <svg viewBox="0 0 12 12" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }}>
    <path d="M2 6l3 3 5-5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage() {
  const router = useRouter();
  const { company, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && company) router.push('/dashboard');
  }, [isLoading, company, router]);

  if (isLoading)
    return (
      <div style={{ minHeight: '100vh', background: '#0a0e1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#0b80ff', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '0.1em' }}>
          LOADING...
        </div>
      </div>
    );

  if (company) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#e8eaf0' }}>

      {/* ── Nav ── */}
      <nav style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'rgba(10,14,26,0.95)', backdropFilter: 'blur(8px)', zIndex: 50 }}>
        <div style={{ ...inner, display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: '#0b80ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 20 20" fill="white" style={{ width: 14, height: 14 }}>
                <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
              </svg>
            </div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 17, letterSpacing: '-0.02em', color: '#fff' }}>
              Grid<span style={{ color: '#0b80ff' }}>Slot</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/login" style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.10)', fontSize: 13, color: '#a0aab8', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif' }}>
              Sign in
            </Link>
            <Link href="/register" style={{ padding: '6px 14px', borderRadius: 8, background: '#0b80ff', fontSize: 13, color: '#fff', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
              Register company
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ padding: '0 24px' }}>
        <div style={{ ...inner, padding: '80px 0 72px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>

          {/* Left: copy */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#0b80ff', background: 'rgba(11,128,255,0.08)', border: '1px solid rgba(11,128,255,0.18)', borderRadius: 20, padding: '3px 12px', marginBottom: 24, letterSpacing: '0.04em' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#0b80ff', display: 'inline-block', flexShrink: 0 }} />
              ELECTRICITY GRID CAPACITY MARKETPLACE
            </div>

            <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 'clamp(28px, 3.5vw, 48px)', fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 20, color: '#fff' }}>
              Trade grid capacity.{' '}
              <span style={{ color: '#0b80ff' }}>Competitively. Transparently.</span>
            </h1>

            <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, maxWidth: 440, marginBottom: 36 }}>
              List unused transmission rights, bid on available slots, and settle automatically — with guaranteed escrow and real-time price intelligence.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
              <Link href="/register" style={{ padding: '10px 22px', fontSize: 14, borderRadius: 8, background: '#0b80ff', color: '#fff', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}>
                Get started free
              </Link>
              <Link href="/login" style={{ padding: '10px 22px', fontSize: 14, borderRadius: 8, background: 'transparent', color: '#a0aab8', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', border: '1px solid rgba(255,255,255,0.10)' }}>
                Sign in →
              </Link>
            </div>

            {/* Trust stats */}
            <div style={{ display: 'flex', gap: 32 }}>
              {[
                { value: '€2.4M', label: 'Traded this month' },
                { value: '60s', label: 'Auction interval' },
                { value: '10', label: 'Grid locations' },
              ].map((s) => (
                <div key={s.label}>
                  <p style={{ fontSize: 20, fontWeight: 600, color: '#fff', fontFamily: 'Space Grotesk, sans-serif', letterSpacing: '-0.02em', marginBottom: 2 }}>{s.value}</p>
                  <p style={{ fontSize: 11, color: LABEL, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: live bids panel */}
          <div style={{ background: '#0f1525', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#10b981', letterSpacing: '0.06em' }}>LIVE MARKETPLACE</span>
              </div>
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: LABEL }}>Next auction in 00:38</span>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 70px 70px 70px', gap: 0, padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {['LOCATION', 'MWh', 'ASK', 'BID', 'STATUS'].map((h) => (
                <span key={h} style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: LABEL, letterSpacing: '0.06em', textAlign: h === 'LOCATION' ? 'left' : 'right' }}>{h}</span>
              ))}
            </div>

            {/* Rows */}
            {LIVE_BIDS.map((b, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 70px 70px 70px', gap: 0, padding: '12px 18px', borderBottom: i < LIVE_BIDS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#c8d0e0', fontFamily: 'Space Grotesk, sans-serif' }}>{b.location}</span>
                <span style={{ fontSize: 12, color: BODY, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>{b.mwh}</span>
                <span style={{ fontSize: 12, color: BODY, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right' }}>€{b.ask.toFixed(2)}</span>
                <span style={{ fontSize: 12, color: b.bid >= b.ask ? '#10b981' : '#e8eaf0', fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', fontWeight: 500 }}>€{b.bid.toFixed(2)}</span>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{
                    fontSize: 9, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.04em',
                    padding: '2px 7px', borderRadius: 10,
                    background: b.status === 'matched' ? 'rgba(16,185,129,0.1)' : 'rgba(11,128,255,0.1)',
                    border: `1px solid ${b.status === 'matched' ? 'rgba(16,185,129,0.25)' : 'rgba(11,128,255,0.2)'}`,
                    color: b.status === 'matched' ? '#10b981' : '#0b80ff',
                  }}>
                    {b.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}

            {/* Panel footer */}
            <div style={{ padding: '12px 18px', background: 'rgba(11,128,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: LABEL, fontFamily: 'JetBrains Mono, monospace' }}>4 active slots · 1 matched</span>
              <Link href="/login" style={{ fontSize: 11, color: '#0b80ff', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none', letterSpacing: '0.03em' }}>View all →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature strip ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0f1525', padding: '0 24px' }}>
        <div style={{ ...inner, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            {
              icon: <svg viewBox="0 0 20 20" fill="none" stroke="#0b80ff" strokeWidth="1.5" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>,
              title: 'Live marketplace',
              desc: 'Capacity slots auction every 60 seconds. Highest bid wins — fair, fast, transparent.',
            },
            {
              icon: <svg viewBox="0 0 20 20" fill="none" stroke="#0b80ff" strokeWidth="1.5" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>,
              title: 'Guaranteed settlement',
              desc: 'Payment held in escrow at match. Released on delivery. Non-delivery means a full refund.',
            },
            {
              icon: <svg viewBox="0 0 20 20" fill="none" stroke="#0b80ff" strokeWidth="1.5" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>,
              title: 'Price intelligence',
              desc: '14 days of price forecasts across the Netherlands. Know what to expect before you bid.',
            },
          ].map((f, i) => (
            <div key={i} style={{ padding: '28px 32px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(11,128,255,0.1)', border: '1px solid rgba(11,128,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                {f.icon}
              </div>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#c8d0e0', marginBottom: 6 }}>{f.title}</p>
              <p style={{ fontSize: 13, color: BODY, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ── */}
      <section style={{ padding: '64px 24px' }}>
        <div style={inner}>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: LABEL, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>HOW IT WORKS</p>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 36, color: '#fff' }}>
            From listing to settled trade in three steps
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {HOW.map((h) => (
              <div key={h.n} style={{ background: '#0f1525', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 24 }}>
                <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#0b80ff', marginBottom: 14, letterSpacing: '0.06em' }}>{h.n}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: '#c8d0e0', marginBottom: 8 }}>{h.title}</p>
                <p style={{ fontSize: 13, color: BODY, lineHeight: 1.6 }}>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Products ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0f1525', padding: '64px 24px' }}>
        <div style={inner}>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: LABEL, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>WHAT YOU GET</p>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 24, color: '#fff' }}>
            Everything to trade and monitor capacity
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {PRODUCTS.map((p) => (
              <div key={p.badge} style={{ background: '#151c30', border: '1px solid rgba(11,128,255,0.2)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#0b80ff', background: 'rgba(11,128,255,0.08)', border: '1px solid rgba(11,128,255,0.15)', borderRadius: 20, padding: '2px 10px', letterSpacing: '0.04em', alignSelf: 'flex-start' }}>
                  {p.badge}
                </div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#c8d0e0' }}>{p.name}</p>
                <p style={{ fontSize: 13, color: BODY, lineHeight: 1.6 }}>{p.desc}</p>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {p.points.map((pt) => (
                    <li key={pt} style={{ fontSize: 12, color: BODY, display: 'flex', alignItems: 'center', gap: 7 }}>
                      <CheckIcon />
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Settlement wide card */}
          <div style={{ background: '#151c30', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(11,128,255,0.1)', border: '1px solid rgba(11,128,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#0b80ff" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 500, color: '#c8d0e0', marginBottom: 3 }}>Settlement dashboard</p>
                <p style={{ fontSize: 13, color: BODY }}>Track every trade from match to payout — fully automated, no chasing needed.</p>
              </div>
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px 20px', flexShrink: 0 }}>
              {['Real-time status updates', 'Delivery countdown timers', 'Full audit trail'].map((pt) => (
                <li key={pt} style={{ fontSize: 12, color: BODY, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <CheckIcon />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── Pipeline ── */}
      <section style={{ padding: '64px 24px' }}>
        <div style={inner}>
          <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: LABEL, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>SETTLEMENT PIPELINE</p>
          <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 28, color: '#fff' }}>
            Five stages, fully automated
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', padding: '24px 32px', background: '#0f1525', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
            {PIPELINE.map((s, i) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, fontFamily: 'JetBrains Mono, monospace', background: s.done ? 'rgba(16,185,129,0.1)' : 'rgba(11,128,255,0.1)', border: `1px solid ${s.done ? 'rgba(16,185,129,0.3)' : 'rgba(11,128,255,0.25)'}`, color: s.done ? '#10b981' : '#0b80ff', flexShrink: 0 }}>
                    {s.n}
                  </div>
                  <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: BODY, letterSpacing: '0.03em', textAlign: 'center', lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </p>
                </div>
                {i < PIPELINE.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 8px', marginBottom: 22 }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '72px 24px' }}>
        <div style={{ ...inner, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40 }}>
          <div>
            <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 8, color: '#fff' }}>
              Ready to start trading?
            </h2>
            <p style={{ fontSize: 14, color: BODY }}>Register your company and place your first bid in minutes.</p>
          </div>
          <Link href="/register" style={{ padding: '10px 24px', fontSize: 14, borderRadius: 8, background: '#0b80ff', color: '#fff', textDecoration: 'none', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
            Register your company
          </Link>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px' }}>
        <div style={{ ...inner, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, background: '#0b80ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 20 20" fill="white" style={{ width: 11, height: 11 }}>
                <path d="M11.983 1.907a.75.75 0 00-1.292-.657l-8.5 9.5A.75.75 0 002.75 12h6.572l-1.305 6.093a.75.75 0 001.292.657l8.5-9.5A.75.75 0 0017.25 8h-6.572l1.305-6.093z" />
              </svg>
            </div>
            <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 600, fontSize: 15, color: '#fff' }}>
              Grid<span style={{ color: '#0b80ff' }}>Slot</span>
            </span>
          </div>
          <p style={{ fontSize: 11, color: LABEL, fontFamily: 'JetBrains Mono, monospace' }}>© 2026 GridSlot</p>
        </div>
      </footer>
    </div>
  );
}