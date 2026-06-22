# Points-Based Draw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make accumulated points the default secure draw ranking and allow administrators to choose club skill.

**Architecture:** A criterion-neutral domain grouping function ranks numeric player values and assigns A/B halves. The sessions API supplies either ledger totals or club skill, applies stored manual overrides, persists final groups, and delegates random pairing to the existing secure draw function.

**Tech Stack:** TypeScript, Zod, Drizzle ORM, PostgreSQL, React, Vitest

---

### Task 1: Criterion-Neutral Grouping

**Files:**
- Modify: `server/domain/competition.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Add failing tests for points values, skill values, and deterministic name ties.
- [ ] Run `pnpm test server/domain/competition.test.ts` and confirm the new API is missing.
- [ ] Replace skill-specific grouping with `assignRankedGroups` using a numeric `rankingValue`.
- [ ] Run the targeted tests and confirm they pass.

### Task 2: Server Draw Method

**Files:**
- Modify: `api/admin/sessions.ts`

- [ ] Extend the draw action with `method: 'points' | 'skill'`, defaulting to `points`.
- [ ] Store only explicit group overrides during attendance updates.
- [ ] Query attendee ledger totals for points mode and club skill for skill mode.
- [ ] Rank, apply overrides, persist final groups, generate teams, and include the method in the audit log.

### Task 3: Administrator Control

**Files:**
- Modify: `src/components/AdminDashboard.tsx`

- [ ] Add draft-session state defaulting to `points`.
- [ ] Render an accessible method selector next to draw controls.
- [ ] Send the selected method with the draw action and update explanatory text.

### Task 4: Verification And Deployment

**Files:**
- Verify all changed files.

- [ ] Run `pnpm test`, `pnpm lint`, and `pnpm build`.
- [ ] Deploy production with `pnpm dlx vercel@latest deploy --prod --yes`.
- [ ] Verify `https://rally-fire.vercel.app/api/public/state` returns HTTP 200.
