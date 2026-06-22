# Return To Attendance

## Goal

Allow administrators to return a published or in-progress session from Draw & Scores to Attendance so attendance, groups, and numbered pairs can be corrected.

## Behavior

- Show `Return to attendance` for `draw_published` and `in_progress` sessions.
- Require browser confirmation explaining that the current schedule and any entered scores will be permanently discarded.
- Permit both admin and superadmin roles.
- Do not permit rollback of finalized or voided sessions.

## Transaction

Add a `return_to_attendance` sessions action. In one transaction, lock the session, verify its status, count scored matches for auditing, delete matches, team members, and teams, set the session status to `draft`, and write an audit entry. Saved participants and their explicit A/B groups remain unchanged.

## Testing

Extract and unit-test the rollback transaction operation with a repository boundary, including allowed statuses, rejected statuses, deletion order, retained participant data, and scored-match audit details. Verify the UI action contract, full test suite, typecheck, and production build.
