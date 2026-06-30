# 0005 — Money in cents, percent in basis points

## Status

Accepted

## Context

This is a finance app. The numbers must be exact. Small rounding errors are not
acceptable when adding up net worth or amortizing a loan.

Computers store decimal numbers (floats) inaccurately. For example, `0.1 + 0.2`
does not equal exactly `0.3` in floating-point math. Storing money as dollars
like `1060.50` invites these errors, and they compound across many sums.

The same problem applies to rates. A loan rate of `5.25%` stored as a float can
drift, and tiny drift across an amortization schedule adds up.

The fix used across finance software is to store these values as **integers**
in the smallest unit, and only convert to a friendly decimal at display time.

## Decision

Store money and percentages as **integers**:

- **Money** is stored as whole **US cents**.
  - `$1,060.50` is stored as `106050`.
- **Percentages / rates** are stored as whole **basis points (bps)**. One basis
  point is one hundredth of one percent, so `1%` = `100` bps.
  - `5.25%` is stored as `525`.

All math, storage, and the domain engines use these integers end to end.

Dollars and percent appear **only at the UI edge**, in two components:

- `components/forms/money-input.tsx` — converts user dollars to/from cents.
- `components/forms/percent-input.tsx` — converts user percent to/from bps.

Conversion and formatting use the helpers in `infrastructure/money/`. Feature
code never divides by `100` or `10000` by hand. Zod schemas enforce that these
fields are integers (see CONVENTIONS rule 6).

By naming convention, money fields end in `Cents` and rate fields end in `Bps`.

## Consequences

**Good**

- Exact arithmetic. No floating-point drift in financial totals.
- One clear rule for the whole codebase, easy to review and test.
- The boundary for conversion is tiny and explicit (two input components).

**Bad / trade-offs**

- Developers must remember the units. A raw `5.25` in a rate field is a bug.
- Reading raw database values needs mental conversion (`106050` = $1,060.50).
- Every new money/percent field must route through the edge components and use
  the shared helpers, not ad-hoc math.
