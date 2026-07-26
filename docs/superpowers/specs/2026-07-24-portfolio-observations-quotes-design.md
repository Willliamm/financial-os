# Observations, Portfolio Lots and Market Quotes — Design Spec

**Date:** 2026-07-24
**Status:** Draft for review
**Scope:** Fronts F1 + F2 + F3 from the 2026-07-24 product study
**Language note:** written in English to match `docs/architecture.md` and the codebase. The
product study that motivates it is a separate artifact.

---

## 1. Goal

Give Financial OS a memory of the past and a real investment portfolio.

Today the app models "now" (current balances) and "the projected future" (scenarios). It has
no record of *what happened*. This spec adds three things, in dependency order:

1. **F1 — Observations.** A datestamped value mark for any asset or liability, so net worth
   becomes a curve instead of a single number.
2. **F2 — Portfolio lots.** Holdings and purchase lots, so "12 shares of VOO bought on
   2026-03-14" is first-class data with cost basis, unrealized gain and holding period.
3. **F3 — Market quotes.** Share prices pulled through the user's own Google Sheet using
   `GOOGLEFINANCE`, with no backend, no API key and no new OAuth scope.

### Success criteria

- A user can record a VOO purchase and see position value, cost basis, unrealized gain,
  simple return, money-weighted return and days-to-long-term.
- The dashboard shows a net-worth history line built only from observed marks, with honest
  coverage shading where not every asset was marked.
- Every asset and liability shows how old its last mark is.
- Prices refresh from the workbook on demand and accumulate into a local price history.
- `npm run typecheck && npm run test && npm run lint` all pass; the existing 68 tests stay green.

### Non-goals (explicitly out of scope)

- Transaction import, bank sync, expense categorization. The product is a planning
  instrument, not a ledger.
- Tax engine rewrite, buckets, allocation rules, recurring-flow cadence, AI layer. Those are
  fronts F4–F6 and get their own specs.
- Time-weighted return (TWR), realized gain/loss reporting, wash-sale detection, dividend
  tracking, partial-lot sales, rebalancing trade suggestions. See §12.
- Backfilling historical prices. History starts accumulating the day the feature ships.

---

## 2. Architectural constraints (unchanged)

Everything below obeys the existing rules in `CLAUDE.md`. Restated because they shape the design:

- **Static export.** `output: "export"`. No API routes, no middleware, no server actions.
- **Money is integer US cents. Percentages are integer basis points.**
- **Every mutation goes through `applyCommand`** in `infrastructure/db/command-service.ts`.
- **Local write precedes sync.** Dexie is the source of truth; Sheets is downstream.
- **`domain/` stays pure.** No React, no Dexie, no Google imports. Engines are pure functions
  that receive data and return numbers.
- **Currency stays USD.** Only formatting localizes.
- **No `[id]` dynamic routes.** Detail pages use query params.

---

## 3. Locked design decisions

These are decided, with the reasoning, so the implementation does not relitigate them.

### D1 — Observations are additive history; entity fields stay the current value

Marking a value writes an `Observation` **and** updates the subject entity's current-value
field. Two commands, one user action.

*Why:* every existing engine reads `currentValueCents` / `currentBalanceCents`. Making those
fields derived would force a rewrite of `net-worth-engine`, `fire-engine`, `retirement-engine`
and `scenario-engine` in the same change. Additive history keeps the blast radius at zero and
still produces the curve.

### D2 — History reflects only what was observed

`buildNetWorthHistory` never invents a value for a subject that has no observation on or
before the sample date. It carries the last known mark forward, and reports a **coverage**
ratio per point.

*Why:* back-filling today's house value into 2024 produces a confident-looking lie. Coverage
shading is honest and turns into a reason to mark more often.

### D3 — Shares are integers in millionths (`sharesMicro`)

1 share = `1_000_000`. Same discipline as cents and basis points. Fractional shares are real
(brokerages sell them) and floats are not an option for persisted values.

### D4 — Lot cost is stored as a total, not per-share

`costTotalCents` + `feesCents`, never a per-share price. Per-share is derived for display.

*Why:* $512.4013 × 12 shares cannot round-trip through an integer per-share cent value. The
total is what the brokerage statement shows and what the IRS cares about.

### D5 — Quote prices are integer cents per share, rounded

`priceCents` is an integer. A price of $512.4013 stores as `51240`.

*Why:* max error is half a cent per share. On a 10,000-share position that is $50 on a
position worth $5.1M — about 0.001%. This is a planning tool with a 20-minute-delayed feed;
sub-cent precision is false precision. Documented in the schema comment.

### D6 — Prices are an engine *input*, never an engine fetch

Portfolio engines receive a `PriceMap` parameter. They never read Dexie or call Google.
Missing price ⇒ `marketValueCents: 0` and `hasPrice: false`, never a crash or a guess.

### D7 — The `__quotes` tab is technical, the `price_quotes` sheet is domain data

`__quotes` is a scratch tab holding live `GOOGLEFINANCE` formulas. It is not synced into
Dexie. Each successful read is persisted as a `price_quote` **domain entity**, which syncs
normally and becomes the app's own price history.

*Why:* Google blocks reading *historical* `GOOGLEFINANCE` ranges through the API (returns
`#N/A` since 2016). Building our own series sidesteps that permanently.

### D8 — One quote per ticker per day

`refreshQuotes` skips a ticker that already has a `price_quote` for today. Refreshing five
times in an afternoon does not create five rows.

### D9 — Lots are buy-only in v1, with a manual close

A lot is opened by a purchase. Selling marks it `closed` with a `closeDate` and
`proceedsCents`. Partial sales are handled by the user editing the lot's shares and creating
a second lot. Automatic lot splitting is deferred (§12).

