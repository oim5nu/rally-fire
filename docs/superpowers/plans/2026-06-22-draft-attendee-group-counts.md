# Draft Attendee Group Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display live attendee group counts and order roster displays by points descending, then name ascending.

**Architecture:** Add pure exported helpers beside the dashboard that derive counts and an immutable sorted copy of players. Reuse the sorted copy for the Season roster and active draft attendees, requiring no new persistence or API behavior.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS

---

### Task 1: Count And Display Draft Groups

**Files:**
- Create: `src/components/AdminDashboard.test.tsx`
- Modify: `src/components/AdminDashboard.tsx:124-159,432-445`

- [ ] **Step 1: Write the failing helper test**

Test that selected attendees assigned to A or B are counted, selected attendees without an override count as Auto, and unselected overrides are ignored.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `CI=true pnpm test src/components/AdminDashboard.test.tsx`
Expected: FAIL because `countAttendeeGroups` is not exported.

- [ ] **Step 3: Implement the minimal counter and summary**

Add `countAttendeeGroups(selectedPlayers, groupOverrides)` returning `{ attendees, groupA, groupB, auto }`. Derive the counts in `AdminDashboard` and render `N attendees · A: N · B: N · Auto: N` immediately above the draft attendee grid.

- [ ] **Step 4: Verify focused and full behavior**

Run: `CI=true pnpm test src/components/AdminDashboard.test.tsx && CI=true pnpm test && CI=true pnpm lint && CI=true pnpm build`
Expected: all tests pass, TypeScript exits cleanly, and Vite builds successfully.

### Task 2: Sort Roster Displays

**Files:**
- Modify: `src/components/AdminDashboard.test.tsx`
- Modify: `src/components/AdminDashboard.tsx:14-21,423-425,459-466`

- [ ] **Step 1: Write a failing immutable-sort test**

Test higher points first, name A-Z for ties, and unchanged source order.

- [ ] **Step 2: Verify the test fails**

Run: `CI=true pnpm test src/components/AdminDashboard.test.tsx`
Expected: FAIL because `sortPlayersByPoints` does not exist.

- [ ] **Step 3: Implement and reuse the sorted copy**

Add `sortPlayersByPoints(players)`, render it in the Season roster, and filter active players from it for draft attendees. Keep the adjustment dropdown unchanged.

- [ ] **Step 4: Run complete verification**

Run: `CI=true pnpm test src/components/AdminDashboard.test.tsx && CI=true pnpm test && CI=true pnpm lint && CI=true pnpm build`
Expected: all commands pass.
