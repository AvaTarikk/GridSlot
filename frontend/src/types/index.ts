// ─── Enums (must match backend prisma/schema.prisma exactly) ──────────────────

export type KybStatus = 'PENDING' | 'VERIFIED' | 'ACTIVE' | 'SUSPENDED'
export type UserRole = 'SELLER' | 'BUYER' | 'BOTH' | 'ADMIN'
export type ScuStatus = 'ACTIVE' | 'MATCHED' | 'WITHDRAWN' | 'EXPIRED'
export type BidStatus = 'OPEN' | 'WON' | 'LOST' | 'WITHDRAWN'
export type TradeStatus = 'ACTIVE' | 'SETTLED' | 'DISPUTED' | 'CANCELLED'
export type SettlementStatus = 'MATCHED' | 'PAYMENT_HELD' | 'DELIVERY_PENDING' | 'CONFIRMED' | 'SETTLED' | 'NON_DELIVERY' | 'REFUNDED'
export type CongestionSeverity = 'GREEN' | 'AMBER' | 'RED'

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  kvk_number: string
  kyb_status: KybStatus
  role: UserRole
  delivery_score: number
  created_at: string
}

export interface CongestionPoint {
  id: string
  name: string
  operator: string
  latitude: number
  longitude: number
  severity: CongestionSeverity
  description?: string
  active_scus?: number
}

export interface Scu {
  id: string
  company_id: string
  congestion_point_id: string
  congestion_point?: CongestionPoint
  company?: Pick<Company, 'id' | 'name' | 'delivery_score'>
  // backend field names
  time_window_start: string
  time_window_end: string
  mwh_amount: number
  // legacy aliases (some components still use these)
  start_time?: string
  end_time?: string
  mwh?: number
  ask_price_cents: number
  status: ScuStatus
  collateral_held_cents: number
  bid_count?: number
  highest_bid_cents?: number
  created_at: string
}

export interface CreateScuForm {
  congestion_point_id: string
  time_window_start: string
  time_window_end: string
  mwh_amount: number
  ask_price_cents: number
}

export interface Bid {
  id: string
  company_id: string
  company?: Pick<Company, 'id' | 'name'>
  scu_id: string
  scu?: Scu
  price_cents: number
  status: BidStatus
  created_at: string
}

export interface Trade {
  id: string
  scu_id: string
  scu?: Scu
  buyer_id: string
  buyer?: Pick<Company, 'id' | 'name'>
  seller_id: string
  seller?: Pick<Company, 'id' | 'name'>
  clearing_price_cents: number
  status: TradeStatus
  created_at: string
  settlement?: Settlement
}

export interface Settlement {
  id: string
  trade_id: string
  status: SettlementStatus
  payment_held_cents: number
  collateral_forfeited_cents: number
  settled_at?: string
  created_at: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total?: number
  page?: number
  limit?: number
  pagination?: {
    total: number
    page: number
    limit: number
    pages: number
  }
}

export interface AuthResponse {
  token: string
  company: Company
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  name: string
  email: string
  password: string
  kvk_number: string
  role: UserRole
  grid_operator?: string
}

export interface PlaceBidForm {
  price_cents: number
}

export type WsEventType = 'trade:matched' | 'bid:lost' | 'settlement:update' | 'congestion:update' | 'scu:listed'

export interface WsEvent<T = unknown> {
  type: WsEventType
  payload: T
  timestamp: string
}
