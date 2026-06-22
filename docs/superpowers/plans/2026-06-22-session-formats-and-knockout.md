# Session Formats And Knockout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-session round-robin or configurable seeded-knockout scheduling with automatic advancement and shared admin/public bracket diagrams.

**Architecture:** Extend existing sessions/matches rather than duplicate tournament tables. A pure bracket engine builds and validates source graphs; the sessions API persists the graph and advances winners transactionally; one reusable React bracket component renders admin and public variants.

**Tech Stack:** PostgreSQL/Supabase, Drizzle ORM, Vercel Functions, React 19, TypeScript, Tailwind CSS, Vitest

---

### Task 1: Schema And Migration

**Files:**
- Modify: `server/db/schema.ts`
- Create: generated `drizzle/0002_*.sql`
- Modify: `drizzle/meta/*`

- [ ] Add session format, winner-slot enum, nullable match teams, bracket round/position, next-match self-reference, and indexes.
- [ ] Run `pnpm db:generate` and review generated SQL for round-robin backfill and safe nullability changes.
- [ ] Run typecheck.

### Task 2: Knockout Bracket Engine

**Files:**
- Modify: `server/domain/competition.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Write failing tests for default 4/6/8/10-pair brackets, custom preliminary/main source placement, source reuse, and stage labels.
- [ ] Implement preliminary count, default seeding, configurable source graph validation, full bracket construction, and display grouping helpers.
- [ ] Run focused tests until green.

### Task 3: Persistence And Winner Advancement

**Files:**
- Modify: `api/admin/sessions.ts`
- Modify: `api/public/state.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Extend create/draw schemas and payloads with format/configuration.
- [ ] Persist round-robin or knockout match metadata in batches.
- [ ] Update score transaction to advance knockout winners and reject upstream winner changes after downstream scoring.
- [ ] Update finalization and public/admin payloads for nullable teams and bracket metadata.
- [ ] Run focused tests and typecheck.

### Task 4: Shared Bracket Diagram

**Files:**
- Create: `src/components/KnockoutBracket.tsx`
- Create: `src/components/KnockoutBracket.test.tsx`

- [ ] Write failing tests for stage columns, TBD slots, winner styling, and labels.
- [ ] Implement accessible horizontal stage columns, match cards, connector rails, responsive scrolling, and admin render hooks.
- [ ] Run component tests.

### Task 5: Admin Format And Bracket Configuration

**Files:**
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/components/AdminDashboard.test.tsx`

- [ ] Add format selection at session creation and format-aware draft state.
- [ ] Add knockout defaults plus editable preliminary and first-main-round source selectors.
- [ ] Submit the correct draw payload and render admin score controls inside the bracket.
- [ ] Keep round-robin behavior unchanged.

### Task 6: Public Bracket

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/MobileView.tsx`

- [ ] Carry raw public session format, teams, and bracket matches through App.
- [ ] Render read-only KnockoutBracket for knockout sessions and existing list for round robin.
- [ ] Preserve leaderboard and bilingual navigation behavior.

### Task 7: Verification

**Files:** none

- [ ] Run `CI=true pnpm test`.
- [ ] Run `CI=true pnpm lint`.
- [ ] Run `CI=true pnpm build`.
- [ ] Run `git diff --check`.
- [ ] Inspect migration SQL and report whether production migration was applied.
