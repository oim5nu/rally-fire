# Session Formats And Knockout Bracket

## Goal

Allow each session to use exactly one competition format: round robin or knockout. Knockout supports seeded preliminary matches, configurable bracket paths, automatic winner advancement, and a responsive stage diagram in both admin and public views.

## Session Setup

- Add a required session format: `round_robin` or `knockout`.
- Round robin preserves the existing numbered-pair workflow and schedules every unique pair matchup.
- Knockout uses pair numbers as seeds. Lower seed numbers receive byes before higher seed numbers.
- For a non-power-of-two field, the highest remaining seeds play the preliminary round by default: with ten pairs, `#7 vs #10` and `#8 vs #9`.
- Before publishing, admins may override preliminary pairings and place bye seeds or preliminary winners into any first-main-round bracket slot.
- Every pair/source must be used exactly once and the resulting main bracket must have a power-of-two number of slots.

## Knockout Data Model

- Add `session_format` enum and `play_sessions.format`, defaulting existing sessions to `round_robin`.
- Make `matches.team_a_id` and `matches.team_b_id` nullable for unresolved knockout slots.
- Add nullable knockout metadata to matches: `bracket_round`, `bracket_position`, `next_match_id`, and `winner_to_slot` (`A` or `B`).
- Round `0` is preliminary. Round `1` is the first main-bracket round. Later rounds increment until the final.
- Pre-create the complete bracket. Initial slots contain teams; later slots are populated by feeder winners.
- Keep `teams.seed` as the configured pair number.

## Scoring And Advancement

- A knockout match is scoreable only when both teams are resolved.
- Saving a non-tied score updates the match and writes its winner into the configured slot of the next match in the same transaction.
- Changing an upstream result is allowed only while the downstream match has no saved score; otherwise the admin must return the session to Attendance.
- Finalization requires every knockout match to be completed. Existing per-match win/loss point awards apply to all completed knockout matches.
- Round-robin scoring and finalization remain unchanged.

## Admin UI

- Add a format selector when creating a session and show the selected format in draft/live headings.
- Keep the numbered A+B pair editor for both formats.
- Round robin publishes immediately from valid pairs.
- Knockout adds a bracket setup editor with default preliminary pairings and first-main-round slot sources. Admins can override both through selects before publishing.
- The live knockout view is a horizontally scrollable stage diagram. Match cards contain pair number, names, score, court, and admin score controls.
- Unresolved slots display `TBD`. Completed winners receive the existing lime accent.

## Public UI

- Round robin keeps the existing match list.
- Knockout displays a read-only version of the same bracket component.
- Desktop/tablet show horizontal stage columns with connector paths. Mobile preserves the bracket through horizontal scrolling rather than flattening it.
- Stage labels are derived from bracket size: Preliminary, Round of N, Quarterfinal, Semifinal, Final, Champion.

## API And Validation

- Session create accepts format.
- Draw accepts either round-robin pairs or knockout pairs plus preliminary and main-slot configuration.
- Server validation is authoritative: unique seeds, every team/source used once, correct preliminary count, power-of-two main bracket, acyclic feeder paths, and valid slot ownership.
- Public and admin session payloads include format and bracket metadata.
- Return to Attendance deletes either schedule format and preserves participants/groups.

## Migration And Security

- Generate the migration through the project migration tool, then review the SQL before applying.
- Existing rows backfill to round robin and retain non-null teams.
- No new tables are exposed through the Data API; existing RLS posture remains unchanged.
- Add indexes for `(session_id, bracket_round, bracket_position)` and `next_match_id`.

## Testing

- Domain tests cover 4, 6, 8, and 10-pair brackets, default seeding, custom preliminary/main paths, invalid source reuse, and winner advancement.
- API-focused helpers cover persistence rows and downstream overwrite protection.
- UI helper tests cover stage labels, column grouping, unresolved slots, and default editable configuration.
- Run schema generation checks, all tests, typecheck, production build, and responsive browser verification where authentication permits.
