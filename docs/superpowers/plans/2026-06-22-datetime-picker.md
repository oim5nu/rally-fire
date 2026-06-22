# Date-Time Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add visible labels to scheduling fields and replace raw date-time inputs with a reusable, accessible picker.

**Architecture:** A focused React component owns separate native date and time controls and emits one hidden combined form value. Existing form submit handlers remain unchanged and consume the same `startsAt` and `scheduledAt` keys.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: DateTimePicker component

**Files:**
- Create: `src/components/DateTimePicker.tsx`
- Create: `src/components/DateTimePicker.test.tsx`
- Modify: `package.json`

- [x] **Step 1: Add component test dependencies**

Install `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as development dependencies.

- [x] **Step 2: Write the failing component tests**

Test that `DateTimePicker` exposes a group label, labelled required date/time controls, and a hidden field whose value becomes `2026-07-01T18:30` after user changes.

- [x] **Step 3: Run the focused test and confirm failure**

Run `pnpm exec vitest run src/components/DateTimePicker.test.tsx` and expect the component import to fail.

- [x] **Step 4: Implement the component**

Create a controlled component with this interface:

```ts
interface DateTimePickerProps {
  name: string;
  label: string;
  required?: boolean;
}
```

Render `type="date"` and `type="time"` inputs with unique IDs, and a hidden input containing `${date}T${time}` only when both values exist.

- [x] **Step 5: Run the focused test and confirm success**

Run `pnpm exec vitest run src/components/DateTimePicker.test.tsx` and expect all picker tests to pass.

### Task 2: Form integration

**Files:**
- Modify: `src/components/AdminDashboard.tsx`

- [x] **Step 1: Label initial season fields**

Wrap `name`, `winPoints`, and `lossPoints` inputs in visible labels: Season name, Winner points, and Loser points.

- [x] **Step 2: Replace season scheduling input**

Render `<DateTimePicker name="startsAt" label="Season starts" required />` in place of the raw `datetime-local` input.

- [x] **Step 3: Reuse picker for play sessions**

Render `<DateTimePicker name="scheduledAt" label="Scheduled date and time" required />` in the create-session form.

- [x] **Step 4: Verify form data compatibility**

Confirm existing handlers still call `new Date(String(form.get('startsAt')))` and `new Date(String(form.get('scheduledAt')))`, requiring no API changes.

### Task 3: Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-06-22-datetime-picker.md`

- [x] **Step 1: Run all tests**

Run `pnpm test`; expect every test file to pass.

- [x] **Step 2: Run TypeScript**

Run `pnpm lint`; expect zero compiler errors.

- [x] **Step 3: Run the production build**

Run `pnpm build`; expect a successful Vite bundle.

- [x] **Step 4: Review responsive and accessible markup**

Confirm visible labels, unique control IDs, native required validation, and two-column-to-stacked responsive layout.