### D10 — Long-term threshold uses calendar dates, not a 365-day count

`longTermOn = tradeDate + 1 year + 1 day`. A position is long-term when `asOf >= longTermOn`.

*Why:* the US holding period starts the day after the trade date and must exceed one year.
A 365-day counter is wrong across leap years.

---

## 4. Data model

### 4.1 New entity types

Add to `domain/entities/base.ts`:

```ts
export type EntityType =
  | "household"
  | "person"
  | "income_source"
  | "expense"
  | "property"
  | "loan"
  | "investment_account"
  | "tax_strategy"
  | "tax_assumption"
  | "scenario"
  | "scenario_assumption"
  | "projection_snapshot"
  | "observation"      // NEW
  | "holding"          // NEW
  | "lot"              // NEW
  | "price_quote";     // NEW
```

`ENTITY_SHEET` and `ENTITY_LOCK_TYPE` gain matching entries:

| Entity type | Sheet tab | Lock type |
| --- | --- | --- |
| `observation` | `observations` | `observation` |
| `holding` | `holdings` | `holding` |
| `lot` | `lots` | `lot` |
| `price_quote` | `price_quotes` | `price_quote` |

`domain/commands/index.ts` `CommandType` gains 12 entries following the existing pattern
(`CreateObservation`, `UpdateObservation`, `DeleteObservation`, and the same triple for
`Holding`, `Lot`, `PriceQuote`), plus the `ENTITY_PASCAL` map entries `observation:
"Observation"`, `holding: "Holding"`, `lot: "Lot"`, `price_quote: "PriceQuote"`.

`infrastructure/sync/workbook-manager.ts` `DOMAIN_SHEET_NAMES` gains the four tab names.
`DOMAIN_ENTITY_TYPES` is derived from `SHEET_COLUMNS`, so it picks them up automatically.

### 4.2 Interfaces (`domain/entities/index.ts`)

```ts
/** What an observation can be a mark of. Holdings are valued from quotes, not marked. */
export type ObservationSubjectType =
  | "investment_account"
  | "property"
  | "loan";

export type ObservationSource = "manual" | "quote" | "import";

export interface Observation extends BaseEntity {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Calendar day of the mark, "YYYY-MM-DD". Not a timestamp. */
  observedAt: string;
  /** The value as reported, normally positive. A loan balance is stored
   *  positive; the history engine subtracts it. Negative is allowed so a
   *  margin account can be marked honestly. */
  valueCents: number;
  source: ObservationSource;
  note: string;
}

export type AssetClass =
  | "us_equity"
  | "intl_equity"
  | "bond"
  | "reit"
  | "cash"
  | "crypto"
  | "other";

export interface Holding extends BaseEntity {
  /** InvestmentAccount.id this position lives in. */
  accountId: string;
  /** Uppercase symbol, e.g. "VOO". Empty for an untracked/unquoted holding. */
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Target weight in the portfolio, in bps. 0 means "no target set". */
  targetAllocationBps: number;
}

export type LotStatus = "open" | "closed";

export interface Lot extends BaseEntity {
  holdingId: string;
  /** Trade date, "YYYY-MM-DD". */
  tradeDate: string;
  /** Integer millionths of a share. 1 share = 1_000_000. */
  sharesMicro: number;
  /** Total paid for the shares, excluding fees. */
  costTotalCents: number;
  feesCents: number;
  status: LotStatus;
  closeDate: string | null;
  /** Gross proceeds when closed; 0 while open. */
  proceedsCents: number;
  note: string;
}

export type QuoteSource = "googlefinance" | "manual";

export interface PriceQuote extends BaseEntity {
  ticker: string;
  /** "YYYY-MM-DD". At most one quote per ticker per day (D8). */
  quoteDate: string;
  /** Price per share in integer cents, rounded (D5). */
  priceCents: number;
  source: QuoteSource;
}
```

`AnyEntity` gains `| Observation | Holding | Lot | PriceQuote`.

### 4.3 Zod schemas (`domain/schemas/index.ts`)

Follow the existing style: `baseEntityShape` spread, permissive ids, `.default()` on every
optional field so a malformed spreadsheet cell never drops a whole row.

```ts
const dateOnly = z.string(); // "YYYY-MM-DD"; permissive like the other date fields

export const observationSubjectTypeSchema = z.enum([
  "investment_account",
  "property",
  "loan",
]);

export const observationSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  subjectType: observationSubjectTypeSchema,
  subjectId: idString,
  observedAt: dateOnly,
  valueCents: cents,
  source: z.enum(["manual", "quote", "import"]).default("manual"),
  note: z.string().default(""),
});

export const assetClassSchema = z.enum([
  "us_equity",
  "intl_equity",
  "bond",
  "reit",
  "cash",
  "crypto",
  "other",
]);

export const holdingSchema = z.object({
  ...baseEntityShape,
  accountId: idString,
  ticker: z.string().default(""),
  name: z.string().default(""),
  assetClass: assetClassSchema.default("us_equity"),
  targetAllocationBps: rateBps.default(0),
});

export const lotSchema = z.object({
  ...baseEntityShape,
  holdingId: idString,
  tradeDate: dateOnly,
  sharesMicro: z.number().int().nonnegative(),
  costTotalCents: nonNegCents,
  feesCents: nonNegCents.default(0),
  status: z.enum(["open", "closed"]).default("open"),
  closeDate: z.string().nullable().default(null),
  proceedsCents: nonNegCents.default(0),
  note: z.string().default(""),
});

export const priceQuoteSchema = z.object({
  ...baseEntityShape,
  ticker: z.string().min(1),
  quoteDate: dateOnly,
  priceCents: nonNegCents,
  source: z.enum(["googlefinance", "manual"]).default("manual"),
});
```

All four are registered in `ENTITY_SCHEMAS`.

