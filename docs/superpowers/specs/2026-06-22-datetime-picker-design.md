# Date-Time Picker And Form Labels

## Scope

Add visible labels to the initial season fields and replace raw `datetime-local` controls with a reusable date-time picker. Reuse the component for play-session scheduling.

## Component

`DateTimePicker` renders labelled native date and time inputs inside one field group. It stores the two values locally and emits a hidden form value named by the caller in `YYYY-MM-DDTHH:mm` format. Both parts are required.

The component uses existing RallyFire colors, borders, focus states, and responsive layout. Native controls preserve keyboard, screen-reader, locale, and mobile picker support without adding a dependency.

## Form Changes

The initial season form exposes visible labels for Season name, Season starts, Winner points, and Loser points. The create-session form uses the same picker for Scheduled date and time.

Existing submit handlers remain unchanged because they continue reading `startsAt` and `scheduledAt` from `FormData`.

## Validation

Component tests verify labels, required date/time inputs, and the combined hidden value. Existing TypeScript, unit tests, and production build must remain green.
