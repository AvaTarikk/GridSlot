import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { nl } from 'date-fns/locale'
import type { CongestionSeverity, TradeStatus, SettlementStatus, ScuStatus } from '@/types'

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

// ─── Dates ────────────────────────────────────────────────────────────────────

export function formatDate(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy', { locale: nl })
}

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), 'dd MMM yyyy HH:mm', { locale: nl })
}

export function formatTimeWindow(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd')
  if (sameDay) {
    return `${format(s, 'dd MMM yyyy')} · ${format(s, 'HH:mm')}–${format(e, 'HH:mm')}`
  }
  return `${format(s, 'dd MMM')} ${format(s, 'HH:mm')} – ${format(e, 'dd MMM')} ${format(e, 'HH:mm')}`
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: nl })
}

export function formatCountdown(targetIso: string): string {
  const diff = new Date(targetIso).getTime() - Date.now()
  if (diff <= 0) return '00:00'
  const mins = Math.floor(diff / 60_000)
  const secs = Math.floor((diff % 60_000) / 1000)
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

// ─── Status labels + colors ───────────────────────────────────────────────────

export const congestionColor: Record<CongestionSeverity, string> = {
  LOW: 'text-congestion-low',
  MEDIUM: 'text-congestion-medium',
  HIGH: 'text-congestion-high',
  CRITICAL: 'text-red-300',
}

export const congestionBg: Record<CongestionSeverity, string> = {
  LOW: 'bg-congestion-low/15 border-congestion-low/30',
  MEDIUM: 'bg-congestion-medium/15 border-congestion-medium/30',
  HIGH: 'bg-congestion-high/15 border-congestion-high/30',
  CRITICAL: 'bg-red-500/20 border-red-400/40',
}

export const congestionDot: Record<CongestionSeverity, string> = {
  LOW: 'bg-congestion-low',
  MEDIUM: 'bg-congestion-medium',
  HIGH: 'bg-congestion-high',
  CRITICAL: 'bg-red-400',
}

export const tradeStatusLabel: Record<TradeStatus, string> = {
  MATCHED: 'Matched',
  PAYMENT_HELD: 'Payment Held',
  DELIVERY_PENDING: 'Awaiting Delivery',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  NON_DELIVERY: 'Non-Delivery',
  REFUNDED: 'Refunded',
}

export const settlementStatusLabel: Record<SettlementStatus, string> = {
  PENDING: 'Pending',
  PAYMENT_HELD: 'Payment Held',
  DELIVERY_PENDING: 'Awaiting Delivery',
  CONFIRMED: 'Confirmed',
  SETTLED: 'Settled',
  NON_DELIVERY: 'Non-Delivery',
  REFUNDED: 'Refunded',
}

export const scuStatusLabel: Record<ScuStatus, string> = {
  LISTED: 'Listed',
  RESERVED: 'Reserved',
  MATCHED: 'Matched',
  SETTLED: 'Settled',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
}

export const scuStatusColor: Record<ScuStatus, string> = {
  LISTED: 'text-grid-400',
  RESERVED: 'text-amber-400',
  MATCHED: 'text-emerald-400',
  SETTLED: 'text-emerald-300',
  WITHDRAWN: 'text-slate-400',
  EXPIRED: 'text-slate-500',
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