### 4.4 Sheet columns (`infrastructure/sync/sheet-schema.ts`)

Same `entityColumns([...])` wrapper, snake_case headers.

```ts
observation: entityColumns([
  col("household_id", "householdId", "string"),
  col("subject_type", "subjectType", "string"),
  col("subject_id", "subjectId", "string"),
  col("observed_at", "observedAt", "string"),
  col("value_cents", "valueCents", "number"),
  col("source", "source", "string"),
  col("note", "note", "string"),
]),
holding: entityColumns([
  col("account_id", "accountId", "string"),
  col("ticker", "ticker", "string"),
  col("name", "name", "string"),
  col("asset_class", "assetClass", "string"),
  col("target_allocation_bps", "targetAllocationBps", "number"),
]),
lot: entityColumns([
  col("holding_id", "holdingId", "string"),
  col("trade_date", "tradeDate", "string"),
  col("shares_micro", "sharesMicro", "number"),
  col("cost_total_cents", "costTotalCents", "number"),
  col("fees_cents", "feesCents", "number"),
  col("status", "status", "string"),
  col("close_date", "closeDate", "string"),
  col("proceeds_cents", "proceedsCents", "number"),
  col("note", "note", "string"),
]),
price_quote: entityColumns([
  col("ticker", "ticker", "string"),
  col("quote_date", "quoteDate", "string"),
  col("price_cents", "priceCents", "number"),
  col("source", "source", "string"),
]),
```

`TECHNICAL_SHEETS` gains the scratch tab:

```ts
__quotes: ["ticker", "price", "name", "currency", "updated_at"],
```

### 4.5 Financial context

`domain/context.ts` `FinancialContext` gains four arrays, and `emptyContext()` gains four
empty defaults:

```ts
observations: Observation[];
holdings: Holding[];
lots: Lot[];
priceQuotes: PriceQuote[];
```

`infrastructure/db/repositories/index.ts` gains four `EntityRepository` instances and four
entries in the `loadFinancialContext` `Promise.all`.

`test/unit/engines/fixtures.ts` gains `makeObservation`, `makeHolding`, `makeLot`,
`makeQuote` builders and `makeContext` accepts the new arrays.

### 4.6 Schema version

`lib/constants.ts`: `APP_SCHEMA_VERSION` 3 → 4.

`infrastructure/sync/migrations/index.ts` gains one entry:

```ts
{
  version: 4,
  name: "add observations, holdings, lots, price_quotes",
  async up() {
    // No data transform needed. initWorkbook -> ensureSheets creates the new
    // tabs idempotently from SHEET_COLUMNS and TECHNICAL_SHEETS. This entry
    // exists so the workbook stamps schema_version 4.
  },
},
```

---

## 5. F1 — Observations

### 5.1 Value-field mapping

Marking a value must also update the subject's current-value field (D1). One map, in the
application layer (not the domain, because it names persistence fields):

`features/observations/subject-map.ts`

```ts
import type { ObservationSubjectType } from "@/domain/entities";

/** Which entity field a mark of this subject type writes through to. */
export const SUBJECT_VALUE_FIELD: Record<ObservationSubjectType, string> = {
  investment_account: "currentBalanceCents",
  property: "currentValueCents",
  loan: "currentBalanceCents",
};

/** Whether the subject reduces net worth (its observation value is a debt). */
export const SUBJECT_IS_LIABILITY: Record<ObservationSubjectType, boolean> = {
  investment_account: false,
  property: false,
  loan: true,
};
```

### 5.2 Mark action

`features/observations/use-mark-value.ts` — a hook returning
`markValue(input): Promise<void>`:

```ts
export interface MarkValueInput {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  observedAt: string;   // "YYYY-MM-DD"
  valueCents: number;
  note?: string;
}
```

Behaviour, in order:

1. `createEntity<Observation>("observation", { ...input, source: "manual", note: input.note ?? "" })`.
2. `updateEntity(subjectType, { id: subjectId, [SUBJECT_VALUE_FIELD[subjectType]]: valueCents })`
   — **only when `observedAt` is the newest observation for that subject.** Marking a
   backdated value must not overwrite a more recent current value.
3. `invalidateFinancialData(queryClient)`.

Two `applyCommand` calls means two Dexie transactions and two audit records. That is correct:
they are two distinct facts (a historical mark, and a change to the current value).

### 5.3 History engine

`domain/engines/history/net-worth-history.ts` — pure.

```ts
import type { FinancialContext } from "@/domain/context";
import type { MoneyCents } from "@/infrastructure/money/money";
import type { BasisPoints } from "@/domain/value-objects/basis-points";

export interface HistoryPoint {
  /** Sample date, "YYYY-MM-DD" (last day of the month for monthly granularity). */
  date: string;
  totalAssetsCents: MoneyCents;
  totalLiabilitiesCents: MoneyCents;
  netWorthCents: MoneyCents;
  /** How many tracked subjects had a mark on or before this date. */
  observedSubjects: number;
  totalSubjects: number;
  /** observedSubjects / totalSubjects in bps. 10000 = fully covered. */
  coverageBps: BasisPoints;
}

export interface HistoryOptions {
  /** Defaults to the earliest observation date. */
  from?: string;
  /** Required. The engine takes no clock, so the caller supplies "today". */
  to: string;
  /** Defaults to "month". */
  granularity?: "month";
}

export function buildNetWorthHistory(
  context: FinancialContext,
  options: HistoryOptions,
): HistoryPoint[];
```

Algorithm:

1. Filter out soft-deleted observations and subjects.
2. `totalSubjects` = count of non-deleted investment accounts + properties + loans.
   Holdings are excluded: their value rolls into their account.
3. Build the sample dates: month ends from `from` through `to`, inclusive, plus `to` itself
   when it is not a month end.
