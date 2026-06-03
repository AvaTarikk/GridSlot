# AGENTS.md — AI Agent Orchestration Overview

GridSlot is developed using AI coding agents as primary development accelerators.
This document describes how agents are used, what they own, and how human review integrates.

---

## Agents in Use

| Agent | Tool | Primary Role |
|---|---|---|
| Claude Code | Anthropic Claude | Architecture, matching engine, settlement logic, documentation, complex reasoning |
| GitHub Copilot | OpenAI Codex | Inline autocomplete, boilerplate, Prisma schema fields, test case scaffolding |

---

## Workflow: Spec-First, Agent-Second

We follow a **spec-first** approach. Agents are not used for open-ended exploration —
they receive precise, bounded tasks with explicit constraints.

```
1. Human writes a feature spec (plain English, with invariants and edge cases)
         ↓
2. Claude Code implements complex logic (services, state machines, algorithm design)
         ↓
3. Copilot accelerates boilerplate (route handlers, Prisma models, test scaffolding)
         ↓
4. Human reviews all agent output before merging
         ↓
5. CI pipeline validates (lint, type check, tests)
         ↓
6. Merge to develop
```

---

## Agent Responsibilities

### Claude Code owns:
- Matching engine logic and edge case reasoning
- Settlement state machine and transition guards
- API route design and middleware
- WebSocket event architecture
- This documentation and CLAUDE.md

### GitHub Copilot accelerates:
- Prisma model field definitions
- Express route boilerplate (thin handlers)
- Jest test case scaffolding
- Tailwind component styling
- Repetitive type definitions

### Humans own:
- Feature specifications and acceptance criteria
- Final review of all financial logic changes
- Security-sensitive code (auth, rate limiting, GDPR)
- Architectural decisions
- Deployment and infrastructure

---

## Human Review Requirements

Not all agent output is equal. The following require **explicit human sign-off** in the PR description:

| Code Area | Review Requirement |
|---|---|
| `matching-engine.ts` | Senior review + all tests passing |
| `settlement.ts` | Senior review + all tests passing |
| `middleware/auth.ts` | Security review |
| `prisma/schema.prisma` | Migration review (check for data loss) |
| Any new environment variable | Confirm added to `.env.example` |
| Any `/api/internal/` endpoint | Confirm blocked in production |

For routine tasks (new React component, new API route for non-financial data, docs updates),
standard PR review by one team member is sufficient.

---

## Prompt Engineering Patterns

### For complex service implementation (Claude Code):
```
Context: [relevant schema + existing related code]
Task: Implement [function] that [precise behaviour]
Constraints: [invariants, edge cases, error classes to throw]
Return: [exact function signature]
```

### For test scaffolding (Copilot or Claude):
```
Here is the function signature and docstring for [function].
Generate Jest test cases covering: happy path, [edge case 1], [edge case 2], error cases.
Use jest-mock-extended for Prisma mocking.
```

### For UI components (Copilot):
```
// Component: ScuCard
// Props: scu: IScu, onBid: () => void
// Shows: congestion point name, time window, ask price, MWh amount, bid button
// Use Tailwind. Loading state required.
```

---

## What Agents Do Well in This Repo

Based on development experience:

- ✅ Settlement state machine with correct transition guards (Claude Code)
- ✅ Prisma schema field definitions and relations (Copilot)
- ✅ Jest test boilerplate for happy paths (both)
- ✅ Tailwind styling from component descriptions (both)
- ✅ Express middleware patterns (Claude Code)
- ✅ TypeScript interface definitions (both)

---

## Where Human Intervention Is Required

Based on development experience:

- ⚠️ Matching engine tie-breaking logic (agent missed timestamp ordering — always verify)
- ⚠️ GDPR data minimisation in audit logs (requires explicit prompting)
- ⚠️ WebSocket authentication middleware (race conditions in agent-generated versions)
- ⚠️ Error boundary design in React components (agents tend to under-handle async errors)
- ⚠️ Prisma transaction isolation levels (agents default to wrong isolation in some cases)

---

## CI as the Safety Net

All agent output passes through the CI pipeline before merge:

1. **ESLint** — catches style and common errors
2. **TypeScript** — catches type errors agents introduce
3. **Jest** — catches logic errors in services
4. **Build check** — catches import errors and missing modules

The CI pipeline is the final arbiter. If CI is red, do not merge regardless of agent confidence.

---

*Last updated: 2026 — Team Seven, MSc FinTech, University of Amsterdam*
