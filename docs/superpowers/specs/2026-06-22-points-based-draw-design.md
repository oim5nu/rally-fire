# Points-Based Draw Design

## Goal

Generate secure random teams using accumulated active-season points by default, with an administrator-selectable club-skill alternative.

## Behavior

- The draft-session UI offers `Accumulated points` and `Club skill`; points is selected by default.
- Attendance saves only explicit A/B overrides. Automatic groups are calculated by the server at draw time.
- For points mode, the server totals each attendee's active-season ledger and ranks highest to lowest.
- For skill mode, the server ranks by club skill highest to lowest.
- Player name, then player ID, provides deterministic tie-breaking.
- The ranked list is split equally into A and B, explicit overrides are applied, and the existing cryptographically secure shuffle pairs one A player with one B player.
- The chosen method is recorded in the draw audit entry. No schema migration is required.

## Validation And Testing

- Reject an unequal final A/B split through the existing draw validation.
- Test points ranking, skill ranking, deterministic ties, and secure draw compatibility.
- Verify the API, UI, full tests, TypeScript, and production build.