4. For each sample date and each subject, take the observation with the greatest `observedAt`
   that is `<= date`. No observation ⇒ the subject contributes 0 and does not count toward
   `observedSubjects`.
5. Assets = sum of non-liability subject values. Liabilities = sum of liability subject
   values. Net worth = assets − liabilities.
6. Return `[]` when there are no observations at all.

The engine takes no clock and no `Date.now()` — `to` is always supplied by the caller, so
tests are deterministic.

### 5.4 Freshness engine

`domain/engines/history/data-freshness.ts` — pure.

```ts
export type FreshnessLevel = "fresh" | "aging" | "stale";

export interface FreshnessThresholds {
  /** Max age in days to count as fresh. Default 45. */
  freshDays: number;
  /** Max age in days to count as aging. Default 180. */
  agingDays: number;
}

export interface SubjectFreshness {
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Entity display name, resolved by the engine from the context. */
  label: string;
  lastObservedAt: string | null;
  /** null when never observed. */
  ageDays: number | null;
  level: FreshnessLevel;
}

export function assessFreshness(
  context: FinancialContext,
  asOf: string,
  thresholds?: Partial<FreshnessThresholds>,
): SubjectFreshness[];

/** Weighted share of fresh data: fresh = 1, aging = 0.5, stale/never = 0. */
export function planConfidenceBps(freshness: SubjectFreshness[]): BasisPoints;
```

Never-observed subjects are `level: "stale"`, `ageDays: null`.
`planConfidenceBps` returns `10000` for an empty list (nothing to be stale about).

### 5.5 UI surfaces for F1

| Surface | File | Change |
| --- | --- | --- |
| Mark dialog | `components/shared/mark-value-dialog.tsx` (new) | Date picker + money input + note. Calls `useMarkValue`. Prefills date with today and value with the subject's current value. |
| Property page | `app/(app)/property/page.tsx` | "Mark value" button in the header; small history sparkline of that property's marks. |
| Investments list | `app/(app)/investments/page.tsx` | Row action "Mark value" per account. |
| Loans list | `app/(app)/loans/page.tsx` | Row action "Mark balance" per loan. |
| Dashboard | `app/(app)/dashboard/page.tsx` | Net-worth history chart (lazy ECharts, matching the existing chart pattern) with coverage-based opacity, plus a freshness banner listing stale subjects. |
| Observations list | `app/(app)/observations/page.tsx` (new, ~15 lines) | Generic Data Studio list screen, same shape as `app/(app)/investments/page.tsx`. |

The chart component goes in `components/charts/net-worth-history-chart.tsx`, following the
existing lazy-load pattern used by the other charts.

---

## 6. F2 — Portfolio

### 6.1 Shares value object

`domain/value-objects/shares.ts` — new, mirrors `basis-points.ts`.

```ts
import type { MoneyCents } from "@/infrastructure/money/money";

/** Integer millionths of a share. 1 share = 1_000_000 (D3). */
export type ShareMicros = number;

export const SHARE_SCALE = 1_000_000;

export function sharesToMicros(shares: number): ShareMicros;   // rounds
export function microsToShares(micros: ShareMicros): number;

/** Format for display, e.g. 12_500_000 -> "12.5". Trims trailing zeros. */
export function formatShares(
  micros: ShareMicros,
  options?: { maxDecimals?: number },  // default 4
): string;

/** shares x price-per-share, rounded to the nearest cent. */
export function sharesValueCents(
  micros: ShareMicros,
  pricePerShareCents: MoneyCents,
): MoneyCents;

/** Derived per-share cost for display only. Returns 0 when micros is 0. */
export function costPerShareCents(
  totalCents: MoneyCents,
  micros: ShareMicros,
): MoneyCents;
```

`sharesValueCents` = `Math.round((micros * pricePerShareCents) / SHARE_SCALE)`.

### 6.2 Portfolio engine

`domain/engines/portfolio/portfolio-engine.ts` — pure.

```ts
/** ticker -> price per share in integer cents. Missing key = no price (D6). */
export type PriceMap = Record<string, MoneyCents>;

export interface Position {
  holdingId: string;
  accountId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Sum of open-lot shares. */
  sharesMicro: ShareMicros;
  /** Sum of open-lot (costTotalCents + feesCents). */
  costBasisCents: MoneyCents;
  /** 0 when hasPrice is false. */
  marketValueCents: MoneyCents;
  unrealizedGainCents: MoneyCents;
  /** (market - basis) / basis in bps. 0 when basis is 0 or price is missing. */
  simpleReturnBps: BasisPoints;
  hasPrice: boolean;
  lotCount: number;
}

export function buildPositions(
  context: FinancialContext,
  prices: PriceMap,
): Position[];

export function portfolioValueCents(positions: Position[]): MoneyCents;
export function portfolioCostBasisCents(positions: Position[]): MoneyCents;
export function portfolioUnrealizedGainCents(positions: Position[]): MoneyCents;

export interface AllocationSlice {
  assetClass: AssetClass;
  valueCents: MoneyCents;
  weightBps: BasisPoints;
}
export function allocationByAssetClass(positions: Position[]): AllocationSlice[];

export interface AllocationDrift {
  holdingId: string;
  ticker: string;
  targetBps: BasisPoints;
  actualBps: BasisPoints;
  /** actual - target. Negative means underweight. */
  driftBps: BasisPoints;
}
/** Only holdings with targetAllocationBps > 0 are returned. */
export function allocationDrift(positions: Position[]): AllocationDrift[];

/**
 * Value of an investment account: sum of its positions when it has any,
 * otherwise the account's own currentBalanceCents. Positions without a price
 * fall back to their cost basis so the account is never understated.
 */
export function accountValueCents(
  account: InvestmentAccount,
  positions: Position[],
): MoneyCents;
```

