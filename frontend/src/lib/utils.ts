import type { CongestionSeverity, TradeStatus, SettlementStatus, ScuStatus, BidStatus } from '@/types'

// ─── Money ────────────────────────────────────────────────────────────────────

export function formatEuros(cents: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatEurosCompact(cents: number): string {
  const euros = cents / 100
  if (euros >= 1_000_000) return `€${(euros / 1_000_000).toFixed(1)}M`
  if (euros >= 1_000) return `€${(euros / 1_000).toFixed(1)}K`
  return formatEuros(cents)
}

export function centsToEuros(cents: number): number {
  return cents / 100
}

export function eurosToCents(euros: number): number {
  return Math.round(euros * 100)
}

// ─── Dates (no external dependencies) ────────────────────────────────────────

const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const date = `${String(d.getDate()).padStart(2, '0')} ${NL_MONTHS[d.getMonth()]} ${d.getFullYear()}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${date} ${time}`
}

export function formatTimeWindow(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  const sameDay = s.toDateString() === e.toDateString()
  const sDate = `${String(s.getDate()).padStart(2, '0')} ${NL_MONTHS[s.getMonth()]} ${s.getFullYear()}`
  const sTime = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`
  const eTime = `${String(e.getHours()).padStart(2, '0')}:${String(e.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `${sDate} · ${sTime}–${eTime}`
  const eDate = `${String(e.getDate()).padStart(2, '0')} ${NL_MONTHS[e.getMonth()]}`
  return `${sDate} ${sTime} – ${eDate} ${eTime}`
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const future = diff < 0
  const prefix = future ? 'over ' : ''
  const suffix = future ? '' : ' geleden'
  if (abs < 60_000) return `${prefix}zojuist${suffix}`
  if (abs < 3_600_000) return `${prefix}${Math.floor(abs / 60_000)} min${suffix}`
  if (abs < 86_400_000) return `${prefix}${Math.floor(abs / 3_600_000)} uur${suffix}`
  return `${prefix}${Math.floor(abs / 86_400_000)} dagen${suffix}`
}

export function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now()
  if (diff <= 0) return '00:00'
  const mins = Math.floor(diff / 60_000)
  const secs = Math.floor((diff % 60_000) / 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// ─── Congestion severity ──────────────────────────────────────────────────────

export const congestionColor: Record<CongestionSeverity, string> = {
  GREEN: 'text-congestion-low',
  AMBER: 'text-congestion-medium',
  RED: 'text-congestion-high',
}

export const congestionBg: Record<CongestionSeverity, string> = {
  GREEN: 'bg-congestion-low/15 border-congestion-low/30',
  AMBER: 'bg-congestion-medium/15 border-congestion-medium/30',
  RED: 'bg-congestion-high/15 border-congestion-high/30',
}

export const congestionDot: Record<CongestionSeverity, string> = {
  GREEN: 'bg-congestion-low',
  AMBER: 'bg-congestion-medium',
  RED: 'bg-congestion-high',
}

// ─── SCU status ───────────────────────────────────────────────────────────────

export const scuStatusLabel: Record<ScuStatus, string> = {
  ACTIVE: 'Active',
  MATCHED: 'Matched',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
}

export const scuStatusColor: Record<ScuStatus, string> = {
  ACTIVE: 'text-grid-400',
  MATCHED: 'text-emerald-400',
  WITHDRAWN: 'text-slate-400',
  EXPIRED: 'text-slate-500',
}

// ─── Bid status ───────────────────────────────────────────────────────────────

export const bidStatusColor: Record<BidStatus, string> = {
  OPEN: 'bg-amber-400',
  WON: 'bg-emerald-400',
  LOST: 'bg-red-400',
  WITHDRAWN: 'bg-slate-500',
}

// ─── Trade status ─────────────────────────────────────────────────────────────

export const tradeStatusLabel: Record<TradeStatus, string> = {
  ACTIVE: 'Active',
  SETTLED: 'Settled',
  DISPUTED: 'Disputed',
  CANCELLED: 'Cancelled',
}

export const tradeStatusDot: Record<TradeStatus, string> = {
  ACTIVE: 'bg-amber-400',
  SETTLED: 'bg-emerald-400',
  DISPUTED: 'bg-red-400',
  CANCELLED: 'bg-slate-400',
}

// ─── Settlement status ────────────────────────────────────────────────────────

export const settlementStatusLabel: Record<SettlementStatus, string> = {
  MATCHED: 'Matched',
  PAYMENT_HELD: 'Payment Held',
  DELIVERY_PENDING: 'Awaiting Delivery',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  NON_DELIVERY: 'Non-Delivery',
  REFUNDED: 'Refunded',
}

// ─── Delivery score ───────────────────────────────────────────────────────────

export function formatDeliveryScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`
}

export function deliveryScoreColor(score: number): string {
  if (score >= 0.95) return 'text-congestion-low'
  if (score >= 0.85) return 'text-congestion-medium'
  return 'text-congestion-high'
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function truncate(str: string, n: number): string {
  return str.length > n ? `${str.slice(0, n)}…` : str
}