# GridSlot — CLAUDE.md

You are working on **GridSlot**, an electricity grid capacity marketplace MVP.
Sellers list standardised capacity units (SCUs). Buyers bid on them. A matching
engine clears auctions every 60 s. Post-trade settlement follows a state machine.

---

## Non-negotiable rules

- **Money is always integer cents.** Never store or compute with floats.
  Use `Math.ceil` when dividing. Display-only formatting is the only exception.
- **Every financial state change writes an AuditLog** inside the same
  `prisma.$transaction`. If you add a transition and skip the audit log, revert it.
- **Routes are thin.** No business logic in `routes/`. If a handler exceeds ~20
  lines, extract to `services/`.
- **Never call `fetch` directly in frontend components.** Always use `lib/api.ts`.
- **Never commit `.env`.** Only edit `.env.example`.
- **Never edit `prisma/schema.prisma` without running `npx prisma migrate dev`.**
- **Never use `any` in TypeScript** unless mocking in tests.
- **Tests are required** for every new service function. Mock Prisma with
  `jest-mock-extended`. Never hit a real DB in unit tests.

---

## Project layout

```
gridslot/
├── frontend/          Next.js 14 App Router
│   └── src/
│       ├── app/       Pages (page.tsx per route)
│       ├── components/
│       ├── hooks/     useWebSocket, useCountdown
│       ├── lib/api.ts All HTTP calls
│       └── stores/    Zustand (auth, marketplace)
├── backend/
│   └── src/
│       ├── routes/    Thin HTTP handlers
│       ├── services/  Business logic
│       ├── middleware/ auth, errorHandler, logger, rateLimit
│       ├── websocket/ Socket.io events
│       └── prisma/    Schema + seed
└── mock-data/         JSON source of truth for demo data
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, Tailwind, Zustand, Socket.io-client |
| Backend | Express, Prisma, PostgreSQL, Socket.io |
| Auth | JWT (HS256), 7d expiry |
| Testing | Jest, jest-mock-extended, Supertest |
| Money | Integer cents throughout |

---

## Key data models

```
Company      id, name, kvk_number, kyb_status, role, delivery_score
Scu          id, company_id, congestion_point_id, ask_price_cents, mwh_amount, status
Bid          id, scu_id, company_id, price_cents, status
Trade        id, scu_id, buyer_id, seller_id, clearing_price_cents, status
Settlement   id, trade_id, status, collateral_forfeited_cents, buyer_refund_cents
AuditLog     id, action, company_id, settlement_id, metadata (JSON)
```

`ScuStatus`        ACTIVE | MATCHED | WITHDRAWN | EXPIRED
`BidStatus`        OPEN | WON | LOST | WITHDRAWN
`TradeStatus`      ACTIVE | SETTLED | CANCELLED
`SettlementStatus` MATCHED | PAYMENT_HELD | DELIVERY_PENDING | CONFIRMED | SETTLED | NON_DELIVERY | REFUNDED

---

## Matching engine (`services/matching-engine.ts`)

Algorithm per cycle:
```
for each ACTIVE SCU (FIFO by created_at):
  bids = OPEN bids for SCU ordered by price DESC, created_at ASC
  if bids[0].price >= scu.ask_price_cents:
    transaction:
      scu       → MATCHED
      winning bid → WON
      other bids  → LOST
      create Trade (clearing_price frozen at match time)
      create Settlement (PAYMENT_HELD)
      write AuditLog TRADE_MATCHED
    emit trade:matched + bid:lost via WebSocket
```

Invariants:
- Price-time priority. Ties go to earliest `created_at`.
- Re-check `status = ACTIVE` inside the transaction (race condition guard).
- `clearing_price_cents` is frozen at match time, never recomputed.
- One trade per SCU — enforced by DB unique constraint + status check.

---

## Settlement state machine (`services/settlement.ts`)

```
MATCHED → PAYMENT_HELD → DELIVERY_PENDING → CONFIRMED → SETTLED
                                         ↘ NON_DELIVERY → REFUNDED
```

- CONFIRMED → SETTLED: auto after grace period (runSettlementChecks)
- DELIVERY_PENDING → NON_DELIVERY: auto when window expires (runSettlementChecks)
- NON_DELIVERY → REFUNDED: forfeit 5% seller collateral (`Math.ceil`), refund buyer 100%
- Any backward or skipped transition → throw `InvalidStateTransitionError`
- Every transition: assert state → compute amounts → `prisma.$transaction` (update + AuditLog) → emit `settlement:update`

---

## API routes (all existing — do not recreate)

```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me