Rules:

- Only `status === "open"` and non-deleted lots contribute to a position.
- A holding with zero open lots still appears, with zeros. This keeps a newly created
  holding visible so the user can add its first lot.
- `weightBps` is computed against `portfolioValueCents`; when that is 0 every weight is 0.

### 6.3 Lot engine

`domain/engines/portfolio/lot-engine.ts` — pure.

```ts
export interface LotView {
  lotId: string;
  holdingId: string;
  ticker: string;
  tradeDate: string;
  sharesMicro: ShareMicros;
  /** costTotalCents + feesCents. */
  costBasisCents: MoneyCents;
  costPerShareCents: MoneyCents;
  marketValueCents: MoneyCents;
  unrealizedGainCents: MoneyCents;
  hasPrice: boolean;
  daysHeld: number;
  /** First date on which a sale would be long-term (D10). */
  longTermOn: string;
  isLongTerm: boolean;
  /** 0 when already long-term. */
  daysToLongTerm: number;
}

export function buildLotViews(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): LotView[];

/** Open lots currently below cost, biggest paper loss first. */
export function lotsAtALoss(views: LotView[]): LotView[];

/** Open lots crossing into long-term within `withinDays`, soonest first. */
export function lotsNearingLongTerm(
  views: LotView[],
  withinDays: number,
): LotView[];
```

`longTermOn` is computed with the existing date helpers in
`infrastructure/dates/date-utils.ts`; add `addYears` and `addDays` there if they do not
already exist. Note the domain-purity rule allows this import — `infrastructure/dates` and
`infrastructure/money` are already imported by existing engines.

### 6.4 Return engine

`domain/engines/portfolio/return-engine.ts` — pure.

```ts
export interface CashFlow {
  date: string;          // "YYYY-MM-DD"
  /** Negative for money put in, positive for money taken out or final value. */
  amountCents: MoneyCents;
}

/**
 * Internal rate of return on irregularly spaced flows (XIRR).
 * Newton-Raphson from `guess`, falling back to bisection over [-0.99, 10].
 * Returns the annual rate as a decimal (0.087 = 8.7%), or null when it does
 * not converge, when there are fewer than two flows, or when all flows share
 * a sign.
 */
export function xirr(flows: CashFlow[], guess?: number): number | null;

/**
 * Money-weighted return of the whole portfolio: every open lot's cost is an
 * outflow on its trade date, and the current market value is a single inflow
 * on `asOf`. Returns bps, or null when xirr does not converge.
 */
export function moneyWeightedReturnBps(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): BasisPoints | null;
```

Convergence: max 100 iterations, tolerance `1e-7` on the NPV, `1e-9` on the rate step.

### 6.5 Net-worth engine change

`domain/engines/net-worth/net-worth-engine.ts` currently sums
`account.currentBalanceCents`. It must use `accountValueCents(account, positions)` so an
account with holdings is valued from its positions.

Signature change: the net-worth functions gain an **optional** `prices: PriceMap` parameter,
defaulting to `{}`. With no prices, positions fall back to cost basis, so behaviour without
holdings is byte-identical to today and the existing `net-worth-engine.test.ts` stays green.

### 6.6 Data Studio wiring

`features/data-studio/types.ts` — extend the dynamic-options union:

```ts
dynamicOptions?: "people" | "properties" | "scenarios" | "investmentAccounts" | "holdings";
```

`features/data-studio/entity-form-drawer.tsx` — add two branches to `dynamicOptions()`
(around line 301), matching the existing `properties` branch exactly:

```ts
if (field.dynamicOptions === "investmentAccounts") {
  return [
    { value: "", label: "common:none", raw: false },
    ...context.investmentAccounts.map((a) => ({ value: a.id, label: a.name, raw: true })),
  ];
}
if (field.dynamicOptions === "holdings") {
  return [
    { value: "", label: "common:none", raw: false },
    ...context.holdings.map((h) => ({
      value: h.id,
      label: h.ticker || h.name,
      raw: true,
    })),
  ];
}
```

`features/data-studio/registry.tsx` — three new configs (`holding`, `lot`, `observation`),
added to `ENTITY_REGISTRY` and `DATA_STUDIO_MODULES`. `price_quote` gets **no** registry
entry: it is machine-written data, not something the user hand-edits.

- `holding`: `href: "/portfolio"`, no `inject` (a holding hangs off an account, not the
  household), fields `accountId`
  (select, `dynamicOptions: "investmentAccounts"`, required), `ticker` (text, required),
  `name` (text), `assetClass` (select), `targetAllocationBps` (percent).
- `lot`: `href: "/portfolio"`, fields `holdingId` (select, `dynamicOptions: "holdings"`,
  required), `tradeDate` (date, required), `sharesMicro` (number — see note),
  `costTotalCents` (money, required), `feesCents` (money), `status` (select),
  `closeDate` (date), `proceedsCents` (money), `note` (textarea).
- `observation`: `href: "/observations"`, `inject: (ctx) => ({ householdId: ctx.householdId })`,
  fields `subjectType` (select), `subjectId` (text — the generic form cannot switch its
  option source on another field's value; the *primary* entry point is the mark dialog,
  and this screen is the power-user fallback), `observedAt` (date, required),
  `valueCents` (money, required), `note` (textarea).

**Shares input:** `FieldType` gains `"shares"`, handled in `entity-form-drawer.tsx` and
`features/data-studio/form-utils.ts` the same way `money`/`percent` are — the user types
`12.5`, the form stores `12_500_000`. A new
`components/forms/shares-input.tsx` mirrors `money-input.tsx`.

### 6.7 Portfolio screen

New route `app/(app)/portfolio/page.tsx`, added to the nav in `components/layout`.

