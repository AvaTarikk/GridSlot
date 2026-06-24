# AGENTS.md — AI Agent Orchestration Overview

GridSlot is developed using AI coding agents as primary development accelerators.
This document describes how agents are used, what they own, and how human review integrates.

---

## Agents in Use

| Agent | Tool | Primary Role |
|---|---|---|
| Claude (claude.ai) | Anthropic Claude | Architecture, matching engine, settlement logic, debugging, documentation, complex reasoning |
| Free Claude Code | Anthropic Claude (via GitHub proxy) | Terminal-based code generation, file editing, refactoring across multiple files |
| ChatGPT | OpenAI GPT-4 | Secondary assistance, alternative perspectives, boilerplate suggestions |

> **Note:** Free Claude Code is an open-source proxy ([github.com/Alishahryar1/free-claude-code](https://github.com/Alishahryar1/free-claude-code)) that routes Claude Code CLI traffic through the Anthropic API, used as a cost-effective alternative to the paid Claude Code subscription.

---

## Workflow: Spec-First, Agent-Second

We follow a **spec-first** approach. Agents are not used for open-ended exploration — they receive precise, bounded tasks with explicit constraints.

1. Human writes a feature spec (plain English, with invariants and edge cases)
2. Claude (claude.ai) designs and implements complex logic (services, state machines, algorithm design, debugging)
3. Free Claude Code applies changes across files in the terminal
4. ChatGPT consulted for alternative approaches or second opinions
5. Human reviews all agent output before committing
6. Build and test validation
7. Commit to repository

---

## Agent Responsibilities

### Claude (claude.ai) owns:
- Matching engine logic and edge case reasoning
- Settlement state machine and transition guards
- API route design and debugging
- WebSocket event architecture
- TypeScript type definitions
- This documentation and CLAUDE.md

### Free Claude Code accelerates:
- Applying multi-file edits from the terminal
- Refactoring across the codebase
- Running and fixing test suites
- Express route boilerplate
- Tailwind component styling

### ChatGPT assists with:
- Alternative implementation suggestions
- Quick syntax lookups
- Boilerplate generation
- Reviewing logic from a second perspective

### Humans own:
- Feature specifications and acceptance criteria
- Final review of all financial logic changes
- Security-sensitive decisions (auth, rate limiting)
- Architectural decisions
- Deployment and infrastructure

---

## Human Review Requirements

Not all agent output is equal. The following require **explicit human sign-off** before committing:

| Code Area | Review Requirement |
|---|---|
| `matching-engine.ts` | Manual review + all tests passing |
| `settlement.ts` | Manual review + all tests passing |
| `middleware/auth.ts` | Security review |
| `prisma/schema.prisma` | Migration review (check for data loss) |
| Any new environment variable | Confirm added to `.env.example` |
| Any `/api/internal/` endpoint | Confirm blocked in production |

For routine tasks (new React component, new API route for non-financial data, docs updates), a quick manual check is sufficient before committing.

---

## Prompt Engineering Patterns

### For complex logic (Claude claude.ai):

Context: [relevant schema + existing related code]
Task: Implement [function] that [precise behaviour]
Constraints: [invariants, edge cases, error classes to throw]
Return: [exact function signature]

### For multi-file edits (Free Claude Code):

Here is the current state of [file].
Apply the following change: [precise diff description]
Do not touch anything outside of [scope].

### For second opinions (ChatGPT):

Here is my implementation of [feature].
Are there any issues with [specific concern]?
Suggest alternatives if applicable.

### For UI components (any agent):

Component: [Name]
Props: [list with types]
Shows: [what it renders]
Behaviour: [interactions, loading states, error states]
Use Tailwind. Match the existing dark theme.

---

## What Agents Do Well in This Repo

Based on development experience:

- Settlement state machine with correct transition guards (Claude)
- Debugging field name mismatches between frontend and backend (Claude)
- Price-time priority matching engine logic (Claude)
- Multi-file refactoring applied via terminal (Free Claude Code)
- Tailwind dark UI components (Claude + ChatGPT)
- Express middleware patterns (Claude)
- TypeScript interface definitions (Claude + ChatGPT)
- Jest test boilerplate for happy paths (Claude)

---

## Where Human Intervention Was Required

Based on development experience:

- KYB status defaulting to PENDING blocked all newly registered companies from trading; required human to identify and fix
- Frontend/backend field name mismatches (mwh vs mwh_amount, start_time vs time_window_start) caused silent NaN rendering and validation errors
- SCU status string mismatch (LISTED vs ACTIVE) hid the buy button for all buyers
- Collateral percentage inconsistency between frontend display and backend calculation
- Matching engine tie-breaking logic was missed by agent; required manual verification
- instanceof bug on custom error subclasses caused by ES5-era prototype workaround breaking error type checks in tests
- Countdown timer froze at 00:00 because target was computed once at mount and never recalculated on expiry

---

## CI as the Safety Net

All agent output passes through validation before committing:

1. TypeScript — catches type errors agents introduce
2. Jest — catches logic errors in services
3. Build check — catches import errors and missing modules
4. Manual browser test — verifies UI flows end to end

The build and test suite is the final arbiter. If tests are red, do not commit regardless of agent confidence.