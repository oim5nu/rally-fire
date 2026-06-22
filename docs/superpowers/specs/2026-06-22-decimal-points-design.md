# Decimal Points Design

## Goal

Allow every point value to use at most one decimal place while preserving exact arithmetic and existing integer data.

## Design

- Store season awards, session award snapshots, and ledger entries as PostgreSQL `numeric(12,1)` values.
- Configure Drizzle numeric columns in number mode so API responses remain JSON numbers.
- Validate all point inputs as finite multiples of `0.1`. Winner and loser awards remain nonnegative; manual adjustments remain nonzero.
- Set point inputs to `step="0.1"`. Whole values display without a forced trailing zero, while fractional values display naturally.
- Sum ledger values as numeric values instead of casting totals to integers.
- Apply an additive migration that converts existing integer columns without losing data.

## Verification

- Unit-test one-decimal validation, including negative adjustments and rejection of two decimal places.
- Test decimal award calculation in the competition domain.
- Run the full test suite, TypeScript checking, production build, and migration generation consistency checks.