Sections, top to bottom:

1. **Summary tiles** — total market value, total cost basis, unrealized gain (with bps),
   money-weighted return, count of positions missing a price.
2. **Positions table** — ticker, name, account, shares, cost basis, price, market value,
   unrealized gain, weight. Rows without a price show a "no price" chip instead of a zero.
3. **Allocation** — donut by asset class, plus a drift list for holdings with a target.
4. **Lots table** — grouped under an expandable position row: trade date, shares,
   cost/share, market value, gain, days held, long-term chip or "N days to long-term".
5. **Refresh prices** button — see §7.4.

Charts follow the existing lazy ECharts pattern in `components/charts/`.

---

## 7. F3 — Market quotes

### 7.1 The spike comes first

> **RESULT — 2026-07-26: PASS.** Run against a throwaway spreadsheet created and deleted
> with the app's own client id and scopes (`drive.file` + `spreadsheets`), so the real
> workbook was never touched and no file was left in Drive.
>
> | Formula | `UNFORMATTED_VALUE` | JS type |
> | --- | --- | --- |
> | `=GOOGLEFINANCE("VOO")` | `679.14` | number |
> | `=GOOGLEFINANCE("VOO","price")` | `679.14` | number |
> | `=GOOGLEFINANCE("NYSEARCA:VOO","price")` | `679.14` | number |
> | `=GOOGLEFINANCE("NASDAQ:AAPL","price")` | `333.02` | number |
> | `=GOOGLEFINANCE("BND","price")` | `72.31` | number |
> | `=GOOGLEFINANCE("CURRENCY:USDBRL")` | `5.0835` | number |
> | `=GOOGLEFINANCE("VOO","name")` | `Vanguard S&P 500 ETF` | string |
> | `=GOOGLEFINANCE("VOO","currency")` | `USD` | string |
> | `=GOOGLEFINANCE("ZZZZNOTREAL","price")` | `#N/A (…returned no data.)` | string |
>
> Findings that change the plan:
>
> 1. **Current price is readable, as a real JSON number.** `UNFORMATTED_VALUE` returns
>    `679.14`, not `"679.14"` — so §7.2's string-mapping step matters, and the parser
>    never has to strip a locale separator.
> 2. **`valueInputOption` is confirmed load-bearing.** A control row written with `RAW`
>    came back as the literal text `=GOOGLEFINANCE("VOO","price")`. Without the
>    `USER_ENTERED` change in §7.2, nothing evaluates. D-confirmed.
> 3. **An unknown ticker returns a string beginning with `#N/A`**, exactly the shape
>    §7.3's parsing rule already expects (leading `#` ⇒ null).
> 4. **Historical data was readable too, contrary to the assumption below.**
>    `=INDEX(GOOGLEFINANCE("VOO","price",TODAY()-7,TODAY()),2,2)` returned `682.21` as a
>    number. What appears to be blocked is reading the raw *array* result; wrapping it in
>    `INDEX` to extract one scalar cell works. This was a single observation and is NOT
>    load-bearing — the design still builds its own price history (D7) and needs only the
>    current price. Treat it as an opportunity to revisit later, not a fact to build on.
>
> The original caveat is kept below for the record.

**Spike procedure** (manual, ~30 minutes, real Google mode):

1. In the app's workbook, add a tab `__quotes` with headers `ticker | price | name | currency | updated_at`.
2. `PUT .../values/__quotes!A2:B2?valueInputOption=USER_ENTERED` with
   `[["VOO", "=GOOGLEFINANCE(A2,\"price\")"]]`.
3. `GET .../values/__quotes!A2:B2?valueRenderOption=UNFORMATTED_VALUE`.
4. **Pass:** cell B2 returns a number. **Fail:** it returns `#N/A`, `#ERROR!`, `0`, or the
   literal formula string.

**If the spike fails**, F3 ships without the Google path: the quote UI keeps the manual
price entry and CSV import (§7.5), which are built either way. Everything in F1 and F2 is
unaffected — they consume a `PriceMap`, not a feed (D6).

Record the spike result in this file under §7.1 before writing §7.2 code.

### 7.2 Sheets client extension

`infrastructure/google/google-api-types.ts`:

```ts
export interface GetValuesOptions {
  /** Ask Sheets for raw values instead of display strings. Needed to read a
   *  GOOGLEFINANCE result as a number rather than a locale-formatted string. */
  unformatted?: boolean;
}

export interface UpdateRangeOptions {
  /** Send valueInputOption=USER_ENTERED so "=FORMULA(...)" is evaluated by
   *  Sheets instead of being stored as literal text. */
  formulas?: boolean;
}

export interface SheetsClient {
  ensureSheets(spreadsheetId: string, sheets: SheetDefinition[]): Promise<void>;
  listSheetTitles(spreadsheetId: string): Promise<string[]>;
  getValues(
    spreadsheetId: string,
    range: string,
    options?: GetValuesOptions,          // NEW, optional
  ): Promise<SheetValues>;
  batchGetValues(
    spreadsheetId: string,
    ranges: string[],
  ): Promise<Record<string, SheetValues>>;
  appendRows(
    spreadsheetId: string,
    sheetName: string,
    rows: SheetValues,
  ): Promise<AppendResult>;
  updateRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
    options?: UpdateRangeOptions,        // NEW, optional
  ): Promise<void>;
}
```

Both parameters are optional, so every existing call site compiles unchanged.

`infrastructure/google/real-clients.ts`:

- `getValues` appends `?valueRenderOption=UNFORMATTED_VALUE` when `options.unformatted`.
  Because that mode returns JSON numbers and booleans, the response must be mapped to
  strings: `(data.values ?? []).map(row => row.map(cell => cell == null ? "" : String(cell)))`.
  `SheetValues` stays `string[][]`.
