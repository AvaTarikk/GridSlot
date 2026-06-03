# .claude/instructions.md — Extended Agent Instructions

This file extends CLAUDE.md with module-specific guidance for Claude Code.
Read CLAUDE.md first, then this file.

---

## Module-by-Module Guidance

### Matching Engine (`backend/src/services/matching-engine.ts`)

The matching engine is the most critical service. When working on it:

**Algorithm summary:**
```
FOR each active SCU:
  bids = all open bids for that SCU, ordered by price DESC, created_at ASC
  IF bids[0].price >= SCU.ask_price_cents:
    create trade, mark SCU as MATCHED, mark winning bid as WON, rest as LOST
    emit 'trade:matched' WebSocket event to both parties
    create settlement record with status PAYMENT_HELD
  ELSE:
    no action this cycle
```

**Key invariants to preserve:**
- Price-time priority: highest price wins; ties go to earliest `created_at`
- A bid can only win once (check `status = 'OPEN'` before matching)
- The SCU's `ask_price_cents` is the floor — bids below it never match
- All DB writes in a single `prisma.$transaction`

**Testing requirements for this module:**
- Every new function needs a corresponding test
- Edge cases that MUST be covered: no bids, single bid below ask, tie on price, SCU withdrawn mid-cycle

---

### Settlement State Machine (`backend/src/services/settlement.ts`)

Valid state transitions only:

```
MATCHED → PAYMENT_HELD         (automatic on trade creation)
PAYMENT_HELD → DELIVERY_PENDING (automatic when delivery window opens)
DELIVERY_PENDING → CONFIRMED   (seller calls confirm-delivery endpoint)
CONFIRMED → SETTLED            (automatic after confirmation grace period)
DELIVERY_PENDING → NON_DELIVERY (system detects missed window)
NON_DELIVERY → REFUNDED        (automatic — forfeit 5% seller collateral, refund buyer)
```

**Forbidden transitions** (must throw `InvalidStateTransitionError`):
- Any backward transition
- Skipping states
- Transitioning from SETTLED or REFUNDED

When implementing a transition function:
1. Validate current state
2. Apply business logic (calculate forfeit amounts, etc.)
3. Update settlement + audit_log in a single `prisma.$transaction`
4. Emit the appropriate WebSocket event

---

### SCU Registry (`backend/src/services/scu-registry.ts`)

When creating an SCU listing:
1. Verify the company's KYB status is `ACTIVE`
2. Verify `mwh_amount` does not exceed the company's GTO capacity ceiling (mock validation in MVP)
3. Calculate and lock `seller_collateral_held_cents` = 10% of `ask_price_cents * mwh_amount`
4. Set status to `ACTIVE`

The GTO validation in MVP is a simple mock check against `mock-data/demo-companies.json`.
Do NOT attempt to call a real grid operator API.

---

### API Routes (`backend/src/routes/`)

Route handlers must be thin. The pattern:

```typescript
// ✅ Correct
router.post('/scus', authMiddleware, async (req, res) => {
  try {
    const scu = await scuRegistry.createListing(req.user.companyId, req.body);
    res.status(201).json(scu);
  } catch (err) {
    next(err);
  }
});

// ❌ Wrong — business logic in route handler
router.post('/scus', authMiddleware, async (req, res) => {
  const company = await prisma.company.findUnique(...);
  if (company.kyb_status !== 'ACTIVE') { ... }
  const collateral = req.body.ask_price * 0.1;
  // ... 40 more lines
});
```

---

### Frontend Components (`frontend/components/`)

Component guidelines:
- Use Tailwind utility classes only — no inline `style` props except for dynamic values (e.g., map positioning)
- All data fetching via the `lib/api.ts` client — no direct `fetch` calls in components
- Loading and error states are required for every data-fetching component
- Use `Zustand` stores for cross-component state; `useState` for local UI state only

Key components to build:
- `marketplace/ScuCard.tsx` — displays a single SCU listing
- `marketplace/BidForm.tsx` — bid submission form
- `marketplace/AuctionTimer.tsx` — countdown to next matching cycle
- `settlement/SettlementTracker.tsx` — visual state machine progress
- `map/CongestionMap.tsx` — Leaflet map wrapper
- `dashboard/PortfolioSummary.tsx` — revenue/spend summary

---

### WebSocket Events (`backend/src/websocket/events.ts`)

All WebSocket events must:
1. Require a valid JWT (authenticate on connection, not per-event)
2. Be documented in `docs/api-reference.md`
3. Have a TypeScript type definition shared between frontend and backend

Event payload types go in a shared `types/websocket.ts` file at the repo root,
imported by both `frontend/` and `backend/`.

---

### Mock Data (`mock-data/`)

The mock data files are the source of truth for the MVP. Do not hardcode values
that belong in these files. When adding demo scenarios:

- `congestion-points.json` — add realistic Dutch locations (use actual postcodes/grid areas)
- `demo-companies.json` — add companies with realistic KVK numbers and GTO references
- `forecast-scenarios.json` — add named scenarios (e.g., `"heat_wave"`, `"solar_peak"`)

Do NOT add real personal data, real KVK numbers of actual companies, or real grid operator credentials.

---

## Prompt Patterns for Complex Tasks

When asking Claude Code to implement a complex service, use this structure:

```
Context: [paste relevant schema models + any existing related code]

Task: Implement [function name] in [file path] that:
- [behaviour 1]
- [behaviour 2]
- [edge case handling]

Constraints:
- Must be a single prisma.$transaction
- Must emit WebSocket event on success
- Must write to audit_log
- Must throw [ErrorClass] if [condition]

Return the function with signature:
async function [name](params: [Type]): Promise<[ReturnType]>
```

---

## Common Mistakes to Avoid

1. **Race conditions in matching**: Always select SCUs with `FOR UPDATE` (Prisma: `select ... where ... AND status = 'ACTIVE'`) to prevent concurrent matching of the same SCU.

2. **Floating point money**: `0.1 + 0.2 !== 0.3` in JS. All amounts in cents as integers. Division only when displaying to UI, never when storing.

3. **Missing audit log**: Every financial state change needs an audit record. If you add a new state transition and don't add an audit log write, the PR will be rejected.

4. **Leaking internal errors to API responses**: Use an error handler middleware that maps internal errors to safe HTTP responses. Don't `res.json(err)` directly.

5. **Importing Prisma client in tests**: Use `jest-mock-extended` to mock Prisma — never hit a real database in unit tests.

---

*Last updated: 2026 — Team Seven, MSc FinTech, University of Amsterdam*
