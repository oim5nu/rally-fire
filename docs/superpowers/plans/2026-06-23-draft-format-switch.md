# Draft Session Format Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show and persist a round-robin/knockout selector on existing draft sessions.

**Architecture:** A pure domain guard defines draft-only eligibility. The sessions API updates and audits the format, while the dashboard uses the existing action runner to persist and refresh immediately.

**Tech Stack:** React, TypeScript, Zod, Drizzle ORM, Vitest

---

### Task 1: Guard And API

- [ ] Write a failing domain test for draft-only format changes.
- [ ] Add the guard and `set_format` sessions action.
- [ ] Update only draft sessions and insert an audit record.

### Task 2: Draft Selector

- [ ] Add a persisted format selector beside the draft heading.
- [ ] Disable it while requests are busy and refresh through `runAction`.

### Task 3: Verify And Deploy

- [ ] Run tests, typecheck, build, and diff checks.
- [ ] Commit, deploy production, and probe the sessions API.
