# Manual Numbered Pairing

## Goal

Require administrators to configure every A+B pair and its number before generating a match schedule, then display those pair numbers throughout the live session.

## Draft Workflow

- Attendance must be saved before pairing.
- Every selected attendee must have an explicit A or B assignment; Auto must be zero.
- Group A and Group B must contain equal numbers of attendees.
- The pairing editor contains one row per pair with a unique positive pair number, one A player, and one B player.
- Every attendee must be selected exactly once.
- Incomplete, duplicated, or group-invalid pairings block schedule generation with a clear error.
- Replace the draw action label with `Generate match schedule`.

## API And Persistence

Extend the sessions `draw` action with a required `pairs` array containing `number`, `groupAPlayerId`, and `groupBPlayerId`. The server validates the submitted configuration against saved session attendees and their explicit groups. It creates teams using the supplied number as the team seed and generates every unique team matchup without random pairing.

The existing `teams.seed` column stores the pair number, so no migration is required.

## Live Session

Display each team as `#N Player A / Player B` everywhere it appears in a live match row. Pair numbers are configured only in draft and are read-only once the schedule is published.

## Testing

Test successful manual pairing plus duplicate numbers, reused players, missing players, wrong groups, and automatic groups. Add UI-level helper tests for initial pairing rows and payload validation. Run the complete test suite, typecheck, and production build.
