# Global Processing And Error Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show viewport-fixed loading and transient error feedback for initial data loading and asynchronous user actions on every screen size.

**Architecture:** A focused React context owns an overlap-safe activity counter and five-second error lifecycle. A single fixed feedback component renders state from that context, while app, auth, and admin operations use the context API to report work and request failures.

**Tech Stack:** React 19, TypeScript, SWR, Tailwind CSS 4, Vitest, Testing Library

---

### Task 1: Activity state and fixed feedback

**Files:**
- Create: `src/lib/activity.tsx`
- Create: `src/components/GlobalFeedback.tsx`
- Create: `src/components/GlobalFeedback.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing component tests**

Test a harness using `ActivityProvider`, `useActivity`, and `GlobalFeedback`. Assert that one and overlapping `track()` calls keep `role="progressbar"` visible until all promises settle. With fake timers, assert `reportError()` renders `role="alert"`, a newer message replaces it, and the message disappears after 5,000 ms.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/components/GlobalFeedback.test.tsx`

Expected: FAIL because the activity provider and feedback component do not exist.

- [ ] **Step 3: Implement the state and component**

Create an `ActivityProvider` exposing:

```ts
interface ActivityContextValue {
  active: boolean;
  error: string;
  track<T>(operation: () => Promise<T>): Promise<T>;
  reportError(message: string): void;
}
```

Use a numeric counter updated before the operation and in `finally`. Store the latest error and reset a provider-owned timeout whenever `reportError` is called. Render a fixed safe-area-aware layer with an indeterminate progress bar and error toast. Add keyframes plus a `prefers-reduced-motion` override in `src/index.css`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test src/components/GlobalFeedback.test.tsx`

Expected: all feedback component tests pass.

### Task 2: Wire application and authentication activity

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AuthPage.tsx`
- Create: `src/App.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Render `App` inside the provider with controlled SWR and auth dependencies. Assert initial public loading displays the global progress bar, a public fetch error displays the fixed alert, and logout/auth submission are tracked. Retain the session-expiry notice inline.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/App.test.tsx`

Expected: FAIL because app and auth operations do not report global activity or errors.

- [ ] **Step 3: Implement application wiring**

Mount `ActivityProvider` and `GlobalFeedback` around `App` in `src/main.tsx`. Use SWR's `isLoading` and `isValidating` to reflect public-data work, report public request failures globally, and remove the old inline public error. Wrap admin loading and logout with `track`. In `AuthPage`, wrap submitted async work with `track`, report caught request/auth errors globally, and keep password mismatch, password length, invitation callback, and session-expiry messages local.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm test src/App.test.tsx src/components/GlobalFeedback.test.tsx`

Expected: all focused tests pass.

### Task 3: Wire administrator operations and verify

**Files:**
- Modify: `src/components/AdminDashboard.tsx`
- Create: `src/components/AdminDashboard.test.tsx`

- [ ] **Step 1: Write failing admin operation tests**

Render the dashboard in the provider, trigger an admin action with a controlled request, and assert the global bar remains visible through mutation refresh. Reject the request and assert the global error toast receives the request message. Cover match score saves and data export as separate paths.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/components/AdminDashboard.test.tsx`

Expected: FAIL because admin operations use only local busy and error state.

- [ ] **Step 3: Implement administrator wiring**

Wrap `runAction`, match score saves, and export downloads with `track`. Send request failures to `reportError`, remove redundant page-level request error banners, and preserve success notices and field-specific validation.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm test src/components/AdminDashboard.test.tsx src/App.test.tsx src/components/GlobalFeedback.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 5: Run complete verification**

Run: `pnpm test && pnpm lint && pnpm build`

Expected: all tests pass, TypeScript exits without errors, and Vite produces a successful production build.