GET    /api/scus
GET    /api/scus/:id
POST   /api/scus              (SELLER | BOTH, checks kyb_status = ACTIVE)
PATCH  /api/scus/:id          (withdraw)

POST   /api/bids
GET    /api/bids/my
DELETE /api/bids/:id

GET    /api/trades
GET    /api/trades/:id

GET    /api/settlements/:id
POST   /api/settlements/:id/confirm-delivery

GET    /api/congestion/points
GET    /api/congestion/points/:id

GET    /api/forecast
GET    /api/forecast/:id?range=30

POST   /api/internal/match    (dev only, x-internal-key header required)
```

---

## Error classes (use these, don't invent new ones without reason)

```typescript
ValidationError(message, fields?)       → 400
AuthenticationError(message?)           → 401
AuthorisationError(message?)            → 403
KybNotActiveError()                     → 403
NotFoundError(resource?)                → 404
ConflictError(message?)                 → 409
CapacityExceededError(requested, limit) → 422
InsufficientCollateralError(req, avail) → 422
```

---

## WebSocket events

| Event | Payload |
|---|---|
| `trade:matched` | `{ trade_id, scu_id, clearing_price_cents, seller_id, buyer_id }` |
| `bid:lost` | `{ bid_id, scu_id, reason: 'outbid', company_id }` |
| `settlement:update` | `{ settlement_id, new_status }` |
| `scu:listed` | `{ scu_id, congestion_point_id, ask_price_cents }` |

Frontend hook pattern:
```typescript
useEffect(() => {
  return on('trade:matched', handler); // always return for cleanup
}, [on]);
```

---

## Frontend patterns

**Data fetching — always three states:**
```tsx
if (loading) return <Skeleton />;
if (error)   return <ErrorCard message={error} />;
return <Content data={data} />;
```

**Module-level cache (prevents data loss on navigation):**
```typescript
let _cache: MyType | null = null;
export default function Page() {
  const [data, setData] = useState<MyType | null>(_cache);
  const [loading, setLoading] = useState(!_cache);
  useEffect(() => {
    if (_cache) { setData(_cache); setLoading(false); return; }
    api.fetch().then(d => { _cache = d; setData(d); }).finally(...);
  }, []);
}
```
Use this on: Congestion Map, Forecast page, Marketplace.

**State ownership:**
- Zustand store: auth, marketplace SCU list, WebSocket-driven updates
- useState: form inputs, loading/error, UI toggles

---

## Environment variables

```bash
# backend/.env
DATABASE_URL=
JWT_SECRET=
JWT_EXPIRES_IN=7d
PORT=4000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
INTERNAL_API_KEY=dev-internal-key
MATCHING_ENGINE_INTERVAL_MS=60000
SETTLEMENT_DELIVERY_WINDOW_HOURS=24

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## What still needs to be built (MVP gaps)

### Backend
- Bid validation: reject if bid already OPEN on same SCU by same buyer
- Bid withdrawal: only allow if status = OPEN
- `transitionToDeliveryPending`: set window timestamps from env var
- `runSettlementChecks`: auto CONFIRMED → SETTLED after grace period
- `POST /api/internal/trigger-settlement` (dev/demo use)
- Seed: all 10 congestion points in DB, 3 seller + 3 buyer demo companies with `kyb_status: ACTIVE`

### Frontend
- Marketplace list page: filter by congestion point, paginated
- Marketplace `[id]` page: SCU detail + bid list + bid form
- Portfolio page: own SCUs + own bids with status badges
- Settlement tracker: visual state machine progress on trade detail
- Toast notifications wired to WebSocket events
- `/forecast` page at `frontend/src/app/forecast/page.tsx`
- Sidebar nav link for Forecast (already scaffolded in Sidebar.tsx)

### Tests
- `matching-engine.test.ts`: all invariants including race condition + cycle error isolation
- `settlement.test.ts`: every transition, forfeit calculation, refund calculation
- `api/scus.test.ts`: create, list, withdraw
- `api/bids.test.ts`: place, list, withdraw

---

## Common mistakes — check before submitting

1. Float money → always `Math.ceil` on division, always integers in DB
2. Missing AuditLog in transaction → every financial state change needs one
3. Business logic in route handler → extract to service
4. `fetch` in component → use `lib/api.ts`
5. WebSocket listener without cleanup → `return on(event, handler)` in useEffect
6. Seeded company without `kyb_status: 'ACTIVE'` → can't list SCUs
7. Schema change without migration → always run `npx prisma migrate dev`
8. `res.json(err)` → always use `next(err)` and let errorHandler respond