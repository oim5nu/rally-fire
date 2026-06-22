# Return To Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators discard a published/in-progress schedule and return the session to draft attendance.

**Architecture:** Add a pure rollback-decision helper in the competition domain, then execute the destructive changes atomically in the sessions API. Add a confirmed admin dashboard action that refreshes all session state after success.

**Tech Stack:** React 19, TypeScript, Zod, Drizzle ORM, PostgreSQL, Vitest

---

### Task 1: Define Rollback Eligibility

**Files:**
- Modify: `server/domain/competition.ts`
- Modify: `server/domain/competition.test.ts`

- [ ] Write a failing test accepting `draw_published` and `in_progress`, counting completed matches, and rejecting all other statuses.
- [ ] Run the focused test and confirm failure for the missing helper.
- [ ] Implement `planAttendanceRollback(status, matches)`.
- [ ] Re-run the focused test.

### Task 2: Add Transactional API Action

**Files:**
- Modify: `api/admin/sessions.ts`

- [ ] Add `return_to_attendance` to the action schema.
- [ ] Lock the session in a serializable transaction and validate through the domain helper.
- [ ] Delete matches, team members, and teams; update status to draft; insert audit details with discarded match/score counts.
- [ ] Return the refreshed draft session or a 409 conflict.

### Task 3: Add Confirmed UI Action

**Files:**
- Modify: `src/components/AdminDashboard.tsx`

- [ ] Add `returnToAttendance()` with a destructive browser confirmation.
- [ ] Render `Return to attendance` in live sessions for both admin roles.
- [ ] Refresh session and public data through the existing action runner.

### Task 4: Verify

**Files:** none

- [ ] Run `CI=true pnpm test`.
- [ ] Run `CI=true pnpm lint`.
- [ ] Run `CI=true pnpm build`.
- [ ] Run `git diff --check`.
