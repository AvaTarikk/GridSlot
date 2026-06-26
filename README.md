# GridSlot — Financial Marketplace for Electricity Grid Capacity

> **Turning stranded grid capacity into a liquid, tradable asset.**  
> A B2B financial marketplace built on the Dutch ACM congestion service provider framework, enabling companies to buy, sell, and manage electricity transmission rights through standardised capacity units, transparent price discovery, and automated settlement.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [The Problem We Solve](#2-the-problem-we-solve)
3. [Conceptual Innovation](#3-conceptual-innovation)
4. [MVP Feature Set](#4-mvp-feature-set)
5. [Architecture](#5-architecture)
6. [Technology Stack](#6-technology-stack)
7. [Repository Structure](#7-repository-structure)
8. [Getting Started](#8-getting-started)
9. [Environment Variables](#9-environment-variables)
10. [Running the Application](#10-running-the-application)
11. [API Reference](#11-api-reference)
12. [AI Agent Orchestration](#12-ai-agent-orchestration)
13. [Testing](#13-testing)
14. [Deployment](#14-deployment)
15. [Scaling Considerations](#15-scaling-considerations)
16. [Security](#16-security)
17. [Known Limitations and Roadmap](#17-known-limitations-and-roadmap)
18. [Contributing](#18-contributing)
19. [Team](#19-team)
20. [References and Regulatory Context](#20-references-and-regulatory-context)
21. [License](#21-license)

---

## 1. Project Overview

GridSlot is a **fintech MVP** developed as part of the MSc Business Analytics & Management (FinTech Business Models and Applications) programme at the Erasmus University Rotterdam. It demonstrates a working financial marketplace for electricity grid capacity in the Netherlands — a market that currently does not exist in a structured, digital form despite being legalised by the ACM in April 2024 and formalised under the Energiewet (January 2026).

The Netherlands faces one of Europe's most acute grid congestion crises: over **20,000 companies** are on waiting lists for grid access, costing the economy an estimated **EUR 10–40 billion per year** (BCG/Ecorys, 2024). GridSlot addresses this by creating a transparent, automated marketplace where companies with unused grid capacity can trade that capacity to companies that urgently need it.

This repository contains the full MVP codebase including:
- A **Next.js frontend** with a company dashboard, auction interface, and congestion map
- A **Node.js/Express backend** with a matching engine, SCU registry, and settlement state machine
- **Mock data** simulating realistic Dutch congestion points and grid operator data
- **AI agent configuration** for Claude Code and GitHub Copilot
- Full **API documentation** and deployment instructions

---

## 2. The Problem We Solve

### Grid Congestion in the Netherlands

The Dutch electricity grid is managed by TenneT (national high-voltage) and four regional distribution system operators (DSOs): Liander, Stedin, Enexis, and Westland Infra. For decades, grid access was allocated on a first-come, first-served basis — a model that worked when energy demand was stable and supply came from predictable fossil-fuel plants.

Today that model has broken down. The rapid growth of solar, wind, EV charging, and industrial electrification has created severe congestion at hundreds of grid points across the country. The consequences are stark:

| Indicator | Figure | Source |
|---|---|---|
| Companies waiting to feed in electricity | 8,000 | TenneT, 2024 |
| Companies waiting to increase consumption | 12,000 | TenneT, 2024 |
| Annual economic cost of congestion | EUR 10–40 billion | BCG/Ecorys, 2024 |
| Average grid reinforcement timeline | 10 years | TenneT, 2024 |
| TenneT planned investment by 2034 | EUR 200 billion | TenneT, 2025 |

### Why Existing Solutions Fall Short

The ACM's April 2024 congestion measures and the Energiewet (December 2024) have created the **legal framework** for companies to share, trade, and flexibly use grid capacity via Group Transport Agreements (GTOs). What does not yet exist is the **financial infrastructure** to make this happen efficiently:

- No transparent pricing for unused grid capacity
- No digital platform to match sellers and buyers
- No standardised contract format for capacity trades
- No automated settlement mechanism
- Manual, bilateral negotiations that are too slow and expensive for SMEs

GridSlot fills this gap.

---

## 3. Conceptual Innovation

### The Core Idea: Capacity as a Tradable Asset

GridSlot's central innovation is the **Standardised Capacity Unit (SCU)** — a normalised, time-bounded representation of the right to use 1 MWh of electricity transmission capacity at a specific congestion point during a specific time window.

By standardising grid capacity into SCUs, GridSlot makes it possible to:
1. **List** unused capacity on an open marketplace
2. **Price** capacity through competitive auction
3. **Match** buyers and sellers automatically
4. **Settle** transactions with escrow-style payment holding

This mirrors how other commodity markets (oil, carbon credits, freight) created liquidity by standardising heterogeneous physical assets into tradable financial instruments.

### Three Platform Layers

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 3: Settlement & Risk Management                  │
│  Escrow payment, delivery confirmation, collateral      │
├─────────────────────────────────────────────────────────┤
│  LAYER 2: Auction Marketplace & Price Discovery         │
│  Order book, bid/ask matching, clearing prices          │
├─────────────────────────────────────────────────────────┤
│  LAYER 1: Capacity Standardisation                      │
│  SCU definition, GTO verification, registry             │
└─────────────────────────────────────────────────────────┘
```

GridSlot does **not** operate the physical grid, control electricity flows, or replace grid operators. It is a **financial layer** that sits on top of the legal framework already established by the ACM.

---

## 4. MVP Feature Set

The MVP implements the full marketplace loop end-to-end using mock grid operator data. All features listed below are functional in this codebase.

### 4.1 Company Onboarding and KYB
- Company registration with mock KVK (Dutch Chamber of Commerce) number verification
- KYB (Know Your Business) status flow: Pending → Verified → Active
- Company profile with grid operator, congestion points, and GTO references
- JWT-based authentication with role separation (Seller / Buyer / Both)

### 4.2 SCU Registry and Listing
- Sellers define an SCU: congestion point, time window (start/end), MWh amount, ask price
- SCUs are validated against the company's registered GTO capacity ceiling
- Each SCU receives a unique registry ID and is visible in the marketplace
- Sellers can manage, pause, or withdraw listings

### 4.3 Auction and Bidding
- Buyers browse active SCU listings filtered by congestion point, time window, or price
- Buyers submit bids; multiple bids per SCU are supported
- Auction runs on a configurable cycle (default: every 60 seconds in MVP, simulating daily clearing)
- The matching engine automatically selects the highest bid at or above the ask price
- Unmatched bids are returned; partial fills are not supported in v1

### 4.4 Matching Engine
- Price-time priority matching algorithm (highest bid wins; ties broken by timestamp)
- Configurable clearing interval
- Trade confirmation events emitted via WebSocket to both parties
- Full audit log of all matching decisions stored in the database

### 4.5 Settlement State Machine
- Confirmed trades move through a five-state settlement pipeline:
  ```
  MATCHED → PAYMENT_HELD → DELIVERY_PENDING → CONFIRMED → SETTLED
  ```
- Buyer payment is held in escrow simulation on match
- Seller collateral (5% of trade value) is locked on listing
- Transaction fee of 0.1%
- On delivery confirmation (mock grid data), funds release automatically
- On non-delivery, seller forfeits 5% of collateral; buyer is refunded

### 4.6 Congestion Map
- Interactive map of the Netherlands showing mock congestion hotspots
- Colour-coded severity (green / amber / red) per congestion point
- Clicking a point shows active SCU listings and clearing price history for that location
- Data sourced from `mock-data/congestion-points.json` (realistic Dutch locations)

### 4.7 Portfolio Dashboard
- Active listings and their status (Live / Matched / Settled)
- Open bids and their status (Pending / Won / Lost)
- Trade history with settlement status
- Delivery score (percentage of successful deliveries) visible to all marketplace participants
- Revenue and spend summaries

### 4.8 AI Congestion Forecast (Simplified)
- Mock forecasting panel showing predicted congestion severity for the next 24h per point
- In production this would be powered by LSTM + gradient boosting on historical grid telemetry
- MVP uses a rule-based simulation to illustrate the UX of the forecasting feature

---

## 5. Architecture

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                       │
│                    Next.js 14 (App Router)                    │
│         Dashboard │ Marketplace │ Map │ Portfolio │ Auth      │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS / WebSocket
┌───────────────────────────▼───────────────────────────────────┐
│                     API GATEWAY (Express)                     │
│              REST endpoints + WebSocket server                │
│         Auth middleware │ Rate limiting │ Request logging     │
└──────┬──────────┬─────────────┬────────────────┬──────────────┘
       │          │             │                │
┌──────▼───┐ ┌────▼──────┐ ┌────▼──────┐ ┌───────▼──────┐
│  SCU     │ │ Matching  │ │Settlement │ │  Congestion  │
│ Registry │ │  Engine   │ │  Engine   │ │  Data Layer  │
│ Service  │ │ Service   │ │ Service   │ │  Service     │
└──────┬───┘ └────┬──────┘ └────┬──────┘ └───────┬──────┘
       │          │             │                │
┌──────▼──────────▼─────────────▼────────────────▼──────────────┐
│                        PostgreSQL Database                    │
│  companies │ scus │ bids │ trades │ settlements │ audit_log   │
└───────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────┐
│                     Mock Data Layer                              │
│         congestion-points.json │ grid-operators.json             │
│         mock-capacity-data.json │ forecast-simulation.js         │
└──────────────────────────────────────────────────────────────────┘
```

### Matching Engine Design

The matching engine is the core algorithmic component. It runs on a configurable interval and processes all open SCUs against submitted bids:

```
FOR each active SCU in REGISTRY:
  bids = GET all bids WHERE scu_id = SCU.id AND status = OPEN
        ORDER BY price DESC, created_at ASC

  IF bids[0].price >= SCU.ask_price:
    MATCH(SCU, bids[0])
    EMIT trade_confirmed event to both parties
    UPDATE SCU status = MATCHED
    UPDATE bid status = WON
    UPDATE remaining bids status = LOST
    CREATE settlement record (status = PAYMENT_HELD)
  ELSE:
    CONTINUE (no match this cycle)
```

### Settlement State Machine

```
                   ┌──────────┐
                   │ MATCHED  │
                   └────┬─────┘
                        │ Buyer payment captured (mock)
                   ┌────▼──────────┐
                   │ PAYMENT_HELD  │
                   └────┬──────────┘
                        │ Delivery window opens
                   ┌────▼─────────────┐
                   │ DELIVERY_PENDING │
                   └────┬─────────────┘
                  ┌─────┴─────┐
          Success │           │ Non-delivery
            ┌─────▼──────┐  ┌─▼──────────────┐
            │ CONFIRMED  │  │ NON_DELIVERY   │
            └─────┬──────┘  └─┬──────────────┘
                  │            │ Forfeit 5% collateral
            ┌─────▼──────┐  ┌─▼──────────────┐
            │  SETTLED   │  │ REFUNDED       │
            └────────────┘  └────────────────┘
```

---

## 6. Technology Stack

| Layer | Technology | Justification |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR for SEO, fast routing, React ecosystem |
| Styling | Tailwind CSS | Rapid UI development, consistent design tokens |
| State management | Zustand | Lightweight, no boilerplate, sufficient for MVP scope |
| Real-time | Socket.io | WebSocket abstraction, works with Next.js and Express |
| Backend | Node.js + Express | Fast iteration, JS isomorphism with frontend |
| Database | PostgreSQL + Prisma ORM | Relational integrity for financial data; Prisma speeds up schema iteration |
| Authentication | NextAuth.js + JWT | Simple, extensible, supports multiple providers |
| Map | Leaflet.js | Open-source, no API key cost ceiling, good Dutch geo support |
| Mock grid data | JSON seed files | Realistic Dutch congestion point simulation without live API dependency |
| Testing | Jest + Supertest + React Testing Library | Standard JS testing stack |
| Linting | ESLint + Prettier | Code consistency across contributors |
| CI/CD | GitHub Actions | Automated test runs on every PR |
| Deployment | Vercel (frontend) + Railway (backend + DB) | Zero-config deployment suitable for MVP demo |

### Why Not Blockchain for Settlement?

The business plan references Hyperledger Besu for the production settlement ledger. For the MVP, we use a **PostgreSQL state machine** instead. This decision is intentional:

- Hyperledger Besu requires significant DevOps overhead unsuitable for an MVP timeline
- The settlement logic (escrow, state transitions, audit log) is fully implementable in a relational database
- The database schema is designed to be **migration-compatible** with an on-chain settlement layer in production
- This approach lets us validate the product logic without infrastructure complexity

---

## 7. Repository Structure

```
gridslot/
│
├── .claude/
│   ├── instructions.md          # Claude Code agent instructions
│   └── settings.local.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml               # Run tests on every PR
│       └── deploy.yml           # Deploy on main merge
│
├── CLAUDE.md                    # Agent instructions for Claude Code
├── AGENTS.md                    # General agent orchestration overview
├── README.md                    # This file
├── .prettierrc
├── .gitignore
│
├── frontend/                    # Next.js 14 application
│   ├── src/
│   │   ├── app/
│   │   │   ├── landing/page.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── marketplace/
│   │   │   │   ├── page.tsx         # SCU listing browser
│   │   │   │   └── [id]/page.tsx    # SCU detail + bidding
│   │   │   ├── map/page.tsx
│   │   │   ├── forecast/page.tsx
│   │   │   ├── portfolio/page.tsx
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── layout/              # AppShell, Sidebar, Providers, Toast
│   │   │   ├── marketplace/         # ScuCard, CreateScuModal
│   │   │   ├── map/                 # MapView, map-view.css
│   │   │   ├── settlement/          # SettlementTracker
│   │   │   └── ui/                  # Toaster
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useCountdown.ts
│   │   │   └── use-realtime.ts
│   │   ├── stores/                  # Zustand: auth, marketplace, toasts
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   └── utils.ts
│   │   └── types/
│   │       └── index.ts
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── backend/                     # Express API server
│   ├── src/
│   │   ├── app.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── scus.ts
│   │   │   ├── bids.ts
│   │   │   ├── trades.ts
│   │   │   ├── settlements.ts
│   │   │   ├── congestion.ts
│   │   │   ├── forecast.ts
│   │   │   └── internal.ts          # Dev-only match trigger
│   │   ├── services/
│   │   │   ├── matching-engine.ts   # Core auction matching logic
│   │   │   ├── settlement.ts        # Settlement state machine
│   │   │   └── forecast.service.ts  # Rule-based forecast simulation
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── rateLimit.ts
│   │   │   └── logger.ts
│   │   ├── websocket/
│   │   │   └── events.ts            # Socket.IO event definitions
│   │   └── lib/
│   │       └── prisma.ts            # Prisma client singleton
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema
│   │   ├── seed.ts                  # Demo data seeder
│   │   ├── seed-rich.ts             # Extended seed data
│   │   └── migrations/              # Prisma migration history
│   ├── tests/
│   │   ├── matching-engine.test.ts
│   │   ├── settlement.test.ts
│   │   └── api/auth.test.ts
│   └── tsconfig.json
│
├── mock-data/
│   ├── congestion-points.json       # Dutch grid congestion hotspots
│   ├── grid-operators.json          # TenneT, Liander, Stedin, Enexis
│   ├── demo-companies.json          # Seeded demo participants
│   ├── forecast-scenarios.json      # Congestion forecast scenarios
│   └── price-history.json           # Historical clearing prices
│
└── docs/                            # Extended documentation
```
---

## 8. Getting Started

### Prerequisites

Ensure the following are installed on your machine:

| Tool | Minimum Version | Check |
|---|---|---|
| Node.js | v20.0.0 | `node --version` |
| npm | v10.0.0 | `npm --version` |
| PostgreSQL | v15.0 | `psql --version` |
| Git | v2.40 | `git --version` |

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/your-org/gridslot.git
cd gridslot
```

**2. Install dependencies**

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

**3. Set up the database**

```bash
cd backend

# Copy the example environment file
cp .env.example .env

# Edit .env and add your PostgreSQL connection string (see Section 9)

# Run Prisma migrations
npx prisma migrate dev --name init

# Seed the database with demo data
npx prisma db seed
```

**4. Configure environment variables**

See [Section 9](#9-environment-variables) for the full list. At minimum you need `DATABASE_URL` and `JWT_SECRET`.

---

## 9. Environment Variables

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/gridslot_dev"

# Authentication
JWT_SECRET="your-secure-random-secret-min-32-chars"
JWT_EXPIRES_IN="7d"

# Server
PORT=4000
NODE_ENV=development

# WebSocket
WS_PORT=4001

# Mock data settings
MATCHING_ENGINE_INTERVAL_MS=60000   # How often the matching engine runs (60s default)
SETTLEMENT_DELIVERY_WINDOW_HOURS=4  # How long sellers have to deliver

# Feature flags
ENABLE_FORECAST_PANEL=true
ENABLE_COLLATERAL_SIMULATION=true
```

### Frontend (`frontend/.env.local`)

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET="your-nextauth-secret"

NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4001
```

> **Never commit `.env` files to the repository.** Both files are in `.gitignore`. Use `.env.example` files as templates.

---

## 10. Running the Application

### Development Mode

Open two terminal windows:

**Terminal 1 — Backend**
```bash
cd backend
npm run dev
# Server starts on http://localhost:4000
# WebSocket on ws://localhost:4001
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
# App available at http://localhost:3000
```

### Demo Login Credentials

After seeding, the following demo accounts are available:

| Company | Role | Email | Password |
|---|---|---|---|
| Port of Amsterdam Logistics BV | Seller | seller@portams.nl | demo1234 |
| Schiphol Data Centre Holding | Buyer | buyer@sdc-holding.nl | demo1234 |
| Noord-Holland Solar Cooperative | Both | both@nhsolar.nl | demo1234 |
| GridSlot Admin | Admin | admin@gridslot.nl | admin1234 |

### Triggering the Matching Engine Manually

In development, you can trigger a matching cycle immediately without waiting for the interval:

```bash
curl -X POST http://localhost:4000/api/internal/trigger-matching \
  -H "X-Internal-Key: dev-internal-key"
```

---

## 11. API Reference

Full documentation is in [`docs/api-reference.md`](docs/api-reference.md). Key endpoints:

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new company |
| `POST` | `/api/auth/login` | Authenticate and receive JWT |
| `GET` | `/api/auth/me` | Get current authenticated company |

### SCUs (Standardised Capacity Units)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scus` | List all active SCUs (filterable) |
| `POST` | `/api/scus` | Create a new SCU listing |
| `GET` | `/api/scus/:id` | Get SCU detail with bid history |
| `PATCH` | `/api/scus/:id` | Update or withdraw listing |

### Bids
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/bids` | Place a bid on an SCU |
| `GET` | `/api/bids/my` | Get all bids by authenticated company |
| `DELETE` | `/api/bids/:id` | Withdraw a pending bid |

### Trades and Settlement
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/trades` | Get all trades for authenticated company |
| `GET` | `/api/trades/:id` | Get trade detail with settlement status |
| `POST` | `/api/settlements/:id/confirm-delivery` | Seller confirms capacity delivery |

### Congestion Data
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/congestion/points` | List all congestion points with severity |
| `GET` | `/api/congestion/points/:id` | Get point detail with price history |
| `GET` | `/api/congestion/forecast` | Get 24h congestion forecast |

### WebSocket Events

Connect to `ws://localhost:4001` with a valid JWT token.

| Event | Direction | Payload |
|---|---|---|
| `trade:matched` | Server → Client | `{ tradeId, scuId, price, counterparty }` |
| `bid:lost` | Server → Client | `{ bidId, scuId, reason }` |
| `settlement:update` | Server → Client | `{ tradeId, newStatus, timestamp }` |
| `congestion:update` | Server → Broadcast | `{ pointId, severity, timestamp }` |

---

## 12. AI Agent Orchestration

GridSlot was developed with AI coding agents as primary development accelerators. Full agent instructions are in [`CLAUDE.md`](CLAUDE.md) and [`.claude/instructions.md`](.claude/instructions.md).

### Agents Used

| Agent | Tool | Primary Role |
|---|---|---|
| Claude Code | Anthropic Claude | Architecture, matching engine, settlement logic, documentation |
| GitHub Copilot | OpenAI Codex | Inline autocomplete for boilerplate, Prisma schema, test cases |

### Orchestration Strategy

We followed a **spec-first, agent-second** workflow:

1. **Write a precise spec** for each feature in plain English before prompting any agent
2. **Claude Code** handles complex, stateful logic (matching engine, settlement state machine, API route design) where reasoning about edge cases matters
3. **Copilot** handles repetitive, pattern-based code (Prisma models, Express route boilerplate, React component scaffolding) where speed matters
4. **Human review** is mandatory before merging any agent-generated code that touches financial logic or authentication

### Claude Code Prompt Patterns

For the matching engine, we used structured prompts of the form:

```
Context: [paste relevant schema + existing service code]
Task: Implement [specific function] that [precise behaviour description]
Constraints: [list edge cases and invariants that must hold]
Return: [exact function signature expected]
```

This approach produced significantly more correct first-pass output than open-ended prompts and reduced the number of review iterations from ~4 to ~1.5 on average.

### What the Agents Did Well
- Claude Code excelled at generating the settlement state machine with correct transition guards
- Copilot was fast and accurate for Prisma schema field definitions and Jest test boilerplate
- Both agents handled Tailwind styling suggestions well when given a component description

### What Required Human Intervention
- Matching engine tie-breaking logic (agent missed timestamp ordering in first pass)
- GDPR-compliant data minimisation in the audit log (required explicit prompting)
- WebSocket authentication middleware (agent-generated version had a race condition)

---

## 13. Testing

### Running Tests

```bash
# Run all backend tests
cd backend
npm test

# Run with coverage
npm run test:coverage

# Run a specific test file
npm test -- matching-engine.test.ts

# Run frontend component tests
cd frontend
npm test
```

### Test Coverage Targets

| Module | Coverage Target |
|---|---|
| Matching engine | ≥ 90% |
| Settlement state machine | ≥ 90% |
| API routes (auth, SCUs, bids) | ≥ 80% |
| Frontend components (critical paths) | ≥ 70% |

### Key Test Cases

The matching engine tests cover:

- ✅ Single bid at or above ask price → match
- ✅ Multiple bids → highest price wins
- ✅ Tie on price → earliest timestamp wins
- ✅ No bids at or above ask → no match
- ✅ SCU withdrawn mid-cycle → bids returned as LOST
- ✅ Seller collateral insufficient → listing rejected

The settlement state machine tests cover:

- ✅ Full happy path: MATCHED → SETTLED
- ✅ Non-delivery: DELIVERY_PENDING → NON_DELIVERY → REFUNDED
- ✅ Invalid state transitions are rejected
- ✅ Collateral forfeiture calculation is correct

---

## 14. Deployment

### Production Architecture

```
Internet
    │
    ▼
Vercel Edge Network
(Next.js frontend, CDN-cached)
    │
    ▼
Railway (Node.js backend + PostgreSQL)
    │ (future)
    ▼
AWS RDS (PostgreSQL, production)
```

### Deploying to Vercel (Frontend)

```bash
# Install Vercel CLI
npm install -g vercel

cd frontend
vercel --prod
```

Set environment variables in the Vercel dashboard under Project Settings → Environment Variables.

### Deploying to Railway (Backend)

1. Create a new Railway project at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add a PostgreSQL plugin to the project
4. Set the environment variables listed in Section 9
5. Railway auto-deploys on push to `main`

### CI/CD Pipeline

Every pull request triggers:
1. ESLint + Prettier check
2. TypeScript compilation check
3. Jest test suite (backend + frontend)
4. Build check (Next.js + Express)

Merges to `main` trigger automatic deployment to Vercel and Railway.

---

## 15. Scaling Considerations

### Prerequisites for Production Scale

The MVP is designed to prove the marketplace concept. Moving to production requires the following:

**1. Live Grid Operator API Integration**  
The MVP uses mock congestion data. Production requires signed data access agreements with TenneT, Liander, Stedin, and Enexis, plus integration with their USEF/UFTP 1.01 APIs for real-time capacity telemetry and GTO validation.

**2. Real Payment Infrastructure**  
The escrow simulation must be replaced with a regulated payment service provider. Options include Stripe Treasury, Adyen, or a Dutch PSP. SEPA Credit Transfer is the target settlement rail. This requires a PSD2 payment institution licence or a partnership with a licensed PSP.

**3. ACM Formal Recognition**  
Operating as a formal congestion service provider at scale requires ACM recognition. The target is Q4 2026. Without this, the platform can operate as an OTC broker but cannot act as the formal intermediary for GTO-registered capacity transfers.

**4. Hyperledger Besu Settlement Ledger**  
Replace the PostgreSQL state machine with a permissioned Ethereum ledger (Hyperledger Besu) for immutable, auditable settlement records. The current schema is designed to be migration-compatible.

**5. Real-Time Matching**  
The MVP runs the matching engine on a 60-second interval. At scale, near real-time matching (sub-second) requires a dedicated matching engine service, an in-memory order book (Redis), and Apache Kafka for event streaming.

### Technological Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Grid operator API access denied or delayed | Medium | High | Begin MoU negotiations early; MVP uses mocks to avoid dependency |
| ACM regulatory framework changes | Low–Medium | High | Contract structuring independent of specific ACM categories |
| Matching engine performance at scale | Low | Medium | Redis order book + Kafka already planned for v2 |
| WebSocket scalability (many concurrent users) | Medium | Medium | Move to Socket.io with Redis adapter for horizontal scaling |
| PostgreSQL write throughput under high trade volume | Low | Medium | Read replicas + connection pooling (PgBouncer) in v2 |

---

## 16. Security

### Authentication and Authorisation
- All API endpoints (except `/api/auth/login` and `/api/auth/register`) require a valid JWT
- JWTs expire after 7 days and are not stored server-side (stateless)
- Role-based access control: Seller, Buyer, Both, Admin
- Rate limiting on all endpoints (100 req/min per IP in production)

### Financial Data
- No real payment card data is stored at any point
- All financial amounts are stored as integers in cents to avoid floating-point errors
- Settlement state transitions are atomic database transactions to prevent double-spending
- Audit log records every state change with timestamp and actor

### GDPR Compliance
- Smart meter and consumption data is never stored in the MVP (mock data only)
- In production, a Data Protection Officer must be appointed from day one
- All personally identifiable data stored on EU-domiciled servers
- Explicit consent flows are implemented in the registration flow
- Data minimisation: only the data necessary for KYB, matching, and settlement is collected

### Known Security Limitations of the MVP
- The MVP uses a simple JWT secret rather than asymmetric key signing (RS256) — this must change in production
- The internal matching engine trigger endpoint (`/api/internal/trigger-matching`) is protected only by a static key in development — this endpoint must be removed or properly secured in production
- No DDoS protection beyond basic rate limiting — a CDN-level WAF (Cloudflare) is required for production

---

## 17. Known Limitations and Roadmap

### MVP Limitations
- All grid operator data is mocked — no live API connections
- Payment escrow is simulated, not real
- Forecasting is rule-based, not ML-powered
- No forward contract trading (spot market only)
- No mobile-responsive design optimisation (desktop-first MVP)
- Single-language UI (English only; Dutch localisation planned)

### v2 Roadmap (Post-MVP)
- [ ] Live TenneT/Liander/Stedin API integration
- [ ] LSTM-based congestion forecasting engine
- [ ] Real SEPA payment integration
- [ ] Forward contract trading (weekly/monthly SCU contracts)
- [ ] Mobile-responsive UI
- [ ] Dutch language localisation
- [ ] Hyperledger Besu settlement ledger
- [ ] ACM formal recognition submission
- [ ] Belgium and Germany market pilot

---

## 18. Contributing

### Branch Strategy

```
main          ← production-ready code only
develop       ← integration branch; all PRs merge here first
feature/*     ← individual feature branches
fix/*         ← bug fix branches
```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add collateral forfeiture calculation to settlement engine
fix: correct timestamp ordering in matching engine tie-breaking
docs: update API reference with WebSocket events
test: add edge cases for non-delivery settlement path
chore: upgrade Prisma to v5.10
```

### Pull Request Requirements
- All CI checks must pass
- At minimum one team member must review and approve
- Agent-generated code touching financial logic requires explicit human review sign-off in the PR description
- PR description must include: what changed, why, and how it was tested

---

## 19. Team

**Team Seven — MSc Business Analytics & Management (FinTech Business Models and Applications) programme at the Erasmus University Rotterdam.**

| Name | Role | GitHub |
|---|---|---|
| Tarik Ülgen | Backend, Matching Engine, Architecture | @AvaTarikk |
| Anouar Maniari | Frontend, UX, Congestion Map | @anouar |

---

## 20. References and Regulatory Context

- **ACM** (2024). *ACM presents comprehensive package of measures to fight grid congestion.* [acm.nl](https://www.acm.nl/en/publications/acm-flexible-utilization-opens-more-possibilities-congested-grid-projects-social-functions-prioritized)
- **ACM** (2025). *Energy hubs can file requests for group transport agreements.* [acm.nl](https://www.acm.nl/en/publications/acm-energy-hubs-can-file-requests-group-transport-agreements-their-system-operators)
- **BCG / Ecorys** (2024). *Solving the Gridlock: Six Interventions to Accelerate Grid Expansion.*
- **IEA** (2024). *Netherlands 2024: Energy Policy Review.*
- **Kennedy Van der Laan** (2025). *The Energy Act: What Will Change From 2026 Onwards?*
- **TenneT** (2025). *Security of Supply Monitor 2025.*
- **USEF Foundation** (2020). *USEF Flex Trading Protocol Specifications v1.01.*
- **Energiewet** (December 2024). Dutch Energy Act, in force 1 January 2026.

### Regulatory Architecture

GridSlot is designed to operate within the ACM's **congestion service provider** regulatory category (defined April 2024) and the **Group Transport Agreement** framework formalised under the Energiewet. The platform's SCU standardisation, settlement, and GTO verification logic are specifically built around this framework. Any future changes to ACM categorisation or the Energiewet GTO provisions are the primary regulatory risk (see Section 16).

---

## 21. License

This project is submitted as academic coursework for the MSc Business Analytics & Management (FinTech Business Models and Applications) programme at the Erasmus University Rotterdam. The codebase is not licensed for commercial use without written permission from the authors.

---

*GridSlot MVP — Built with Claude Code and GitHub Copilot — Team Seven, 2026*