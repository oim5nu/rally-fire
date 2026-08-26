# Draft Session Format Switch

## Goal

Allow admins to change an existing draft session between round robin and knockout without recreating attendance or pairs.

## Behavior

- Show the persisted format selector in the draft-session header.
- Permit changes only while the session status is `draft`.
- Preserve participants, groups, and unsaved pairing UI state.
- Audit every format change.
- Published, in-progress, finalized, and voided sessions reject format changes.

## Testing

Test the draft-only status guard, then run all tests, typecheck, build, and production API verification.
