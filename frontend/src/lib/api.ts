import type {
  AuthResponse,
  Scu,
  Bid,
  Trade,
  Settlement,
  CongestionPoint,
  LoginForm,
  RegisterForm,
  PlaceBidForm,
  CreateScuForm,
  PaginatedResponse,
} from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// ─── Token management ─────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('gs_token')
}

export function setToken(token: string): void {
  localStorage.setItem('gs_token', token)
}

export function clearToken(): void {
  localStorage.removeItem('gs_token')
}

// ─── HTTP primitives ──────────────────────────────────────────────────────────

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (auth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new ApiClientError(res.status, err.code ?? 'UNKNOWN', err.error ?? err.message ?? 'Request failed')
  }

  return res.json() as Promise<T>
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  login: (body: LoginForm) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body, auth: false }),

  register: (body: RegisterForm) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body, auth: false }),

  me: () => request<AuthResponse['company']>('/api/auth/me'),
}

// ─── SCUs — GET / and GET /:id and POST / and PATCH /:id ─────────────────────

export interface ScuFilters {
  congestion_point_id?: string
  status?: string
  min_price?: number
  max_price?: number
  page?: number
  limit?: number
}

export const scus = {
  list: (filters: ScuFilters = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v))
    })
    const qs = params.toString()
    return request<PaginatedResponse<Scu>>(`/api/scus${qs ? `?${qs}` : ''}`)
  },

  get: (id: string) => request<Scu>(`/api/scus/${id}`),

  create: (body: CreateScuForm) =>
    request<Scu>('/api/scus', { method: 'POST', body }),

  // Backend uses PATCH /:id with { status: 'WITHDRAWN' }
  withdraw: (id: string) =>
    request<Scu>(`/api/scus/${id}`, { method: 'PATCH', body: { status: 'WITHDRAWN' } }),
}

// ─── Bids — POST / and GET /my and DELETE /:id ───────────────────────────────

export const bids = {
  place: (scuId: string, body: PlaceBidForm) =>
    request<Bid>('/api/bids', { method: 'POST', body: { scu_id: scuId, ...body } }),

  // Backend route is GET /api/bids/my (not /api/bids)
  list: (filters: { scu_id?: string; status?: string } = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v))
    })
    const qs = params.toString()
    return request<PaginatedResponse<Bid>>(`/api/bids/my${qs ? `?${qs}` : ''}`)
  },

  // Backend uses DELETE /:id
  withdraw: (id: string) =>
    request<Bid>(`/api/bids/${id}`, { method: 'DELETE' }),
}

// ─── Trades — GET / and GET /:id ─────────────────────────────────────────────

export const trades = {
  list: (filters: { status?: string; page?: number } = {}) => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v))
    })
    const qs = params.toString()
    return request<PaginatedResponse<Trade>>(`/api/trades${qs ? `?${qs}` : ''}`)
  },

  get: (id: string) => request<Trade>(`/api/trades/${id}`),
}

// ─── Settlements — POST /:id/confirm-delivery and GET /:id ───────────────────

export const settlements = {
  get: (id: string) => request<Settlement>(`/api/settlements/${id}`),

  confirmDelivery: (id: string) =>
    request<Settlement>(`/api/settlements/${id}/confirm-delivery`, { method: 'POST' }),
}

// ─── Congestion ───────────────────────────────────────────────────────────────

export const congestion = {
  list: () => request<CongestionPoint[]>('/api/congestion/points'),

  get: (id: string) => request<CongestionPoint>(`/api/congestion/points/${id}`),

  forecast: (id: string) =>
    request<{ hour: string; severity: string; load_pct: number }[]>(
      `/api/congestion/points/${id}/forecast`,
    ),
}