- `updateRange` uses `valueInputOption=USER_ENTERED` when `options.formulas`, `RAW`
  otherwise. **`ensureSheets` must keep calling it without the flag** so a header row that
  happens to start with `=` or `+` is never evaluated.

`infrastructure/google/mocks/mock-clients.ts` + `mock-backend.ts`:

- The mock `updateRange` stores cell strings as-is.
- The mock `getValues` with `unformatted: true` evaluates any cell matching
  `/^=GOOGLEFINANCE\(/i` through a deterministic fake:

```ts
/** Deterministic pseudo-price so demo mode moves without Math.random(). */
export function mockPriceFor(ticker: string, isoDate: string): number {
  const base = 20 + (hash(ticker) % 480);          // $20 .. $500
  const wiggle = ((hash(ticker + isoDate) % 2001) - 1000) / 10000; // +/-10%
  return Math.round(base * (1 + wiggle) * 100) / 100;
}
```

`hash` is a small deterministic string hash (FNV-1a is fine) defined in `mock-backend.ts`.
No `Math.random`, no `Date.now` inside the hash — the date is passed in.

### 7.3 Quote service

`infrastructure/market/quote-service.ts` — new directory, application/infrastructure layer.

```ts
export const QUOTE_SHEET = "__quotes";

export interface QuoteRow {
  ticker: string;
  /** null when the cell errored or was blank. */
  priceCents: MoneyCents | null;
  name: string;
  currency: string;
}

/**
 * Write one row per ticker into __quotes: column A the symbol, column B a
 * GOOGLEFINANCE price formula, C name, D currency, E a write timestamp.
 * Rewrites the whole block so removed tickers disappear.
 */
export async function writeQuoteTickers(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  now: string,
): Promise<void>;

/** Read back the computed block. Never throws on a bad cell — that ticker
 *  simply comes back with priceCents null. */
export async function readQuoteRows(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<QuoteRow[]>;

export interface RefreshResult {
  requested: number;
  written: number;
  skippedSameDay: number;
  failed: string[];   // tickers with no usable price
}

/**
 * Full round trip: write the ticker block, read it back, and persist one
 * price_quote per ticker for `today` via applyCommand. Tickers that already
 * have a quote for `today` are skipped (D8).
 */
export async function refreshQuotes(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  today: string,
): Promise<RefreshResult>;
```

Parsing rules in `readQuoteRows`:

- Trim the cell. Empty ⇒ null.
- Starts with `#` (`#N/A`, `#ERROR!`) ⇒ null.
- Strip `$`, spaces and thousands separators, then `Number(...)`. Not finite or negative
  ⇒ null. Otherwise `Math.round(value * 100)`.

`refreshQuotes` writes through `createEntity<PriceQuote>("price_quote", {...})` so quotes
flow into the audit log and the sync queue like everything else.

### 7.4 Price reads for the UI

`lib/queries/market-data.ts`:

```ts
export interface LatestPrices {
  prices: PriceMap;
  /** ticker -> quoteDate of the price used. */
  asOf: Record<string, string>;
}

/** Latest price_quote per ticker, from the already-loaded context. */
export function selectLatestPrices(context: FinancialContext): LatestPrices;

/** Thin hook over useFinancialContext for components. */
export function useLatestPrices(): LatestPrices;
```

`selectLatestPrices` is a pure selector so it can be unit-tested without React.

The "Refresh prices" button on `/portfolio`:

1. Collects distinct non-empty tickers from non-deleted holdings.
2. Requires a workbook; in demo mode the mock workbook is always present.
3. Calls `refreshQuotes(clients, workbookId, tickers, today)`, where `today` is a
   `"YYYY-MM-DD"` string. `infrastructure/dates/date-utils.ts` exposes `nowIso()` (a full
   timestamp); add `todayIsoDate()` there for the date-only form and use it everywhere a
   calendar day is needed (marks, lots, quotes).
4. Invalidates the financial-data query.
5. Toasts the result: written / skipped / failed counts. Failed tickers are named.

Refresh is manual only. A static PWA has no scheduler, and pretending otherwise would
be a lie in the UI.

### 7.5 Manual price fallback

Always built, regardless of the spike outcome. On `/portfolio`, a position row with no
price offers "Set price", which writes a `price_quote` with `source: "manual"` for today.
This is the plan-B path and also covers tickers Google does not cover (D7 rationale).

---

## 8. i18n

New namespaces in **both** `lib/i18n/messages/en-US/` and `lib/i18n/messages/pt-BR/`:

- `portfolio.json` — portfolio screen, positions table, allocation, lots, refresh flow,
  price-missing states, errors.
- `observations.json` — mark dialog, history chart, freshness banner and levels.

Extended existing namespaces (both locales):

- `entities.json` — `observation.*`, `holding.*`, `lot.*` singular/plural, plus the enum
  groups `assetClass.*`, `lotStatus.*`, `observationSubjectType.*`, `quoteSource.*`.
- `forms.json` — a label key per new field, and the new column labels
  (`columns.ticker`, `columns.shares`, `columns.costBasis`, `columns.marketValue`,
  `columns.gain`, `columns.weight`, `columns.tradeDate`, `columns.lastMarked`).
- `nav.json` — `portfolio`, `observations`.
- `dataStudio.json` — `modules.holding.description`, `modules.lot.description`,
  `modules.observation.description`.

Per `CLAUDE.md`: engine-generated text stays English. The freshness *levels* are UI labels
and therefore **are** translated; the engine returns the `FreshnessLevel` token only.

---

## 9. Testing

Vitest with `fake-indexeddb`, matching the existing style in `test/unit/engines/`.

### Unit — domain (pure, no mocks)

