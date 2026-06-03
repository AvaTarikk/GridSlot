// ─── Enums ────────────────────────────────────────────────────────────────────

export type KybStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'
export type UserRole = 'SELLER' | 'BUYER' | 'BOTH' | 'ADMIN'
export type ScuStatus = 'LISTED' | 'RESERVED' | 'MATCHED' | 'SETTLED' | 'WITHDRAWN' | 'EXPIRED'
export type BidStatus = 'PENDING' | 'MATCHED' | 'LOST' | 'WITHDRAWN'
export type TradeStatus = 'MATCHED' | 'PAYMENT_HELD' | 'DELIVERY_PENDING' | 'CONFIRMED' | 'SETTLED' | 'NON_DELIVERY' | 'REFUNDED'
export type SettlementStatus = 'PENDING' | 'PAYMENT_HELD' | 'DELIVERY_PENDING' | 'CONFIRMED' | 'SETTLED' | 'NON_DELIVERY' | 'REFUNDED'
export type CongestionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

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
  start_time: string
  end_time: string
  mwh: number
  ask_price_cents: number
  status: ScuStatus
  collateral_held_cents: number
  bid_count?: number
  highest_bid_cents?: number
  created_at: string
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

// ─── API Response shapes ───────────────────────────────────────────────────────

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

export interface ApiError {
  error: string
  code?: string
  details?: unknown
}

// ─── Form types ───────────────────────────────────────────────────────────────

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

export interface CreateScuForm {
  congestion_point_id: string
  start_time: string
  end_time: string
  mwh: number
  ask_price_cents: number
}

// ─── Dashboard summary ────────────────────────────────────────────────────────

export interface DashboardSummary {
  active_listings: number
  open_bids: number
  total_revenue_cents: number
  total_spend_cents: number
  delivery_score: number
  pending_settlements: number
  recent_trades: Trade[]
  recent_bids: Bid[]
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export type WsEventType =
  | 'trade:matched'
  | 'bid:lost'
  | 'settlement:update'
  | 'congestion:update'
  | 'scu:listed'

export interface WsEvent<T = unknown> {
  type: WsEventType
  payload: T
  timestamp: string
}
