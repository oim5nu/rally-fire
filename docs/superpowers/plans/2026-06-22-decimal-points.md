# Decimal Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support exact point values with at most one decimal place throughout Rally Fire.

**Architecture:** PostgreSQL `numeric(12,1)` is the source of truth, exposed by Drizzle in number mode. A shared Zod refinement defines point precision consistently across API endpoints, while UI number inputs opt into tenths.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, PostgreSQL, React, Vitest

---

### Task 1: Point Validation

**Files:**
- Create: `server/domain/points.ts`
- Create: `server/domain/points.test.ts`
- Modify: `api/admin/seasons.ts`
- Modify: `api/admin/players.ts`
- Modify: `api/admin/points.ts`

- [ ] Add failing tests proving `150.5` and `-10.5` are valid and `1.25` is invalid.
- [ ] Run `pnpm test server/domain/points.test.ts` and confirm failure because the shared schema is absent.
- [ ] Implement a shared finite-number schema refined with `Number.isInteger(value * 10)`.
- [ ] Replace integer-only point validation in the three admin APIs.
- [ ] Rerun the targeted tests and confirm they pass.

### Task 2: Exact Database Storage

**Files:**
- Modify: `server/db/schema.ts`
- Create: `drizzle/0001_decimal_points.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0001_snapshot.json`

- [ ] Change point-bearing columns to `numeric(12,1, { mode: 'number' })`.
- [ ] Generate a Drizzle migration with `pnpm db:generate`.
- [ ] Verify the migration alters `seasons.win_points`, `seasons.loss_points`, `play_sessions.win_points_snapshot`, `play_sessions.loss_points_snapshot`, and `point_ledger.points` using `numeric(12,1)`.

### Task 3: Decimal Totals And Domain Behavior

**Files:**
- Modify: `api/public/state.ts`
- Modify: `api/admin/players.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Add a failing competition-domain test for `150.5` winner points and `30.5` loser points.
- [ ] Remove integer casts from leaderboard totals and map numeric totals to JSON numbers.
- [ ] Run the domain tests and confirm exact decimal awards.

### Task 4: Point Inputs

**Files:**
- Modify: `src/components/AdminDashboard.tsx`

- [ ] Add `step="0.1"` to winner points, loser points, opening points, and manual adjustment fields.
- [ ] Preserve existing minimum and required constraints.

### Task 5: Verification

**Files:**
- Verify all changed files.

- [ ] Run `pnpm test` and expect all tests to pass.
- [ ] Run `pnpm lint` and expect no TypeScript errors.
- [ ] Run `pnpm build` and expect a successful Vite production build.
- [ ] Review the generated migration and working-tree diff for unrelated changes.