| File | Covers |
| --- | --- |
| `test/unit/value-objects/shares.test.ts` | round-trip micros, rounding, `formatShares` trimming, `sharesValueCents` rounding at the half cent, zero-share guard in `costPerShareCents`. |
| `test/unit/engines/portfolio-engine.test.ts` | positions from multiple lots; closed lots excluded; holding with no lots yields zeros; missing price sets `hasPrice: false` and `marketValueCents: 0`; weights sum to 10000 bps; `accountValueCents` falls back to `currentBalanceCents` with no holdings and to cost basis with no price; `allocationDrift` only returns targeted holdings. |
| `test/unit/engines/lot-engine.test.ts` | `longTermOn` = trade date + 1 year + 1 day; a lot bought 2025-03-14 is **not** long-term on 2026-03-14 and **is** on 2026-03-15; leap-year case (2024-02-29); `daysToLongTerm` hits 0 exactly on the boundary; `lotsAtALoss` ordering. |
| `test/unit/engines/return-engine.test.ts` | `xirr` on a known series (one −10000 flow, one +11000 flow a year later ⇒ ≈0.10); returns null on <2 flows, on all-same-sign flows, and on a non-converging series; `moneyWeightedReturnBps` on a two-lot portfolio. |
| `test/unit/engines/net-worth-history.test.ts` | empty observations ⇒ `[]`; carry-forward across a gap month; `coverageBps` rises as subjects get marked; liabilities subtract; a backdated observation lands in the right bucket. |
| `test/unit/engines/data-freshness.test.ts` | never-observed ⇒ stale with `ageDays: null`; threshold boundaries at exactly 45 and 180 days; `planConfidenceBps` = 10000 on an empty list, 5000 when every subject is aging. |

### Unit — infrastructure

| File | Covers |
| --- | --- |
| `test/unit/sheet-mapper.test.ts` (extend) | `entityToRow` / `rowToEntity` round-trip for all four new entity types, including `closeDate: null` and a `note` containing a comma. |
| `test/unit/quote-service.test.ts` | `readQuoteRows` parsing: plain number, `$512.40`, `#N/A`, `#ERROR!`, blank, negative, thousands separator. `refreshQuotes` against a fake `SheetsClient`: writes N quotes, skips a ticker that already has today's quote, reports failures. Uses `createTestDb` and a stub clients object — no Google, no network. |
| `test/unit/market-data.test.ts` | `selectLatestPrices` picks the newest `quoteDate` per ticker and ignores soft-deleted quotes. |

### Integration

`test/integration/portfolio-flow.test.ts` — create a holding and a lot through
`applyCommand`, assert the entity, the `CommandRecord` and the `SyncQueueItem` all landed in
one transaction, then push through the sync engine against the mock clients and assert the
rows appear in the `holdings` and `lots` tabs. Mirrors `test/integration/sync-flow.test.ts`.

### Regression guard

`net-worth-engine.test.ts`, `fire-engine.test.ts`, `retirement-engine.test.ts` and
`scenario-engine.test.ts` must pass **unchanged**. If a context-shape change breaks them, the
fix belongs in `fixtures.ts`, not in the test bodies. This is the check that D1 and §6.5 held.

---

## 10. Rollout and compatibility

- **Existing workbooks.** `initWorkbook` calls `ensureSheets` on every start and creates
  missing tabs idempotently. Users get the four new tabs plus `__quotes` on next load. No
  data transform.
- **Existing local data.** No entity changes shape. New arrays default to empty. A user who
  never opens `/portfolio` sees exactly today's behaviour.
- **Demo mode.** Fully supported. The mock Google client fakes `GOOGLEFINANCE`
  deterministically (§7.2), so the whole round trip is demonstrable offline.
- **Seed data.** `lib/seed` gains one investment account with two holdings (VOO, BND), three
  lots, six months of monthly observations for the brokerage and one property, and one
  `price_quote` per ticker — enough for every new screen to look alive on first run.

---

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| `GOOGLEFINANCE` unreadable through the API | Spike gates §7.2 (§7.1). Manual price entry and the `PriceMap` boundary (D6) mean F1 and F2 ship regardless. |
| Sheets rate limits on the `__quotes` tab | One row per distinct ticker, one write and one read per manual refresh. A ten-ticker portfolio is two API calls. |
| `USER_ENTERED` evaluating something we did not intend | The flag is opt-in per call and used only by `writeQuoteTickers`. `ensureSheets` and the sync engine keep `RAW`. |
| Float creep in share math | All persisted share values are integer micros; only `formatShares` and the input control touch decimals. Covered by `shares.test.ts`. |
| Net-worth engine regression | `prices` is an optional parameter defaulting to `{}`; existing tests must pass unchanged (§9). |
| Observation history looks wrong when sparse | Coverage is a first-class field on every history point and is rendered, not hidden (D2). |
| Scope creep into F4–F6 | The non-goals in §1 are binding. Anything touching buckets, cadence, tax brackets or AI is a different spec. |

---

## 12. Deferred (named, so they are not forgotten)

Time-weighted return · realized gain/loss and Schedule-D style reporting · wash-sale
detection across accounts · dividends and DRIP lots · automatic partial-lot splitting on
sale · rebalancing trade suggestions · scheduled/background price refresh · historical price
backfill · multi-currency holdings and USD/BRL marks · observations on holdings ·
lot-selection optimizer for tax-loss harvesting.

---

## 13. Open items for the implementer

None blocking. Two judgement calls, already defaulted:

1. **Nav placement.** `/portfolio` goes next to `/investments`; `/observations` goes at the
   end of the Data section. Change if the nav grows crowded.
2. **History granularity.** Monthly only in v1. `HistoryOptions.granularity` exists so a
   `"quarter"` option can be added without a signature change.
