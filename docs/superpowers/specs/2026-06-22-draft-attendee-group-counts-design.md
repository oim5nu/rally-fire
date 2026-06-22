# Draft Attendee Group Counts

## Goal

Show a live summary in the draft-session attendance panel so administrators can see how selected attendees are currently assigned.

## Behavior

- Display `N attendees · A: N · B: N · Auto: N` above the attendee list.
- Count only selected attendees.
- Treat a selected attendee with no manual group override as `Auto`.
- Recalculate immediately when attendance or a group override changes.
- Display the summary only while a session is in draft status.
- Order active players by points from highest to lowest, using name A-Z to break point ties.

## Implementation

Use small pure helpers to derive counts and a sorted copy of active players, then render both in the existing draft-session panel. Sorting must not mutate SWR data. No API or database changes are needed.

## Testing

Unit-test selected, unselected, manually grouped, and automatic attendees. Test points-descending ordering, name tie-breaking, and input immutability. Existing typecheck and production build must remain clean.
