# Draft Attendee Group Counts

## Goal

Show a live summary in the draft-session attendance panel so administrators can see how selected attendees are currently assigned.

## Behavior

- Display `N attendees · A: N · B: N · Auto: N` above the attendee list.
- Count only selected attendees.
- Treat a selected attendee with no manual group override as `Auto`.
- Recalculate immediately when attendance or a group override changes.
- Display the summary only while a session is in draft status.

## Implementation

Use a small pure counting helper derived from `selectedPlayers` and `groupOverrides`, then render its result in the existing draft-session panel. No API or database changes are needed.

## Testing

Unit-test selected, unselected, manually grouped, and automatic attendees. Existing typecheck and production build must remain clean.
