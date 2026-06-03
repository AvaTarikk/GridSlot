# CLAUDE.md — GridSlot Agent Instructions

This file configures Claude Code's behaviour in the GridSlot repository.
Read this before touching any file. These instructions are non-negotiable.

---

## Project Summary

GridSlot is a B2B financial marketplace for electricity grid capacity in the Netherlands.
It standardises grid capacity into Standardised Capacity Units (SCUs) and provides
auction-based price discovery, matching, and settlement.

Stack: Next.js 14 (frontend) + Node.js/Express (backend) + PostgreSQL + Prisma.

---

## Absolute Rules

1. **Never commit `.env` files.** Only edit `.env.example` files.
2. **Never modify the Prisma schema without a migration.** Always run `npx prisma migrate dev` after schema changes.
3. **Never touch financial calculation logic without adding or updating tests.** Coverage on `matching-engine.ts` and `settlement.ts` must stay ≥ 90%.
4. **Never store monetary values as floats.** All amounts are integers in cents (EUR). Use `amount_cents: Int` in Prisma, never `amount: Float`.
5. **Never expose internal endpoints in production.** Anything under `/api/internal/` must be gated by `NODE_ENV !== 'production'`.
6. **Never log JWTs, passwords, or payment data** to stdout or any log file.

---

## Repository Layout

```
gridslot/
├── frontend/          # Next.js 14 App Router application
├── backend/           # Express API + services
│   ├── src/
│   │   ├── routes/    # Express route handlers (thin — no business logic)
│   │   ├── services/  # Business logic lives here
│   │   ├── middleware/
│   │   └── websocket/
│   ├── prisma/        # Schema + migrations + seed
│   └── tests/
├── mock-data/         # JSON seed files — do not call external APIs in MVP
├── docs/              # Architecture and API docs
└── .claude/           # Extended agent instructions (see instructions.md)
```

---

## Naming Conventions

### Files
- React components: `PascalCase.tsx` (e.g., `BidCard.tsx`)
- Hooks: `use-camel-case.ts` (e.g., `use-websocket.ts`)
- Services: `kebab-case.ts` (e.g., `matching-engine.ts`)
- Tests: `[filename].test.ts` co-located with source or in `tests/`
- Constants: `UPPER_SNAKE_CASE` in a `constants.ts` file per module

### Database (Prisma)
- Models: `PascalCase` singular (e.g., `Company`, `Scu`, `Trade`)
- Fields: `snake_case` (e.g., `created_at`, `ask_price_cents`)
- Enums: `UPPER_SNAKE_CASE` values (e.g., `KYB_PENDING`, `PAYMENT_HELD`)

### API Endpoints
- REST: plural nouns, kebab-case (e.g., `/api/scus`, `/api/congestion-points`)
- No verbs in endpoint paths — use HTTP methods for actions

### TypeScript
- Interfaces for data shapes: `ICompany`, `IScu`, `ITrade`
- Types for unions/utility types: `SettlementStatus`, `UserRole`
- No `any` — use `unknown` and narrow explicitly

---

## What to Touch vs. What to Avoid

### Safe to create/edit freely:
- React components in `frontend/components/`
- Route handlers in `backend/src/routes/` (thin handlers only)
- Mock data in `mock-data/`
- Tests
- Documentation in `docs/`
- Prisma seed data in `backend/prisma/seed.ts`

### Requires careful review before editing:
- `backend/src/services/matching-engine.ts` — core financial logic
- `backend/src/services/settlement.ts` — state machine with money movement
- `backend/prisma/schema.prisma` — always migrate, never edit prod DB directly
- `backend/src/middleware/auth.ts` — security critical

### Do not create:
- New top-level directories not in the README structure
- New environment variables without adding them to `.env.example`
- Any file that imports from outside the monorepo (no workspace symlinks)

---

## Code Style

- **TypeScript strict mode** is on. Fix type errors, don't suppress with `@ts-ignore`.
- **ESLint + Prettier** config is in the repo root. Run `npm run lint` before committing.
- **No default exports from service files** — use named exports for tree-shaking and testability.
- **Async/await** over raw Promises. Never mix `.then()` chains with `await` in the same function.
- **Error handling**: use typed error classes (e.g., `class InsufficientCollateralError extends Error`), not string comparisons.

---

## Testing Requirements

When asked to implement a feature, also write tests unless explicitly told not to.

Test file location:
- Backend services → `backend/tests/[service-name].test.ts`
- API routes → `backend/tests/api/[route-name].test.ts`
- Frontend components → co-located `[Component].test.tsx`

Use `jest` + `supertest` for backend, `React Testing Library` for frontend.
Mock Prisma using `jest-mock-extended`.

---

## Commit Messages

Follow Conventional Commits: https://www.conventionalcommits.org/

```
feat: add collateral forfeiture to settlement engine
fix: correct timestamp ordering in matching engine tie-breaking
test: add non-delivery settlement path edge cases
docs: update API reference with WebSocket events
chore: upgrade Prisma to v5.10
refactor: extract price validation into SCU service
```

Scope is optional but encouraged: `feat(matching-engine): ...`

---

## Financial Logic Invariants

These must hold at all times. Add assertions or tests if you touch related code.

1. **No double-spending**: A single SCU can only be matched once. Check `status = 'ACTIVE'` before matching.
2. **Collateral before listing**: `seller_collateral_held_cents` must be set before SCU status becomes `ACTIVE`.
3. **Atomic settlement transitions**: State machine transitions must be database transactions (`prisma.$transaction`).
4. **Amount integrity**: `trade.price_cents` must equal `bid.price_cents` at the time of matching — never recalculate after the fact.
5. **Audit log completeness**: Every settlement state change must write a record to `audit_log` in the same transaction.

---

## What the MVP Does NOT Do

Do not implement these — they are out of scope for v1:

- Live grid operator API calls (use mock-data only)
- Real payment processing (simulate escrow only)
- ML-based forecasting (rule-based simulation only)
- Forward contracts (spot market only)
- Mobile responsive design optimisation
- Dutch language localisation
- Blockchain/Hyperledger settlement (PostgreSQL state machine only)

---

*Last updated: 2026 — Team Seven, MSc FinTech, University of Amsterdam*