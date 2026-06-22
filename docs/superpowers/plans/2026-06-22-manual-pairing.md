# Manual Numbered Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require complete numbered A+B pair configuration before publishing a round-robin match schedule.

**Architecture:** Validate and construct configured teams in the competition domain, persist them through the existing batched draw transaction, and manage draft pairing rows in the admin dashboard. Existing team seeds store pair numbers, avoiding a migration.

**Tech Stack:** React 19, TypeScript, Zod, Drizzle ORM, PostgreSQL, Vitest

---

### Task 1: Validate Configured Pairing

**Files:**
- Modify: `server/domain/competition.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Write failing tests for complete valid pairs and rejection of Auto groups, duplicate numbers, reused/missing players, and wrong groups.
- [ ] Run `CI=true pnpm test server/domain/competition.test.ts` and confirm failure for the missing validator.
- [ ] Add `buildConfiguredDraw(participants, pairs)` returning teams ordered by pair number and all unique matchups.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Require Pair Payload In Sessions API

**Files:**
- Modify: `api/admin/sessions.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Extend the draw schema with required positive pair numbers and UUID player IDs.
- [ ] Replace ranked/random grouping with `buildConfiguredDraw` using saved attendee groups.
- [ ] Persist supplied pair numbers through `buildDrawPersistenceRows` and return validation errors as `invalid_draw`.
- [ ] Run focused tests and `CI=true pnpm lint`.

### Task 3: Add Draft Pairing Editor And Live Labels

**Files:**
- Modify: `src/components/AdminDashboard.tsx`
- Modify: `src/components/AdminDashboard.test.tsx`

- [ ] Write failing tests for initial pairing rows and complete pairing validation.
- [ ] Add pairing-row state initialized from explicit balanced A/B attendees.
- [ ] Render number, A-player, and B-player controls; require saved, explicit, complete attendance before generation.
- [ ] Send pairs in the draw action and rename the button to `Generate match schedule`.
- [ ] Prefix live team names with `#seed`.

### Task 4: Verify

**Files:** none

- [ ] Run `CI=true pnpm test`.
- [ ] Run `CI=true pnpm lint`.
- [ ] Run `CI=true pnpm build`.
- [ ] Run `git diff --check`.
