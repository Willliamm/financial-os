# F2 + F3 — Portfolio Lots and Market Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track what you actually own — "12 shares of VOO bought on 2026-03-14 for $6,148.80" — with cost basis, unrealized gain, holding period and money-weighted return, and refresh share prices from the user's own Google Sheet with no backend and no API key.

**Architecture:** Three new entities (`holding`, `lot`, `price_quote`) flow through the existing command + Sheets sync pipeline. Four pure engines compute positions, lot views, returns and allocation; they receive prices as a plain `PriceMap` parameter and never fetch anything. A quote service writes `GOOGLEFINANCE` formulas into a technical `__quotes` tab and reads the computed values back, persisting each read as a `price_quote` so the app accumulates its own price history.

**Tech Stack:** Next.js 15 (static export) · React 19 · TypeScript strict · Zod · Dexie · TanStack Query · date-fns · Apache ECharts (lazy) · react-i18next · Vitest + fake-indexeddb.

**Source spec:** `docs/superpowers/specs/2026-07-24-portfolio-observations-quotes-design.md` §6 (F2) and §7 (F3). F1 (Observations) is already merged; this plan builds on it.

**The spike already passed.** §7.1 of the spec records the result from 2026-07-26, run against a throwaway spreadsheet. Three findings bind this plan:

- `UNFORMATTED_VALUE` returns a real JSON **number** (`679.14`), not a string.
- `valueInputOption=USER_ENTERED` is **required**: a control row written with `RAW` came back as the literal formula text.
- An unknown ticker returns a string starting with `#N/A`.

Historical data also proved readable when wrapped in `INDEX`, but that was a single observation and this plan does **not** build on it. Current price is all F3 needs.

## Global Constraints

- Money is **integer US cents**. Percentages and ratios are **integer basis points** (10000 = 100%). Shares are **integer millionths of a share** (`SHARE_SCALE = 1_000_000`). No floats for persisted values, ever.
- Every mutation goes through `applyCommand` (`infrastructure/db/command-service.ts`), usually via `useEntityActions()` in the UI.
- Local Dexie write always precedes any Google Sheets sync.
- `domain/` imports **no** React, Dexie, Google, or `features/`. It may import `infrastructure/money`, `infrastructure/dates` and `domain/value-objects` — existing engines already do.
- Engines take **no clock**. Any "today" is a `"YYYY-MM-DD"` parameter supplied by the caller.
- Engines never fetch prices. They receive a `PriceMap`; a missing ticker means "no price", never a guess.
- Dates are calendar dates `"YYYY-MM-DD"`. The `dateOnly` Zod helper in `domain/schemas/index.ts` already validates real calendar dates — reuse it, do not loosen it.
- Static export: no API routes, middleware, server actions, or `[id]` routes.
- i18n keys go into **both** `lib/i18n/messages/en-US/` and `lib/i18n/messages/pt-BR/`.
- Verify loop: `npm run typecheck && npm run test && npm run lint`. **Do not run `npm run build` while `npm run dev` is running.**
- The suite is at **107 passing tests**. It must never go down.

---

### Task 1: Shares value object

Integer share quantities, mirroring how `basis-points.ts` handles percentages.

**Files:**
- Create: `domain/value-objects/shares.ts`
- Test: `test/unit/value-objects/shares.test.ts`

**Interfaces:**
- Consumes: `MoneyCents` from `@/infrastructure/money/money`.
- Produces, from `@/domain/value-objects/shares`:
  - `type ShareMicros = number`
  - `const SHARE_SCALE = 1_000_000`
  - `sharesToMicros(shares: number): ShareMicros`
  - `microsToShares(micros: ShareMicros): number`
  - `formatShares(micros: ShareMicros, options?: { maxDecimals?: number }): string`
  - `sharesValueCents(micros: ShareMicros, pricePerShareCents: MoneyCents): MoneyCents`
  - `costPerShareCents(totalCents: MoneyCents, micros: ShareMicros): MoneyCents`
  - `parseSharesToMicros(input: string): ShareMicros`

- [ ] **Step 1: Write the failing test**

Create `test/unit/value-objects/shares.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SHARE_SCALE,
  costPerShareCents,
  formatShares,
  microsToShares,
  parseSharesToMicros,
  sharesToMicros,
  sharesValueCents,
} from "@/domain/value-objects/shares";

describe("shares conversion", () => {
  it("round-trips whole and fractional shares", () => {
    expect(sharesToMicros(12)).toBe(12_000_000);
    expect(sharesToMicros(12.5)).toBe(12_500_000);
    expect(sharesToMicros(0.000001)).toBe(1);
    expect(microsToShares(12_500_000)).toBe(12.5);
    expect(SHARE_SCALE).toBe(1_000_000);
  });

  it("rounds beyond six decimals rather than truncating", () => {
    expect(sharesToMicros(1.00000049)).toBe(1_000_000);
    expect(sharesToMicros(1.00000051)).toBe(1_000_001);
  });

  it("treats non-finite input as zero", () => {
    expect(sharesToMicros(Number.NaN)).toBe(0);
    expect(sharesToMicros(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatShares", () => {
  it("trims trailing zeros", () => {
    expect(formatShares(12_000_000)).toBe("12");
    expect(formatShares(12_500_000)).toBe("12.5");
    expect(formatShares(12_345_600)).toBe("12.3456");
  });

  it("honors maxDecimals", () => {
    expect(formatShares(12_345_600, { maxDecimals: 2 })).toBe("12.35");
    expect(formatShares(0)).toBe("0");
  });
});

describe("sharesValueCents", () => {
  it("multiplies shares by a per-share cent price and rounds to the cent", () => {
    // 12 shares at $512.40
    expect(sharesValueCents(12_000_000, 51_240)).toBe(614_880);
    // 0.5 share at $10.01 => 500.5 cents => rounds to 501
    expect(sharesValueCents(500_000, 1_001)).toBe(501);
  });

  it("is zero when either side is zero", () => {
    expect(sharesValueCents(0, 51_240)).toBe(0);
    expect(sharesValueCents(12_000_000, 0)).toBe(0);
  });
});

describe("costPerShareCents", () => {
  it("derives a per-share cost", () => {
    expect(costPerShareCents(614_880, 12_000_000)).toBe(51_240);
  });

  it("guards against division by zero", () => {
    expect(costPerShareCents(614_880, 0)).toBe(0);
  });
});

describe("parseSharesToMicros", () => {
  it("parses user text", () => {
    expect(parseSharesToMicros("12.5")).toBe(12_500_000);
    expect(parseSharesToMicros("1,000.25")).toBe(1_000_250_000);
    expect(parseSharesToMicros("")).toBe(0);
    expect(parseSharesToMicros("abc")).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/value-objects/shares.test.ts`
Expected: FAIL — cannot resolve `@/domain/value-objects/shares`.

- [ ] **Step 3: Implement the value object**

Create `domain/value-objects/shares.ts`:

```ts
/**
 * Share quantity utilities.
 *
 * Share counts are stored as integer millionths of a share. 1 share =
 * 1_000_000 micros. Fractional shares are real — brokerages sell them — and
 * floating point is not an option for persisted values, so this mirrors the
 * discipline already used for cents and basis points.
 */

import type { MoneyCents } from "@/infrastructure/money/money";

export type ShareMicros = number;

export const SHARE_SCALE = 1_000_000;

/** Convert a share count to integer micros. 12.5 -> 12_500_000 */
export function sharesToMicros(shares: number): ShareMicros {
  if (!Number.isFinite(shares)) return 0;
  return Math.round(shares * SHARE_SCALE);
}

/** Convert integer micros back to a share count. 12_500_000 -> 12.5 */
export function microsToShares(micros: ShareMicros): number {
  return micros / SHARE_SCALE;
}

/**
 * Format a share count for display, trimming trailing zeros.
 * 12_000_000 -> "12", 12_500_000 -> "12.5"
 */
export function formatShares(
  micros: ShareMicros,
  options: { maxDecimals?: number } = {},
): string {
  const maxDecimals = options.maxDecimals ?? 6;
  const fixed = microsToShares(micros).toFixed(maxDecimals);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** shares x price-per-share, rounded to the nearest cent. */
export function sharesValueCents(
  micros: ShareMicros,
  pricePerShareCents: MoneyCents,
): MoneyCents {
  return Math.round((micros * pricePerShareCents) / SHARE_SCALE);
}

/** Derived per-share cost, for display only. 0 when there are no shares. */
export function costPerShareCents(
  totalCents: MoneyCents,
  micros: ShareMicros,
): MoneyCents {
  if (micros === 0) return 0;
  return Math.round((totalCents * SHARE_SCALE) / micros);
}

/** Parse a user-entered share count ("1,000.25") into integer micros. */
export function parseSharesToMicros(input: string): ShareMicros {
  if (typeof input !== "string") return 0;
  const cleaned = input.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return sharesToMicros(value);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/unit/value-objects/shares.test.ts`
Expected: PASS, 10 cases.

- [ ] **Step 5: Commit**

```bash
git add domain/value-objects/shares.ts test/unit/value-objects/shares.test.ts
git commit -m "feat(shares): add integer share-quantity value object"
```

---

### Task 2: Holding, Lot and PriceQuote entities

Three entities end to end: types, schemas, sheet columns, repositories, context, schema version 5.

**Files:**
- Modify: `domain/entities/base.ts`
- Modify: `domain/entities/index.ts`
- Modify: `domain/commands/index.ts`
- Modify: `domain/schemas/index.ts`
- Modify: `domain/context.ts`
- Modify: `infrastructure/sync/sheet-schema.ts`
- Modify: `infrastructure/sync/workbook-manager.ts`
- Modify: `infrastructure/sync/migrations/index.ts`
- Modify: `infrastructure/db/repositories/index.ts`
- Modify: `lib/constants.ts`
- Modify: `test/unit/engines/fixtures.ts`
- Test: `test/unit/sheet-mapper.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - From `@/domain/entities`: `Holding`, `Lot`, `PriceQuote`, `AssetClass`, `LotStatus`, `QuoteSource`
  - From `@/domain/schemas`: `holdingSchema`, `lotSchema`, `priceQuoteSchema`, `assetClassSchema`
  - `FinancialContext.holdings`, `.lots`, `.priceQuotes`
  - `repositories.holding`, `.lot`, `.price_quote`
  - From `test/unit/engines/fixtures`: `makeHolding`, `makeLot`, `makeQuote`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/sheet-mapper.test.ts` (extend the existing type import with `Holding`, `Lot`, `PriceQuote`):

```ts
describe("portfolio entities round-trip", () => {
  it("round-trips a Holding", () => {
    const holding: Holding = {
      id: "hold-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      accountId: "acct-1",
      ticker: "VOO",
      name: "Vanguard S&P 500 ETF",
      assetClass: "us_equity",
      targetAllocationBps: 4000,
    };
    const parsed = rowToEntity(
      "holding",
      headersFor("holding"),
      entityToRow("holding", holding),
    ) as Holding | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.ticker).toBe("VOO");
    expect(parsed?.assetClass).toBe("us_equity");
    expect(parsed?.targetAllocationBps).toBe(4000);
  });

  it("round-trips an open Lot with a null close date", () => {
    const lot: Lot = {
      id: "lot-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      holdingId: "hold-1",
      tradeDate: "2026-03-14",
      sharesMicro: 12_000_000,
      costTotalCents: 614_880,
      feesCents: 0,
      status: "open",
      closeDate: null,
      proceedsCents: 0,
      note: "Initial buy, DCA",
    };
    const parsed = rowToEntity(
      "lot",
      headersFor("lot"),
      entityToRow("lot", lot),
    ) as Lot | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.sharesMicro).toBe(12_000_000);
    expect(parsed?.costTotalCents).toBe(614_880);
    expect(parsed?.tradeDate).toBe("2026-03-14");
    expect(parsed?.status).toBe("open");
    expect(parsed?.closeDate).toBeNull();
    expect(parsed?.note).toBe("Initial buy, DCA");
  });

  it("round-trips a PriceQuote", () => {
    const quote: PriceQuote = {
      id: "q-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      ticker: "VOO",
      quoteDate: "2026-07-26",
      priceCents: 67_914,
      source: "googlefinance",
    };
    const parsed = rowToEntity(
      "price_quote",
      headersFor("price_quote"),
      entityToRow("price_quote", quote),
    ) as PriceQuote | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.priceCents).toBe(67_914);
    expect(parsed?.source).toBe("googlefinance");
  });

  it("drops a Lot row whose trade date is not a real calendar date", () => {
    const headers = headersFor("lot");
    const cols = headers.map(() => "");
    cols[headers.indexOf("id")] = "lot-bad";
    cols[headers.indexOf("version")] = "0";
    cols[headers.indexOf("created_at")] = TS;
    cols[headers.indexOf("updated_at")] = TS;
    cols[headers.indexOf("holding_id")] = "hold-1";
    cols[headers.indexOf("trade_date")] = "03/14/2026";
    cols[headers.indexOf("shares_micro")] = "12000000";
    cols[headers.indexOf("cost_total_cents")] = "614880";
    expect(rowToEntity("lot", headers, cols)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/sheet-mapper.test.ts`
Expected: FAIL — `Holding`, `Lot`, `PriceQuote` do not resolve.

- [ ] **Step 3: Add entity types**

In `domain/entities/base.ts`, extend `EntityType` and both maps:

```ts
  | "observation"
  | "holding"
  | "lot"
  | "price_quote";
```

`ENTITY_SHEET` gains `holding: "holdings"`, `lot: "lots"`, `price_quote: "price_quotes"`.
`ENTITY_LOCK_TYPE` gains `holding: "holding"`, `lot: "lot"`, `price_quote: "price_quote"`.

- [ ] **Step 4: Add command types**

In `domain/commands/index.ts`, add nine `CommandType` members (`CreateHolding` / `UpdateHolding` / `DeleteHolding`, and the same triple for `Lot` and `PriceQuote`), and to `ENTITY_PASCAL`:

```ts
  holding: "Holding",
  lot: "Lot",
  price_quote: "PriceQuote",
```

- [ ] **Step 5: Add the interfaces**

In `domain/entities/index.ts`, add before the `AnyEntity` union:

```ts
export type AssetClass =
  | "us_equity"
  | "intl_equity"
  | "bond"
  | "reit"
  | "cash"
  | "crypto"
  | "other";

/** A position: one instrument held inside one investment account. */
export interface Holding extends BaseEntity {
  accountId: string;
  /** Uppercase symbol, e.g. "VOO". Empty for an unquoted holding. */
  ticker: string;
  name: string;
  assetClass: AssetClass;
  /** Target weight in the portfolio, in bps. 0 means "no target set". */
  targetAllocationBps: number;
}

export type LotStatus = "open" | "closed";

/**
 * One purchase. Cost is stored as the TOTAL paid, never a per-share price:
 * $512.4013 x 12 shares cannot round-trip through an integer per-share cent
 * value, and the total is what the brokerage statement and the IRS both use.
 */
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
  /** "YYYY-MM-DD". At most one quote per ticker per day. */
  quoteDate: string;
  /**
   * Price per share in integer cents, rounded. Max error is half a cent per
   * share — about 0.001% on a 10,000-share position, against a feed that is
   * itself ~20 minutes delayed. Sub-cent precision here would be false.
   */
  priceCents: number;
  source: QuoteSource;
}
```

Add `| Holding | Lot | PriceQuote` to `AnyEntity`.

- [ ] **Step 6: Add the Zod schemas**

In `domain/schemas/index.ts`, reusing the existing `dateOnly`, `idString`, `cents`, `nonNegCents`, `rateBps` helpers:

```ts
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
  closeDate: dateOnly.nullable().default(null),
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

Register all three in `ENTITY_SCHEMAS`.

- [ ] **Step 7: Add sheet columns**

In `infrastructure/sync/sheet-schema.ts`, add to `SHEET_COLUMNS`:

```ts
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

Add the scratch tab to `TECHNICAL_SHEETS`:

```ts
  __quotes: ["ticker", "price", "name", "currency", "updated_at"],
```

In `infrastructure/sync/workbook-manager.ts`, add to `DOMAIN_SHEET_NAMES`:

```ts
  holding: "holdings",
  lot: "lots",
  price_quote: "price_quotes",
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run test/unit/sheet-mapper.test.ts`
Expected: PASS, all cases including the invalid-date drop.

- [ ] **Step 9: Wire repositories and context**

In `infrastructure/db/repositories/index.ts`: import the three types, add three `EntityRepository` instances, append three `.list()` calls to the `Promise.all` in `loadFinancialContext`, destructure them as `holdings`, `lots`, `priceQuotes`, and add them to the returned object.

In `domain/context.ts`: import the types, add `holdings: Holding[];`, `lots: Lot[];`, `priceQuotes: PriceQuote[];` to `FinancialContext`, and `holdings: []`, `lots: []`, `priceQuotes: []` to `emptyContext()`.

- [ ] **Step 10: Bump the schema version**

`lib/constants.ts`: `APP_SCHEMA_VERSION = 5`.

`infrastructure/sync/migrations/index.ts`, append to `MIGRATIONS`:

```ts
  {
    version: 5,
    name: "add holdings, lots, price_quotes",
    async up() {
      // No data transform. initWorkbook -> ensureSheets creates the new tabs
      // (and the __quotes scratch tab) idempotently from SHEET_COLUMNS and
      // TECHNICAL_SHEETS. This entry exists so the workbook stamps version 5.
    },
  },
```

- [ ] **Step 11: Add fixture builders**

In `test/unit/engines/fixtures.ts`, import the three types and append:

```ts
export function makeHolding(over: Partial<Holding> = {}): Holding {
  return {
    id: nextId("hold"),
    ...base(),
    accountId: "acct-1",
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    assetClass: "us_equity",
    targetAllocationBps: 0,
    ...over,
  };
}

export function makeLot(over: Partial<Lot> = {}): Lot {
  return {
    id: nextId("lot"),
    ...base(),
    holdingId: "hold-1",
    tradeDate: "2026-01-15",
    sharesMicro: 10_000_000,
    costTotalCents: 500_000,
    feesCents: 0,
    status: "open",
    closeDate: null,
    proceedsCents: 0,
    note: "",
    ...over,
  };
}

export function makeQuote(over: Partial<PriceQuote> = {}): PriceQuote {
  return {
    id: nextId("q"),
    ...base(),
    ticker: "VOO",
    quoteDate: "2026-07-26",
    priceCents: 67_914,
    source: "googlefinance",
    ...over,
  };
}
```

- [ ] **Step 12: Run the full suite**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; 107 existing + 4 new pass.

- [ ] **Step 13: Commit**

```bash
git add domain infrastructure lib/constants.ts test
git commit -m "feat(portfolio): add holding, lot and price_quote entities"
```

---

### Task 3: Portfolio engine

Positions from open lots, allocation, drift, and the account valuation the net-worth engine will use.

**Files:**
- Create: `domain/engines/portfolio/portfolio-engine.ts`
- Modify: `domain/engines/index.ts`
- Test: `test/unit/engines/portfolio-engine.test.ts`

**Interfaces:**
- Consumes: `Holding`, `Lot`, `AssetClass`, `InvestmentAccount` (Task 2); `sharesValueCents` (Task 1).
- Produces, from `@/domain/engines`:
  - `type PriceMap = Record<string, MoneyCents>`
  - `interface Position { holdingId, accountId, ticker, name, assetClass, sharesMicro, costBasisCents, marketValueCents, unrealizedGainCents, simpleReturnBps, weightBps, hasPrice, lotCount }`
  - `buildPositions(context, prices): Position[]`
  - `portfolioValueCents(positions)`, `portfolioCostBasisCents(positions)`, `portfolioUnrealizedGainCents(positions)`
  - `interface AllocationSlice { assetClass, valueCents, weightBps }`, `allocationByAssetClass(positions)`
  - `interface AllocationDrift { holdingId, ticker, targetBps, actualBps, driftBps }`, `allocationDrift(context, positions)`
  - `accountValueCents(account, positions): MoneyCents`

- [ ] **Step 1: Write the failing test**

Create `test/unit/engines/portfolio-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  accountValueCents,
  allocationByAssetClass,
  allocationDrift,
  buildPositions,
  portfolioCostBasisCents,
  portfolioUnrealizedGainCents,
  portfolioValueCents,
} from "@/domain/engines/portfolio/portfolio-engine";
import { makeContext, makeHolding, makeInvestment, makeLot } from "./fixtures";

const PRICES = { VOO: 60_000, BND: 7_000 };

function twoLotContext() {
  const account = makeInvestment({ id: "acct-1", currentBalanceCents: 1 });
  const holding = makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" });
  return makeContext({
    investmentAccounts: [account],
    holdings: [holding],
    lots: [
      makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 500 }),
      makeLot({ holdingId: "h-voo", sharesMicro: 5_000_000, costTotalCents: 275_000, feesCents: 0 }),
    ],
  });
}

describe("buildPositions", () => {
  it("aggregates open lots into one position", () => {
    const [p] = buildPositions(twoLotContext(), PRICES);
    expect(p.sharesMicro).toBe(15_000_000);
    expect(p.costBasisCents).toBe(500_000 + 500 + 275_000); // fees included
    expect(p.marketValueCents).toBe(900_000); // 15 shares x $600
    expect(p.unrealizedGainCents).toBe(900_000 - 775_500);
    expect(p.hasPrice).toBe(true);
    expect(p.lotCount).toBe(2);
  });

  it("excludes closed and soft-deleted lots", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [
        makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000 }),
        makeLot({ holdingId: "h-voo", sharesMicro: 99_000_000, costTotalCents: 999_000, status: "closed" }),
        makeLot({ holdingId: "h-voo", sharesMicro: 77_000_000, costTotalCents: 777_000, deletedAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.sharesMicro).toBe(10_000_000);
    expect(p.lotCount).toBe(1);
  });

  it("keeps a holding with no lots visible, at zero", () => {
    const ctx = makeContext({ holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })], lots: [] });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.sharesMicro).toBe(0);
    expect(p.costBasisCents).toBe(0);
    expect(p.marketValueCents).toBe(0);
    expect(p.lotCount).toBe(0);
  });

  it("reports a missing price rather than guessing", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 100_000 })],
    });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.hasPrice).toBe(false);
    expect(p.marketValueCents).toBe(0);
    expect(p.unrealizedGainCents).toBe(0);
    expect(p.simpleReturnBps).toBe(0);
  });

  it("computes simple return in bps", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    // 10 shares at $600 = $6,000 vs $5,000 basis => +20% => 2000 bps
    expect(buildPositions(ctx, PRICES)[0].simpleReturnBps).toBe(2000);
  });
});

describe("portfolio totals and allocation", () => {
  const ctx = makeContext({
    holdings: [
      makeHolding({ id: "h-voo", ticker: "VOO", assetClass: "us_equity", targetAllocationBps: 6000 }),
      makeHolding({ id: "h-bnd", ticker: "BND", assetClass: "bond", targetAllocationBps: 4000 }),
    ],
    lots: [
      makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 }),
      makeLot({ holdingId: "h-bnd", sharesMicro: 10_000_000, costTotalCents: 60_000, feesCents: 0 }),
    ],
  });
  const positions = buildPositions(ctx, PRICES);

  it("sums value, basis and gain", () => {
    expect(portfolioValueCents(positions)).toBe(600_000 + 70_000);
    expect(portfolioCostBasisCents(positions)).toBe(560_000);
    expect(portfolioUnrealizedGainCents(positions)).toBe(110_000);
  });

  it("weights allocation by asset class to 10000 bps", () => {
    const slices = allocationByAssetClass(positions);
    const total = slices.reduce((s, x) => s + x.weightBps, 0);
    expect(total).toBe(10_000);
    expect(slices.find((s) => s.assetClass === "us_equity")?.valueCents).toBe(600_000);
  });

  it("gives each position its share of the portfolio in bps", () => {
    // 600000 and 70000 of 670000 => 8955 and 1045
    expect(positions.find((p) => p.ticker === "VOO")?.weightBps).toBe(8955);
    expect(positions.find((p) => p.ticker === "BND")?.weightBps).toBe(1045);
  });

  it("leaves weight at zero when nothing is priced", () => {
    const unpriced = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(buildPositions(unpriced, {})[0].weightBps).toBe(0);
  });

  it("reports drift only for holdings with a target", () => {
    const drift = allocationDrift(ctx, positions);
    expect(drift).toHaveLength(2);
    const voo = drift.find((d) => d.ticker === "VOO")!;
    // 600000 / 670000 = 8955 bps actual vs 6000 target
    expect(voo.actualBps).toBe(8955);
    expect(voo.driftBps).toBe(2955);
  });

  it("returns an empty drift list when no target is set", () => {
    const noTarget = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO", targetAllocationBps: 0 })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(allocationDrift(noTarget, buildPositions(noTarget, PRICES))).toEqual([]);
  });
});

describe("accountValueCents", () => {
  it("uses the account balance when it has no holdings", () => {
    const account = makeInvestment({ id: "acct-none", currentBalanceCents: 4_200_000 });
    const ctx = makeContext({ investmentAccounts: [account] });
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(4_200_000);
  });

  it("uses summed positions when the account has holdings", () => {
    const ctx = twoLotContext();
    const account = ctx.investmentAccounts[0];
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(900_000);
  });

  it("falls back to cost basis for a position with no price", () => {
    const account = makeInvestment({ id: "acct-1", currentBalanceCents: 1 });
    const ctx = makeContext({
      investmentAccounts: [account],
      holdings: [makeHolding({ id: "h-x", accountId: "acct-1", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 123_000, feesCents: 0 })],
    });
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(123_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/engines/portfolio-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the engine**

Create `domain/engines/portfolio/portfolio-engine.ts`:

```ts
/**
 * Portfolio positions, totals and allocation.
 *
 * Pure. Money is integer US cents, shares are integer micros, weights are
 * basis points. Prices arrive as a PriceMap parameter — this engine never
 * fetches anything, and a missing price is reported, never guessed.
 */

import type { FinancialContext } from "@/domain/context";
import type { AssetClass, InvestmentAccount, Lot } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import {
  sharesValueCents,
  type ShareMicros,
} from "@/domain/value-objects/shares";
import type { MoneyCents } from "@/infrastructure/money/money";

/** ticker -> price per share in integer cents. A missing key means no price. */
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
  /** (market - basis) / basis in bps. 0 without a price or a basis. */
  simpleReturnBps: BasisPoints;
  /** Share of total portfolio market value, in bps. 0 without a price. */
  weightBps: BasisPoints;
  hasPrice: boolean;
  lotCount: number;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function isOpen(lot: Lot): boolean {
  return notDeleted(lot) && lot.status === "open";
}

/** Cost basis of a lot: what was paid, including fees. */
export function lotCostBasisCents(lot: Lot): MoneyCents {
  return lot.costTotalCents + lot.feesCents;
}

export function buildPositions(
  context: FinancialContext,
  prices: PriceMap,
): Position[] {
  const openLots = context.lots.filter(isOpen);

  // Weight needs the portfolio total, which needs every position, so this is
  // deliberately two passes rather than one clever one.
  const draft = context.holdings.filter(notDeleted).map((holding) => {
    const lots = openLots.filter((l) => l.holdingId === holding.id);
    const sharesMicro = lots.reduce((s, l) => s + l.sharesMicro, 0);
    const costBasisCents = lots.reduce((s, l) => s + lotCostBasisCents(l), 0);

    const price = prices[holding.ticker];
    const hasPrice = typeof price === "number" && price > 0;
    const marketValueCents = hasPrice
      ? sharesValueCents(sharesMicro, price)
      : 0;
    const unrealizedGainCents = hasPrice
      ? marketValueCents - costBasisCents
      : 0;
    const simpleReturnBps =
      hasPrice && costBasisCents > 0
        ? Math.round((unrealizedGainCents / costBasisCents) * 10_000)
        : 0;

    return {
      holdingId: holding.id,
      accountId: holding.accountId,
      ticker: holding.ticker,
      name: holding.name,
      assetClass: holding.assetClass,
      sharesMicro,
      costBasisCents,
      marketValueCents,
      unrealizedGainCents,
      simpleReturnBps,
      weightBps: 0,
      hasPrice,
      lotCount: lots.length,
    };
  });

  const total = draft.reduce((s, p) => s + p.marketValueCents, 0);
  if (total <= 0) return draft;
  return draft.map((p) => ({
    ...p,
    weightBps: Math.round((p.marketValueCents / total) * 10_000),
  }));
}

export function portfolioValueCents(positions: Position[]): MoneyCents {
  return positions.reduce((s, p) => s + p.marketValueCents, 0);
}

export function portfolioCostBasisCents(positions: Position[]): MoneyCents {
  return positions.reduce((s, p) => s + p.costBasisCents, 0);
}

export function portfolioUnrealizedGainCents(
  positions: Position[],
): MoneyCents {
  return positions.reduce((s, p) => s + p.unrealizedGainCents, 0);
}

export interface AllocationSlice {
  assetClass: AssetClass;
  valueCents: MoneyCents;
  weightBps: BasisPoints;
}

/**
 * Weights by asset class. The largest slice absorbs any rounding remainder so
 * the weights always sum to exactly 10000 bps — a legend that reads 99.98% is
 * a bug report waiting to happen.
 */
export function allocationByAssetClass(
  positions: Position[],
): AllocationSlice[] {
  const total = portfolioValueCents(positions);
  const byClass = new Map<AssetClass, MoneyCents>();
  for (const p of positions) {
    byClass.set(p.assetClass, (byClass.get(p.assetClass) ?? 0) + p.marketValueCents);
  }

  const slices: AllocationSlice[] = [...byClass.entries()]
    .map(([assetClass, valueCents]) => ({
      assetClass,
      valueCents,
      weightBps: total > 0 ? Math.round((valueCents / total) * 10_000) : 0,
    }))
    .sort((a, b) => b.valueCents - a.valueCents);

  if (total > 0 && slices.length > 0) {
    const sum = slices.reduce((s, x) => s + x.weightBps, 0);
    slices[0].weightBps += 10_000 - sum;
  }
  return slices;
}

export interface AllocationDrift {
  holdingId: string;
  ticker: string;
  targetBps: BasisPoints;
  actualBps: BasisPoints;
  /** actual - target. Negative means underweight. */
  driftBps: BasisPoints;
}

/** Only holdings with a target set are returned, largest absolute drift first. */
export function allocationDrift(
  context: FinancialContext,
  positions: Position[],
): AllocationDrift[] {
  const total = portfolioValueCents(positions);
  const targets = new Map(
    context.holdings
      .filter(notDeleted)
      .filter((h) => h.targetAllocationBps > 0)
      .map((h) => [h.id, h.targetAllocationBps]),
  );

  return positions
    .filter((p) => targets.has(p.holdingId))
    .map((p) => {
      const targetBps = targets.get(p.holdingId) as BasisPoints;
      const actualBps =
        total > 0 ? Math.round((p.marketValueCents / total) * 10_000) : 0;
      return {
        holdingId: p.holdingId,
        ticker: p.ticker,
        targetBps,
        actualBps,
        driftBps: actualBps - targetBps,
      };
    })
    .sort((a, b) => Math.abs(b.driftBps) - Math.abs(a.driftBps));
}

/**
 * Value of an investment account. An account with holdings is worth the sum of
 * its positions; a position without a price contributes its cost basis rather
 * than zero, so the account is never silently understated. An account with no
 * holdings keeps its own manually tracked balance.
 */
export function accountValueCents(
  account: InvestmentAccount,
  positions: Position[],
): MoneyCents {
  const mine = positions.filter((p) => p.accountId === account.id);
  if (mine.length === 0) return account.currentBalanceCents;
  return mine.reduce(
    (s, p) => s + (p.hasPrice ? p.marketValueCents : p.costBasisCents),
    0,
  );
}
```

- [ ] **Step 4: Export from the barrel**

In `domain/engines/index.ts`, append:

```ts
export * from "./portfolio/portfolio-engine";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/unit/engines/portfolio-engine.test.ts`
Expected: PASS, 11 cases.

- [ ] **Step 6: Commit**

```bash
git add domain/engines test/unit/engines/portfolio-engine.test.ts
git commit -m "feat(engines): add portfolio engine with positions and allocation"
```

---

### Task 4: Lot engine and the long-term holding rule

Per-lot views, plus the US holding-period rule that decides when a sale becomes long-term.

**Files:**
- Create: `domain/engines/portfolio/lot-engine.ts`
- Modify: `domain/engines/index.ts`
- Modify: `infrastructure/dates/date-utils.ts`
- Test: `test/unit/engines/lot-engine.test.ts`
- Test: `test/unit/date-utils.test.ts` (extend)

**Interfaces:**
- Consumes: `Lot`, `Holding` (Task 2); `PriceMap`, `lotCostBasisCents` (Task 3); `costPerShareCents`, `sharesValueCents` (Task 1).
- Produces:
  - From `@/infrastructure/dates/date-utils`: `addYearsIso(isoDate: string, years: number): string`
  - From `@/domain/engines`: `interface LotView`, `buildLotViews(context, prices, asOf)`, `lotsAtALoss(views)`, `lotsNearingLongTerm(views, withinDays)`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/date-utils.test.ts`:

```ts
describe("addYearsIso", () => {
  it("adds calendar years", () => {
    expect(addYearsIso("2026-03-14", 1)).toBe("2027-03-14");
    expect(addYearsIso("2026-03-14", -1)).toBe("2025-03-14");
  });

  it("clamps 29 February to 28 February in a non-leap year", () => {
    expect(addYearsIso("2024-02-29", 1)).toBe("2025-02-28");
  });
});
```

Extend that file's import with `addYearsIso`.

Create `test/unit/engines/lot-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildLotViews,
  lotsAtALoss,
  lotsNearingLongTerm,
} from "@/domain/engines/portfolio/lot-engine";
import { makeContext, makeHolding, makeLot } from "./fixtures";

const PRICES = { VOO: 60_000 };

function ctxWith(lots: ReturnType<typeof makeLot>[]) {
  return makeContext({
    holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
    lots,
  });
}

describe("holding period", () => {
  const ctx = ctxWith([
    makeLot({ id: "l1", holdingId: "h-voo", tradeDate: "2025-03-14", sharesMicro: 1_000_000, costTotalCents: 50_000 }),
  ]);

  it("is not long-term exactly one year after the trade date", () => {
    const [v] = buildLotViews(ctx, PRICES, "2026-03-14");
    expect(v.longTermOn).toBe("2026-03-15");
    expect(v.isLongTerm).toBe(false);
    expect(v.daysToLongTerm).toBe(1);
  });

  it("becomes long-term one day later", () => {
    const [v] = buildLotViews(ctx, PRICES, "2026-03-15");
    expect(v.isLongTerm).toBe(true);
    expect(v.daysToLongTerm).toBe(0);
  });

  it("handles a leap-day purchase", () => {
    const leap = ctxWith([
      makeLot({ holdingId: "h-voo", tradeDate: "2024-02-29", sharesMicro: 1_000_000, costTotalCents: 50_000 }),
    ]);
    const [v] = buildLotViews(leap, PRICES, "2025-03-01");
    // 2024-02-29 + 1y clamps to 2025-02-28, so long-term begins 2025-03-01.
    expect(v.longTermOn).toBe("2025-03-01");
    expect(v.isLongTerm).toBe(true);
  });

  it("counts days held from the trade date", () => {
    const [v] = buildLotViews(ctx, PRICES, "2025-04-14");
    expect(v.daysHeld).toBe(31);
  });
});

describe("lot valuation", () => {
  it("values a lot and derives its per-share cost", () => {
    const ctx = ctxWith([
      makeLot({ holdingId: "h-voo", tradeDate: "2026-01-15", sharesMicro: 12_000_000, costTotalCents: 614_880, feesCents: 120 }),
    ]);
    const [v] = buildLotViews(ctx, PRICES, "2026-07-26");
    expect(v.costBasisCents).toBe(615_000);
    expect(v.costPerShareCents).toBe(51_250);
    expect(v.marketValueCents).toBe(720_000);
    expect(v.unrealizedGainCents).toBe(105_000);
    expect(v.hasPrice).toBe(true);
  });

  it("zeroes market value when there is no price", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    const [v] = buildLotViews(ctx, PRICES, "2026-07-26");
    expect(v.hasPrice).toBe(false);
    expect(v.marketValueCents).toBe(0);
    expect(v.unrealizedGainCents).toBe(0);
  });

  it("excludes closed and deleted lots", () => {
    const ctx = ctxWith([
      makeLot({ holdingId: "h-voo", status: "closed" }),
      makeLot({ holdingId: "h-voo", deletedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(buildLotViews(ctx, PRICES, "2026-07-26")).toEqual([]);
  });
});

describe("lot selection helpers", () => {
  const ctx = ctxWith([
    makeLot({ id: "win", holdingId: "h-voo", tradeDate: "2026-01-01", sharesMicro: 1_000_000, costTotalCents: 40_000, feesCents: 0 }),
    makeLot({ id: "small-loss", holdingId: "h-voo", tradeDate: "2026-02-01", sharesMicro: 1_000_000, costTotalCents: 62_000, feesCents: 0 }),
    makeLot({ id: "big-loss", holdingId: "h-voo", tradeDate: "2026-03-01", sharesMicro: 1_000_000, costTotalCents: 90_000, feesCents: 0 }),
  ]);
  const views = buildLotViews(ctx, PRICES, "2026-07-26");

  it("lists losing lots, biggest paper loss first", () => {
    const losers = lotsAtALoss(views);
    expect(losers.map((v) => v.lotId)).toEqual(["big-loss", "small-loss"]);
  });

  it("lists lots approaching long-term, soonest first", () => {
    const soon = lotsNearingLongTerm(views, 200);
    expect(soon[0].lotId).toBe("win");
    expect(soon.every((v) => !v.isLongTerm)).toBe(true);
  });

  it("returns nothing when the window is zero", () => {
    expect(lotsNearingLongTerm(views, 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/engines/lot-engine.test.ts test/unit/date-utils.test.ts`
Expected: FAIL — `addYearsIso` and the lot-engine module do not resolve.

- [ ] **Step 3: Add the date helper**

In `infrastructure/dates/date-utils.ts`, extend the `date-fns` import with `addYears` and append:

```ts
/**
 * Add (or subtract) calendar years to a "YYYY-MM-DD" string. 29 February
 * clamps to 28 February in a non-leap target year, matching date-fns.
 */
export function addYearsIso(isoDate: string, years: number): string {
  const parsed = parseDate(isoDate);
  if (!parsed) return isoDate;
  return format(addYears(parsed, years), DATE_ONLY);
}
```

- [ ] **Step 4: Implement the lot engine**

Create `domain/engines/portfolio/lot-engine.ts`:

```ts
/**
 * Per-lot views: cost basis, market value and holding period.
 *
 * Pure. The caller supplies `asOf`; this engine never reads a clock.
 *
 * Holding period follows the US rule: the clock starts the day AFTER the trade
 * date, and the gain is long-term only when the position has been held for
 * MORE than one year. So a lot bought on 14 Mar 2025 first qualifies on
 * 15 Mar 2026 — not on the 14th. A 365-day counter gets this wrong across leap
 * years, which is why this uses calendar arithmetic.
 */

import type { FinancialContext } from "@/domain/context";
import type { Lot } from "@/domain/entities";
import { costPerShareCents, sharesValueCents, type ShareMicros } from "@/domain/value-objects/shares";
import { addDaysIso, addYearsIso, diffCalendarDays } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";
import { lotCostBasisCents, type PriceMap } from "./portfolio-engine";

export interface LotView {
  lotId: string;
  holdingId: string;
  ticker: string;
  tradeDate: string;
  sharesMicro: ShareMicros;
  costBasisCents: MoneyCents;
  costPerShareCents: MoneyCents;
  marketValueCents: MoneyCents;
  unrealizedGainCents: MoneyCents;
  hasPrice: boolean;
  daysHeld: number;
  /** First date on which a sale would be long-term. */
  longTermOn: string;
  isLongTerm: boolean;
  /** 0 when already long-term. */
  daysToLongTerm: number;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function isOpen(lot: Lot): boolean {
  return notDeleted(lot) && lot.status === "open";
}

export function buildLotViews(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): LotView[] {
  const tickerByHolding = new Map(
    context.holdings.filter(notDeleted).map((h) => [h.id, h.ticker]),
  );

  return context.lots
    .filter(isOpen)
    .filter((l) => tickerByHolding.has(l.holdingId))
    .map((lot) => {
      const ticker = tickerByHolding.get(lot.holdingId) as string;
      const price = prices[ticker];
      const hasPrice = typeof price === "number" && price > 0;
      const costBasisCents = lotCostBasisCents(lot);
      const marketValueCents = hasPrice
        ? sharesValueCents(lot.sharesMicro, price)
        : 0;

      const longTermOn = addDaysIso(addYearsIso(lot.tradeDate, 1), 1);
      const isLongTerm = asOf >= longTermOn;

      return {
        lotId: lot.id,
        holdingId: lot.holdingId,
        ticker,
        tradeDate: lot.tradeDate,
        sharesMicro: lot.sharesMicro,
        costBasisCents,
        costPerShareCents: costPerShareCents(costBasisCents, lot.sharesMicro),
        marketValueCents,
        unrealizedGainCents: hasPrice ? marketValueCents - costBasisCents : 0,
        hasPrice,
        daysHeld: Math.max(0, diffCalendarDays(lot.tradeDate, asOf)),
        longTermOn,
        isLongTerm,
        daysToLongTerm: isLongTerm
          ? 0
          : Math.max(0, diffCalendarDays(asOf, longTermOn)),
      };
    });
}

/** Priced lots currently below cost, biggest paper loss first. */
export function lotsAtALoss(views: LotView[]): LotView[] {
  return views
    .filter((v) => v.hasPrice && v.unrealizedGainCents < 0)
    .sort((a, b) => a.unrealizedGainCents - b.unrealizedGainCents);
}

/** Lots crossing into long-term within `withinDays`, soonest first. */
export function lotsNearingLongTerm(
  views: LotView[],
  withinDays: number,
): LotView[] {
  return views
    .filter((v) => !v.isLongTerm && v.daysToLongTerm <= withinDays)
    .sort((a, b) => a.daysToLongTerm - b.daysToLongTerm);
}
```

- [ ] **Step 5: Export from the barrel**

In `domain/engines/index.ts`, append:

```ts
export * from "./portfolio/lot-engine";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run test/unit/engines/lot-engine.test.ts test/unit/date-utils.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add domain/engines infrastructure/dates test/unit
git commit -m "feat(engines): add lot engine with the US long-term holding rule"
```

---

### Task 5: Return engine (XIRR)

Money-weighted return: what *your* buying decisions earned, not what the fund returned.

**Files:**
- Create: `domain/engines/portfolio/return-engine.ts`
- Modify: `domain/engines/index.ts`
- Test: `test/unit/engines/return-engine.test.ts`

**Interfaces:**
- Consumes: `PriceMap`, `buildPositions`, `portfolioValueCents` (Task 3); `lotCostBasisCents` (Task 3); `diffCalendarDays` (existing).
- Produces, from `@/domain/engines`:
  - `interface CashFlow { date: string; amountCents: MoneyCents }`
  - `xirr(flows: CashFlow[], guess?: number): number | null`
  - `moneyWeightedReturnBps(context, prices, asOf): BasisPoints | null`

- [ ] **Step 1: Write the failing test**

Create `test/unit/engines/return-engine.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { moneyWeightedReturnBps, xirr } from "@/domain/engines/portfolio/return-engine";
import { makeContext, makeHolding, makeLot } from "./fixtures";

describe("xirr", () => {
  it("solves a simple one-year 10% return", () => {
    const r = xirr([
      { date: "2026-01-01", amountCents: -1_000_000 },
      { date: "2027-01-01", amountCents: 1_100_000 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(0.1, 3);
  });

  it("solves a two-contribution series", () => {
    // -1000 at t0, -1000 at 6 months, +2200 at 1 year.
    const r = xirr([
      { date: "2026-01-01", amountCents: -100_000 },
      { date: "2026-07-01", amountCents: -100_000 },
      { date: "2027-01-01", amountCents: 220_000 },
    ]) as number;
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.3);
  });

  it("handles a loss", () => {
    const r = xirr([
      { date: "2026-01-01", amountCents: -1_000_000 },
      { date: "2027-01-01", amountCents: 900_000 },
    ]) as number;
    expect(r).toBeCloseTo(-0.1, 3);
  });

  it("returns null with fewer than two flows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2026-01-01", amountCents: -100 }])).toBeNull();
  });

  it("returns null when every flow shares a sign", () => {
    expect(
      xirr([
        { date: "2026-01-01", amountCents: -100 },
        { date: "2027-01-01", amountCents: -100 },
      ]),
    ).toBeNull();
  });

  it("is order-independent", () => {
    const a = xirr([
      { date: "2027-01-01", amountCents: 1_100_000 },
      { date: "2026-01-01", amountCents: -1_000_000 },
    ]) as number;
    expect(a).toBeCloseTo(0.1, 3);
  });
});

describe("moneyWeightedReturnBps", () => {
  it("annualises a portfolio's return in bps", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [
        makeLot({
          holdingId: "h-voo",
          tradeDate: "2026-01-01",
          sharesMicro: 10_000_000,
          costTotalCents: 500_000,
          feesCents: 0,
        }),
      ],
    });
    // 10 shares now worth $600 each = $6,000 vs $5,000 in, one year on.
    const bps = moneyWeightedReturnBps(ctx, { VOO: 60_000 }, "2027-01-01");
    expect(bps).not.toBeNull();
    expect(bps as number).toBeGreaterThan(1900);
    expect(bps as number).toBeLessThan(2100);
  });

  it("returns null with no open lots", () => {
    const ctx = makeContext({ holdings: [], lots: [] });
    expect(moneyWeightedReturnBps(ctx, {}, "2026-07-26")).toBeNull();
  });

  it("returns null when nothing is priced", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", tradeDate: "2026-01-01", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(moneyWeightedReturnBps(ctx, {}, "2027-01-01")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/engines/return-engine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the engine**

Create `domain/engines/portfolio/return-engine.ts`:

```ts
/**
 * Money-weighted return (XIRR).
 *
 * Pure. This answers "what did MY decisions earn", because it weights each
 * dollar by how long it was invested. It is deliberately different from a
 * time-weighted return, which judges the instrument instead of the investor.
 * Both are useful; only this one is implemented today.
 */

import type { FinancialContext } from "@/domain/context";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { diffCalendarDays } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";
import {
  buildPositions,
  lotCostBasisCents,
  portfolioValueCents,
  type PriceMap,
} from "./portfolio-engine";

export interface CashFlow {
  date: string;
  /** Negative for money put in, positive for money taken out or final value. */
  amountCents: MoneyCents;
}

const DAYS_PER_YEAR = 365;
const MAX_NEWTON_ITERATIONS = 100;
const MAX_BISECTION_ITERATIONS = 200;
const NPV_TOLERANCE = 1e-7;
const RATE_TOLERANCE = 1e-9;

/**
 * Internal rate of return on irregularly spaced flows. Newton-Raphson first,
 * bisection over [-0.99, 10] as a fallback when Newton wanders off.
 * Returns the annual rate as a decimal (0.087 = 8.7%), or null when it cannot
 * converge, when there are fewer than two flows, or when all flows share a sign
 * (no sign change means no root).
 */
export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amountCents > 0)) return null;
  if (!flows.some((f) => f.amountCents < 0)) return null;

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const origin = sorted[0].date;
  const years = sorted.map(
    (f) => diffCalendarDays(origin, f.date) / DAYS_PER_YEAR,
  );
  const amounts = sorted.map((f) => f.amountCents);

  const npv = (rate: number): number => {
    let sum = 0;
    for (let i = 0; i < amounts.length; i++) {
      sum += amounts[i] / Math.pow(1 + rate, years[i]);
    }
    return sum;
  };

  let rate = guess;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    if (rate <= -0.999999) break;
    const value = npv(rate);
    if (!Number.isFinite(value)) break;
    if (Math.abs(value) < NPV_TOLERANCE) return rate;

    let derivative = 0;
    for (let j = 0; j < amounts.length; j++) {
      derivative -= (years[j] * amounts[j]) / Math.pow(1 + rate, years[j] + 1);
    }
    if (derivative === 0 || !Number.isFinite(derivative)) break;

    const next = rate - value / derivative;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < RATE_TOLERANCE) return next;
    rate = next;
  }

  let low = -0.99;
  let high = 10;
  let fLow = npv(low);
  const fHigh = npv(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  if (fLow * fHigh > 0) return null;

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < NPV_TOLERANCE || (high - low) / 2 < RATE_TOLERANCE) {
      return mid;
    }
    if (fLow * fMid <= 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Money-weighted return of the whole portfolio: every open lot's cost is an
 * outflow on its trade date, and the current market value is a single inflow
 * on `asOf`. Returns bps, or null when there is nothing to measure.
 */
export function moneyWeightedReturnBps(
  context: FinancialContext,
  prices: PriceMap,
  asOf: string,
): BasisPoints | null {
  const openLots = context.lots.filter((l) => !l.deletedAt && l.status === "open");
  if (openLots.length === 0) return null;

  const value = portfolioValueCents(buildPositions(context, prices));
  if (value <= 0) return null;

  const flows: CashFlow[] = openLots.map((lot) => ({
    date: lot.tradeDate,
    amountCents: -lotCostBasisCents(lot),
  }));
  flows.push({ date: asOf, amountCents: value });

  const rate = xirr(flows);
  return rate === null ? null : Math.round(rate * 10_000);
}
```

- [ ] **Step 4: Export from the barrel**

In `domain/engines/index.ts`, append:

```ts
export * from "./portfolio/return-engine";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/unit/engines/return-engine.test.ts`
Expected: PASS, 9 cases.

- [ ] **Step 6: Commit**

```bash
git add domain/engines test/unit/engines/return-engine.test.ts
git commit -m "feat(engines): add XIRR and money-weighted portfolio return"
```

---

### Task 6: Net-worth engine reads positions

An account with holdings must be valued from its positions, not from a stale typed balance — without breaking any existing caller.

**Files:**
- Modify: `domain/engines/net-worth/net-worth-engine.ts`
- Test: `test/unit/engines/net-worth-engine.test.ts` (extend)

**Interfaces:**
- Consumes: `accountValueCents`, `buildPositions`, `PriceMap` (Task 3).
- Produces: `totalAssetsCents(context, prices?)`, `netWorthCents(context, prices?)` — both gain an **optional** trailing parameter defaulting to `{}`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/engines/net-worth-engine.test.ts` (extend its imports with `makeHolding`, `makeLot`):

```ts
describe("net worth with portfolio holdings", () => {
  it("is unchanged when no holdings exist", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ currentBalanceCents: 1_000_000 })],
    });
    expect(totalAssetsCents(ctx)).toBe(1_000_000);
    expect(totalAssetsCents(ctx, { VOO: 60_000 })).toBe(1_000_000);
  });

  it("values an account from its positions once it has holdings", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", currentBalanceCents: 1 })],
      holdings: [makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    // 10 shares x $600 = $6,000, replacing the $0.01 typed balance.
    expect(totalAssetsCents(ctx, { VOO: 60_000 })).toBe(600_000);
  });

  it("falls back to cost basis when the price is missing", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", currentBalanceCents: 1 })],
      holdings: [makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    expect(totalAssetsCents(ctx)).toBe(500_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/engines/net-worth-engine.test.ts`
Expected: FAIL — the holdings case returns the typed balance.

- [ ] **Step 3: Thread prices through**

In `domain/engines/net-worth/net-worth-engine.ts`, add the import:

```ts
import {
  accountValueCents,
  buildPositions,
  type PriceMap,
} from "@/domain/engines/portfolio/portfolio-engine";
```

Replace `totalAssetsCents` and `netWorthCents`:

```ts
/**
 * Total assets: property values plus investment-account balances, in cents.
 *
 * `prices` is optional and defaults to empty, so every existing caller keeps
 * its behaviour. An account that has holdings is valued from its positions;
 * without a price those positions fall back to cost basis, so an unpriced
 * portfolio is understated by market movement but never by its whole value.
 */
export function totalAssetsCents(
  context: FinancialContext,
  prices: PriceMap = {},
): MoneyCents {
  const properties = context.properties
    .filter(notDeleted)
    .reduce((sum, p) => sum + p.currentValueCents, 0);
  const positions = buildPositions(context, prices);
  const investments = context.investmentAccounts
    .filter(notDeleted)
    .reduce((sum, a) => sum + accountValueCents(a, positions), 0);
  return properties + investments;
}

/** Net worth = assets - liabilities, in cents. */
export function netWorthCents(
  context: FinancialContext,
  prices: PriceMap = {},
): MoneyCents {
  return totalAssetsCents(context, prices) - totalLiabilitiesCents(context);
}
```

Leave `projectNetWorth` alone — it models future growth from contributions and expected return, and lot-level detail adds nothing there.

- [ ] **Step 4: Run the full suite**

Run: `npm run typecheck && npm run test`
Expected: PASS. The pre-existing net-worth, FIRE, retirement and scenario tests must pass **unchanged** — if one fails, the fix belongs in `fixtures.ts`, never in a test body.

- [ ] **Step 5: Commit**

```bash
git add domain/engines test/unit/engines/net-worth-engine.test.ts
git commit -m "feat(engines): value accounts from portfolio positions when present"
```

---

### Task 7: Sheets client learns formulas and raw values

The two API capabilities the spike proved are required.

**Files:**
- Modify: `infrastructure/google/google-api-types.ts`
- Modify: `infrastructure/google/real-clients.ts`
- Modify: `infrastructure/google/mocks/mock-clients.ts`
- Modify: `infrastructure/google/mocks/mock-backend.ts`
- Test: `test/unit/mock-google-finance.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `getValues(spreadsheetId, range, options?: { unformatted?: boolean })`
  - `updateRange(spreadsheetId, range, values, options?: { formulas?: boolean })`
  - From `@/infrastructure/google/mocks/mock-backend`: `mockPriceFor(ticker: string, isoDate: string): number`

- [ ] **Step 1: Write the failing test**

Create `test/unit/mock-google-finance.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend, mockPriceFor } from "@/infrastructure/google/mocks/mock-backend";

describe("mockPriceFor", () => {
  it("is deterministic for the same ticker and date", () => {
    expect(mockPriceFor("VOO", "2026-07-26")).toBe(mockPriceFor("VOO", "2026-07-26"));
  });

  it("differs across tickers and moves across days", () => {
    expect(mockPriceFor("VOO", "2026-07-26")).not.toBe(mockPriceFor("BND", "2026-07-26"));
    expect(mockPriceFor("VOO", "2026-07-26")).not.toBe(mockPriceFor("VOO", "2026-07-27"));
  });

  it("stays in a plausible range", () => {
    for (const t of ["VOO", "BND", "AAPL", "VTI"]) {
      const p = mockPriceFor(t, "2026-07-26");
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(2000);
    }
  });
});

describe("mock sheets client formula handling", () => {
  beforeEach(() => getMockBackend().resetAll());

  it("evaluates a GOOGLEFINANCE formula only when written with formulas: true", async () => {
    const clients = getGoogleClients();
    await clients.sheets.ensureSheets("mock-ss", [
      { name: "__quotes", headers: ["ticker", "price", "name", "currency", "updated_at"] },
    ]);

    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A2",
      [["VOO", '=GOOGLEFINANCE(A2,"price")']],
      { formulas: true },
    );
    const evaluated = await clients.sheets.getValues("mock-ss", "__quotes!A2:B2", {
      unformatted: true,
    });
    expect(Number(evaluated[0][1])).toBeGreaterThan(0);

    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A3",
      [["BND", '=GOOGLEFINANCE(A3,"price")']],
      // no options => RAW => stored as literal text
    );
    const raw = await clients.sheets.getValues("mock-ss", "__quotes!A3:B3", {
      unformatted: true,
    });
    expect(raw[0][1]).toBe('=GOOGLEFINANCE(A3,"price")');
  });

  it("returns an #N/A string for an unknown ticker", async () => {
    const clients = getGoogleClients();
    await clients.sheets.ensureSheets("mock-ss", [
      { name: "__quotes", headers: ["ticker", "price", "name", "currency", "updated_at"] },
    ]);
    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A2",
      [["ZZZZNOTREAL", '=GOOGLEFINANCE(A2,"price")']],
      { formulas: true },
    );
    const vals = await clients.sheets.getValues("mock-ss", "__quotes!A2:B2", {
      unformatted: true,
    });
    expect(String(vals[0][1])).toMatch(/^#N\/A/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/mock-google-finance.test.ts`
Expected: FAIL — `mockPriceFor` is not exported and the options parameters do not exist.

- [ ] **Step 3: Extend the client interface**

In `infrastructure/google/google-api-types.ts`:

```ts
export interface GetValuesOptions {
  /**
   * Ask Sheets for raw values instead of display strings. Required to read a
   * GOOGLEFINANCE result as a number rather than a locale-formatted string.
   */
  unformatted?: boolean;
}

export interface UpdateRangeOptions {
  /**
   * Send valueInputOption=USER_ENTERED so "=FORMULA(...)" is evaluated by
   * Sheets. Without it the formula is stored as literal text — verified.
   */
  formulas?: boolean;
}
```

Add the optional parameters to `SheetsClient.getValues` and `SheetsClient.updateRange`. Both are optional, so every existing call site compiles unchanged.

- [ ] **Step 4: Implement in the real client**

In `infrastructure/google/real-clients.ts`:

```ts
  async getValues(
    spreadsheetId: string,
    range: string,
    options: GetValuesOptions = {},
  ): Promise<SheetValues> {
    const query = options.unformatted
      ? "?valueRenderOption=UNFORMATTED_VALUE"
      : "";
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}${query}`;
    const resp = await fetch(url, { headers: authHeader(this.auth) });
    if (!resp.ok) {
      if (resp.status === 400) return [];
      throw new Error(`Get values failed: ${resp.status}`);
    }
    const data = (await resp.json()) as { values?: unknown[][] };
    // UNFORMATTED_VALUE returns JSON numbers and booleans; SheetValues is
    // string[][], so normalise every cell here rather than at each call site.
    return (data.values ?? []).map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell))),
    );
  }

  async updateRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
    options: UpdateRangeOptions = {},
  ): Promise<void> {
    const inputOption = options.formulas ? "USER_ENTERED" : "RAW";
    const url = `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=${inputOption}`;
    const resp = await fetch(url, {
      method: "PUT",
      headers: authHeader(this.auth),
      body: JSON.stringify({ values }),
    });
    if (!resp.ok) throw new Error(`Update failed: ${resp.status}`);
  }
```

Import the two option types. **`ensureSheets` must keep calling `updateRange` without the flag**, so a header row that happens to start with `=` or `+` is never evaluated.

- [ ] **Step 5: Implement the mock**

In `infrastructure/google/mocks/mock-backend.ts`, add:

```ts
/** FNV-1a. Deterministic, so demo prices never depend on Math.random. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Known-ish base prices so the demo looks plausible; anything else is derived. */
const MOCK_BASE_PRICES: Record<string, number> = {
  VOO: 679.14,
  BND: 72.31,
  VTI: 312.4,
  AAPL: 333.02,
};

/**
 * Deterministic pseudo-price for demo mode: a stable base per ticker plus a
 * daily wiggle of up to ±5%, so charts move without any randomness.
 */
export function mockPriceFor(ticker: string, isoDate: string): number {
  const symbol = ticker.trim().toUpperCase();
  const base = MOCK_BASE_PRICES[symbol] ?? 20 + (hashString(symbol) % 480);
  const wiggle = ((hashString(symbol + isoDate) % 1001) - 500) / 10_000;
  return Math.round(base * (1 + wiggle) * 100) / 100;
}

/** Tickers the mock refuses to price, so the error path is demonstrable. */
export function mockTickerIsKnown(ticker: string): boolean {
  return !/^Z{2,}/i.test(ticker.trim());
}
```

Also in `mock-backend.ts`, add the evaluator so both the backend and the client share it:

```ts
/** Marker prefix for a cell the app wrote with valueInputOption=USER_ENTERED. */
export const MOCK_FORMULA_PREFIX = " formula:";

/**
 * Evaluate a mock GOOGLEFINANCE call. `resolveRef` turns an A-column
 * reference like `A2` into the ticker sitting in that cell.
 */
export function evaluateMockFormula(
  formula: string,
  resolveRef: (ref: string) => string,
  today: string,
): string {
  const match = /^=GOOGLEFINANCE\(\s*([^,)]+)\s*(?:,\s*"([^"]*)"\s*)?\)/i.exec(
    formula.trim(),
  );
  if (!match) return "#ERROR!";

  const rawSymbol = match[1].trim();
  const attribute = (match[2] ?? "price").toLowerCase();
  const ticker = rawSymbol.startsWith('"')
    ? rawSymbol.replace(/"/g, "").trim()
    : resolveRef(rawSymbol);

  const symbol = ticker.replace(/^[A-Z]+:/i, "").toUpperCase();
  if (!symbol) return "#N/A";
  if (!mockTickerIsKnown(symbol)) {
    return `#N/A (When evaluating GOOGLEFINANCE, the query for the symbol: '${symbol}' returned no data.)`;
  }
  if (attribute === "name") return `${symbol} Fund`;
  if (attribute === "currency") return "USD";
  return String(mockPriceFor(symbol, today));
}
```

In `infrastructure/google/mocks/mock-clients.ts`, change the two methods:

```ts
  async updateRange(
    spreadsheetId: string,
    range: string,
    values: SheetValues,
    options: UpdateRangeOptions = {},
  ): Promise<void> {
    await delay(60);
    // A formula only evaluates when the caller asked for USER_ENTERED. Cells
    // written as RAW keep their literal text, exactly like the real API.
    const marked = options.formulas
      ? values.map((row) =>
          row.map((cell) =>
            typeof cell === "string" && cell.startsWith("=")
              ? MOCK_FORMULA_PREFIX + cell
              : cell,
          ),
        )
      : values;
    getMockBackend().setRange(spreadsheetId, range, marked);
  }

  async getValues(
    spreadsheetId: string,
    range: string,
    options: GetValuesOptions = {},
  ): Promise<SheetValues> {
    await delay(60);
    const raw = getMockBackend().getRange(spreadsheetId, range);
    const today = getMockBackend().today();
    return raw.map((row, rowIndex) =>
      row.map((cell) => {
        if (typeof cell !== "string") return String(cell ?? "");
        if (!cell.startsWith(MOCK_FORMULA_PREFIX)) return cell;
        const formula = cell.slice(MOCK_FORMULA_PREFIX.length);
        if (!options.unformatted) return formula;
        return evaluateMockFormula(
          formula,
          // Only A-column refs on the same row are supported; that is all the
          // quote service writes.
          () => String(row[0] ?? "").replace(MOCK_FORMULA_PREFIX, ""),
          today,
        );
      }),
    );
  }
```

The mock backend needs `setRange`, `getRange` and `today()`. If it already has range read/write helpers under different names, use those instead of adding duplicates — read the file before editing. `today()` must return a fixed `"YYYY-MM-DD"` constant (e.g. `"2026-07-26"`) with a setter for tests, never `new Date()`, so mock prices stay deterministic. Note `rowIndex` is unused in the snippet above; drop the parameter if lint objects.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/unit/mock-google-finance.test.ts`
Expected: PASS, 5 cases.

- [ ] **Step 7: Run the full suite**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: all clean. The existing `test/integration/sync-flow.test.ts` and `observation-flow.test.ts` exercise `updateRange`/`getValues` without options — they must still pass.

- [ ] **Step 8: Commit**

```bash
git add infrastructure/google test/unit/mock-google-finance.test.ts
git commit -m "feat(google): support USER_ENTERED writes and UNFORMATTED reads"
```

---

### Task 8: Quote service and price selectors

Writes the ticker block, reads the computed prices, and turns each read into a `price_quote`.

**Files:**
- Create: `infrastructure/market/quote-service.ts`
- Create: `lib/queries/market-data.ts`
- Test: `test/unit/quote-service.test.ts`
- Test: `test/unit/market-data.test.ts`

**Interfaces:**
- Consumes: `PriceQuote` (Task 2); `PriceMap` (Task 3); the Sheets client options (Task 7); `createEntity` from `@/infrastructure/db/command-service`; `repositories.price_quote`.
- Produces:
  - From `@/infrastructure/market/quote-service`: `QUOTE_SHEET`, `interface QuoteRow`, `parseQuoteCell`, `writeQuoteTickers`, `readQuoteRows`, `refreshQuotes`, `interface RefreshResult`
  - From `@/lib/queries/market-data`: `interface LatestPrices`, `selectLatestPrices(context)`, `useLatestPrices()`

- [ ] **Step 1: Write the failing tests**

Create `test/unit/quote-service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { parseQuoteCell, readQuoteRows, refreshQuotes } from "@/infrastructure/market/quote-service";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { repositories } from "@/infrastructure/db/repositories";
import type { GoogleClients, SheetValues } from "@/infrastructure/google/google-api-types";

describe("parseQuoteCell", () => {
  it("parses plain numbers and currency text", () => {
    expect(parseQuoteCell("679.14")).toBe(67_914);
    expect(parseQuoteCell("$512.40")).toBe(51_240);
    expect(parseQuoteCell("1,234.56")).toBe(123_456);
  });

  it("rounds to the nearest cent", () => {
    expect(parseQuoteCell("512.4013")).toBe(51_240);
    expect(parseQuoteCell("512.4050")).toBe(51_241);
  });

  it("rejects errors, blanks and nonsense", () => {
    expect(parseQuoteCell("#N/A")).toBeNull();
    expect(parseQuoteCell("#N/A (returned no data.)")).toBeNull();
    expect(parseQuoteCell("#ERROR!")).toBeNull();
    expect(parseQuoteCell("")).toBeNull();
    expect(parseQuoteCell("   ")).toBeNull();
    expect(parseQuoteCell("Loading...")).toBeNull();
    expect(parseQuoteCell("-5")).toBeNull();
  });
});

/** A SheetsClient stub that records writes and replays a fixed read. */
function stubClients(readValues: SheetValues) {
  const writes: Array<{ range: string; values: SheetValues; formulas?: boolean }> = [];
  const clients = {
    sheets: {
      async ensureSheets() {},
      async listSheetTitles() { return []; },
      async getValues() { return readValues; },
      async batchGetValues() { return {}; },
      async appendRows() { return { updatedRange: "", rowsAdded: 0 }; },
      async updateRange(_id: string, range: string, values: SheetValues, options?: { formulas?: boolean }) {
        writes.push({ range, values, formulas: options?.formulas });
      },
    },
  } as unknown as GoogleClients;
  return { clients, writes };
}

describe("readQuoteRows", () => {
  it("maps the sheet block into quote rows", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", "2026-07-26"],
      ["ZZZ", "#N/A", "", "", "2026-07-26"],
    ]);
    const rows = await readQuoteRows(clients, "ss");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ticker: "VOO", priceCents: 67_914, name: "Vanguard S&P 500 ETF" });
    expect(rows[1]).toMatchObject({ ticker: "ZZZ", priceCents: null });
  });
});

describe("refreshQuotes", () => {
  beforeEach(async () => {
    resetDbSingleton();
    const db = getDb();
    await Promise.all([db.entities, db.commands, db.syncQueue].map((t) => t.clear()));
  });

  it("writes the ticker block as formulas and persists one quote per ticker", async () => {
    const { clients, writes } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", ""],
      ["BND", "72.31", "Vanguard Total Bond", "USD", ""],
    ]);

    const result = await refreshQuotes(clients, "ss", ["VOO", "BND"], "2026-07-26");

    expect(writes[0].formulas).toBe(true);
    expect(String(writes[0].values[0][1])).toMatch(/GOOGLEFINANCE/);
    expect(result).toMatchObject({ requested: 2, written: 2, skippedSameDay: 0, failed: [] });

    const quotes = await repositories.price_quote.list();
    expect(quotes).toHaveLength(2);
    expect(quotes.map((q) => q.ticker).sort()).toEqual(["BND", "VOO"]);
    expect(quotes.every((q) => q.source === "googlefinance")).toBe(true);
  });

  it("skips a ticker that already has a quote for the same day", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "", "USD", ""],
    ]);
    await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26");
    const second = await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26");

    expect(second.skippedSameDay).toBe(1);
    expect(second.written).toBe(0);
    expect(await repositories.price_quote.list()).toHaveLength(1);
  });

  it("reports tickers with no usable price", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["ZZZ", "#N/A", "", "", ""],
    ]);
    const result = await refreshQuotes(clients, "ss", ["ZZZ"], "2026-07-26");
    expect(result.failed).toEqual(["ZZZ"]);
    expect(result.written).toBe(0);
  });

  it("does nothing when no tickers are requested", async () => {
    const { clients, writes } = stubClients([]);
    const result = await refreshQuotes(clients, "ss", [], "2026-07-26");
    expect(result).toMatchObject({ requested: 0, written: 0 });
    expect(writes).toHaveLength(0);
  });
});
```

Create `test/unit/market-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { selectLatestPrices } from "@/lib/queries/market-data";
import { makeContext, makeQuote } from "./engines/fixtures";

describe("selectLatestPrices", () => {
  it("picks the newest quote per ticker", () => {
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-20", priceCents: 60_000 }),
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 67_914 }),
        makeQuote({ ticker: "BND", quoteDate: "2026-07-26", priceCents: 7_231 }),
      ],
    });
    const { prices, asOf } = selectLatestPrices(ctx);
    expect(prices.VOO).toBe(67_914);
    expect(prices.BND).toBe(7_231);
    expect(asOf.VOO).toBe("2026-07-26");
  });

  it("ignores soft-deleted quotes", () => {
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-20", priceCents: 60_000 }),
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 99_999, deletedAt: "2026-07-27T00:00:00.000Z" }),
      ],
    });
    expect(selectLatestPrices(ctx).prices.VOO).toBe(60_000);
  });

  it("returns empty maps with no quotes", () => {
    expect(selectLatestPrices(makeContext({}))).toEqual({ prices: {}, asOf: {} });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/quote-service.test.ts test/unit/market-data.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the quote service**

Create `infrastructure/market/quote-service.ts`:

```ts
/**
 * Share prices without a backend.
 *
 * The user already authenticates with Google and already owns a workbook, so
 * the workbook itself is the price feed: a technical `__quotes` tab holds one
 * GOOGLEFINANCE formula per ticker, and the app reads the computed values back
 * through the Sheets API. No API key, no server, no extra OAuth scope.
 *
 * Two facts, both verified against the live API (spec §7.1):
 *  - the write MUST use valueInputOption=USER_ENTERED or the formula is stored
 *    as literal text,
 *  - the read with UNFORMATTED_VALUE yields a real number.
 *
 * Google blocks reading GOOGLEFINANCE *history* as an array outside Sheets, so
 * this never asks for one. Instead every successful read is persisted as a
 * price_quote, and the app accumulates its own price history over time.
 */

import type { PriceQuote } from "@/domain/entities";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import type { GoogleClients, SheetValues } from "@/infrastructure/google/google-api-types";
import { createLogger } from "@/lib/logger";
import type { MoneyCents } from "@/infrastructure/money/money";

const log = createLogger("quotes");

export const QUOTE_SHEET = "__quotes";

export interface QuoteRow {
  ticker: string;
  /** null when the cell errored, was blank, or was still loading. */
  priceCents: MoneyCents | null;
  name: string;
  currency: string;
}

/**
 * Parse one price cell into integer cents, or null when it is not a usable
 * price. Google returns `#N/A …` for an unknown symbol and `Loading...` while
 * a formula is still calculating — both mean "no price", not "zero".
 */
export function parseQuoteCell(raw: string | undefined): MoneyCents | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  if (text.startsWith("#")) return null;
  if (/loading/i.test(text)) return null;

  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/**
 * Rewrite the whole ticker block, so a ticker removed from the portfolio stops
 * consuming a GOOGLEFINANCE call. Row 1 is the header; data starts at row 2.
 */
export async function writeQuoteTickers(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  now: string,
): Promise<void> {
  if (tickers.length === 0) return;
  const rows: SheetValues = tickers.map((ticker, i) => {
    const row = i + 2;
    return [
      ticker,
      `=GOOGLEFINANCE(A${row},"price")`,
      `=GOOGLEFINANCE(A${row},"name")`,
      `=GOOGLEFINANCE(A${row},"currency")`,
      now,
    ];
  });
  await clients.sheets.updateRange(spreadsheetId, `${QUOTE_SHEET}!A2`, rows, {
    formulas: true,
  });
}

/** Read the computed block back. A bad cell yields a null price, never a throw. */
export async function readQuoteRows(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<QuoteRow[]> {
  const values = await clients.sheets.getValues(
    spreadsheetId,
    `${QUOTE_SHEET}!A:E`,
    { unformatted: true },
  );
  if (values.length < 2) return [];
  return values
    .slice(1)
    .filter((row) => (row[0] ?? "").trim() !== "")
    .map((row) => ({
      ticker: (row[0] ?? "").trim().toUpperCase(),
      priceCents: parseQuoteCell(row[1]),
      name: (row[2] ?? "").trim(),
      currency: (row[3] ?? "").trim(),
    }));
}

export interface RefreshResult {
  requested: number;
  written: number;
  skippedSameDay: number;
  /** Tickers with no usable price. */
  failed: string[];
}

/**
 * Full round trip: write the ticker block, read it back, and persist one
 * price_quote per ticker for `today`. A ticker that already has a quote for
 * today is skipped, so refreshing five times in an afternoon does not create
 * five rows.
 */
export async function refreshQuotes(
  clients: GoogleClients,
  spreadsheetId: string,
  tickers: string[],
  today: string,
): Promise<RefreshResult> {
  const wanted = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) {
    return { requested: 0, written: 0, skippedSameDay: 0, failed: [] };
  }

  await writeQuoteTickers(clients, spreadsheetId, wanted, today);
  const rows = await readQuoteRows(clients, spreadsheetId);
  const byTicker = new Map(rows.map((r) => [r.ticker, r]));

  const existing = await repositories.price_quote.list();
  const alreadyToday = new Set(
    existing.filter((q) => q.quoteDate === today).map((q) => q.ticker),
  );

  let written = 0;
  let skippedSameDay = 0;
  const failed: string[] = [];

  for (const ticker of wanted) {
    if (alreadyToday.has(ticker)) {
      skippedSameDay += 1;
      continue;
    }
    const row = byTicker.get(ticker);
    if (!row || row.priceCents === null) {
      failed.push(ticker);
      continue;
    }
    await createEntity<PriceQuote>("price_quote", {
      ticker,
      quoteDate: today,
      priceCents: row.priceCents,
      source: "googlefinance",
    });
    written += 1;
  }

  log.info("Refreshed quotes", { requested: wanted.length, written, skippedSameDay, failed });
  return { requested: wanted.length, written, skippedSameDay, failed };
}
```

- [ ] **Step 4: Implement the price selector**

Create `lib/queries/market-data.ts`:

```ts
"use client";

import type { FinancialContext } from "@/domain/context";
import type { PriceMap } from "@/domain/engines";
import { useFinancialContext } from "@/lib/queries/financial-data";

export interface LatestPrices {
  prices: PriceMap;
  /** ticker -> quoteDate of the price being used, for an "as of" label. */
  asOf: Record<string, string>;
}

/** Newest quote per ticker. Pure, so it is unit-testable without React. */
export function selectLatestPrices(context: FinancialContext): LatestPrices {
  const prices: PriceMap = {};
  const asOf: Record<string, string> = {};

  for (const q of context.priceQuotes) {
    if (q.deletedAt) continue;
    const seen = asOf[q.ticker];
    if (!seen || q.quoteDate > seen) {
      asOf[q.ticker] = q.quoteDate;
      prices[q.ticker] = q.priceCents;
    }
  }
  return { prices, asOf };
}

/** Thin hook over the loaded financial context. */
export function useLatestPrices(): LatestPrices {
  const { data: context } = useFinancialContext();
  return selectLatestPrices(context);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run test/unit/quote-service.test.ts test/unit/market-data.test.ts`
Expected: PASS, 12 cases.

- [ ] **Step 6: Commit**

```bash
git add infrastructure/market lib/queries/market-data.ts test/unit
git commit -m "feat(quotes): add GOOGLEFINANCE quote service and price selectors"
```

---

### Task 9: Shares input and Data Studio registry entries

Makes holdings and lots editable through the generic CRUD engine.

**Files:**
- Create: `components/forms/shares-input.tsx`
- Modify: `features/data-studio/types.ts`
- Modify: `features/data-studio/form-utils.ts`
- Modify: `features/data-studio/entity-form-drawer.tsx`
- Modify: `features/data-studio/registry.tsx`
- Modify: `features/data-studio/list-screen.tsx`
- Modify: `lib/i18n/messages/en-US/entities.json`, `.../pt-BR/entities.json`
- Modify: `lib/i18n/messages/en-US/forms.json`, `.../pt-BR/forms.json`
- Modify: `lib/i18n/messages/en-US/dataStudio.json`, `.../pt-BR/dataStudio.json`

**Interfaces:**
- Consumes: `parseSharesToMicros`, `formatShares`, `microsToShares` (Task 1); `Holding`, `Lot` (Task 2).
- Produces: `FieldType` gains `"shares"`; `FieldDef.dynamicOptions` gains `"investmentAccounts"` and `"holdings"`; `ENTITY_REGISTRY.holding` and `.lot`.

- [ ] **Step 1: Add the shares input**

Create `components/forms/shares-input.tsx`, mirroring `components/forms/money-input.tsx` exactly — same focused/unfocused display pattern, same props shape — but emitting integer micros:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatShares,
  parseSharesToMicros,
} from "@/domain/value-objects/shares";

export interface SharesInputProps {
  /** value in integer share micros */
  value: number;
  onChange: (micros: number) => void;
  onBlur?: () => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/** Share-denominated input that emits integer micros. */
export function SharesInput({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "0",
  className,
  disabled,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: SharesInputProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (value ? formatShares(value) : ""));

  useEffect(() => {
    if (!focused) setText(value ? formatShares(value) : "");
  }, [value, focused]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      className={cn("tabular-nums", className)}
      disabled={disabled}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedby}
      placeholder={placeholder}
      value={focused ? text : value ? formatShares(value) : ""}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseSharesToMicros(e.target.value));
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
    />
  );
}
```

- [ ] **Step 2: Teach the form engine about shares**

`features/data-studio/types.ts`: add `"shares"` to `FieldType`, and extend the dynamic-options union:

```ts
dynamicOptions?:
  | "people"
  | "properties"
  | "scenarios"
  | "investmentAccounts"
  | "holdings";
```

`features/data-studio/form-utils.ts`: in `requiredFieldErrors`, add `"shares"` to the numeric branch so a required share count must be greater than zero:

```ts
    if (
      f.type === "money" ||
      f.type === "number" ||
      f.type === "percent" ||
      f.type === "shares"
    ) {
```

`features/data-studio/entity-form-drawer.tsx`:
- add the two `dynamicOptions` branches, copying the shape of the existing `properties` branch:

```tsx
  if (field.dynamicOptions === "investmentAccounts") {
    return [
      { value: "", label: "common:none", raw: false },
      ...context.investmentAccounts
        .filter((a) => !a.deletedAt)
        .map((a) => ({ value: a.id, label: a.name, raw: true })),
    ];
  }
  if (field.dynamicOptions === "holdings") {
    return [
      { value: "", label: "common:none", raw: false },
      ...context.holdings
        .filter((h) => !h.deletedAt)
        .map((h) => ({ value: h.id, label: h.ticker || h.name, raw: true })),
    ];
  }
```

- add a `"shares"` case to `FieldControl`, rendering `SharesInput` exactly where `money` renders `MoneyInput`.

`features/data-studio/list-screen.tsx`: add `selectEntities` cases:

```ts
    case "holding":
      return context.holdings;
    case "lot":
      return context.lots;
```

`price_quote` gets **no** case and no registry entry: it is machine-written data, not something to hand-edit.

- [ ] **Step 3: Add the i18n keys**

`entities.json` (both locales) — `holding` and `lot` singular/plural, plus the enum groups `assetClass` (`us_equity`, `intl_equity`, `bond`, `reit`, `cash`, `crypto`, `other`) and `lotStatus` (`open`, `closed`).

en-US values: Holding/Holdings, Lot/Lots; US stocks, International stocks, Bonds, Real estate (REIT), Cash, Crypto, Other; Open, Closed.
pt-BR values: Posição/Posições, Lote/Lotes; Ações EUA, Ações internacionais, Renda fixa, Fundos imobiliários (REIT), Caixa, Cripto, Outros; Aberto, Fechado.

`forms.json` (both locales) — a `holding` block (`accountId`, `ticker`, `name`, `assetClass`, `targetAllocationBps`) and a `lot` block (`holdingId`, `tradeDate`, `sharesMicro`, `costTotalCents`, `feesCents`, `status`, `closeDate`, `proceedsCents`, `note`), plus new column labels: `columns.ticker`, `columns.shares`, `columns.costBasis`, `columns.marketValue`, `columns.gain`, `columns.weight`, `columns.tradeDate`, `columns.price`, `columns.account`.

`dataStudio.json` (both locales) — `modules.holding.description` and `modules.lot.description`.

- [ ] **Step 4: Add the registry entries**

In `features/data-studio/registry.tsx`, add `Layers` and `Coins` (or similar) to the lucide import, `Holding` and `Lot` to the entity type import, the enum option lists via `enumOpts`, and two configs. Note that `primary`/`secondary`/`render` now receive the `FinancialContext` as a second argument — use it so a lot names its holding's ticker rather than showing a raw id:

```tsx
const ASSET_CLASSES = enumOpts("assetClass", [
  "us_equity", "intl_equity", "bond", "reit", "cash", "crypto", "other",
]);
const LOT_STATUS = enumOpts("lotStatus", ["open", "closed"]);

function tickerForLot(lot: Lot, ctx: FinancialContext): string {
  const holding = ctx.holdings.find((h) => !h.deletedAt && h.id === lot.holdingId);
  return holding?.ticker || holding?.name || i18n.t("observations:unknownSubject");
}

const holding = def<Holding>({
  type: "holding",
  singular: "entities:holding.singular",
  plural: "entities:holding.plural",
  icon: Layers,
  href: "/portfolio",
  description: "dataStudio:modules.holding.description",
  fields: [
    { name: "accountId", label: "forms:holding.accountId.label", type: "select", dynamicOptions: "investmentAccounts", required: true },
    { name: "ticker", label: "forms:holding.ticker.label", type: "text", required: true },
    { name: "name", label: "forms:holding.name.label", type: "text", colSpan: 2 },
    { name: "assetClass", label: "forms:holding.assetClass.label", type: "select", options: ASSET_CLASSES },
    { name: "targetAllocationBps", label: "forms:holding.targetAllocationBps.label", type: "percent" },
  ],
  columns: [
    { label: "forms:columns.type", render: (e) => <Badge variant="secondary">{labelOf(ASSET_CLASSES, e.assetClass)}</Badge> },
    { label: "forms:columns.account", render: (e, ctx) => ctx.investmentAccounts.find((a) => a.id === e.accountId)?.name ?? "—" },
  ],
  primary: (e) => e.ticker || e.name,
  secondary: (e) => e.name,
  searchText: (e) => `${e.ticker} ${e.name} ${e.assetClass}`,
});

const lot = def<Lot>({
  type: "lot",
  singular: "entities:lot.singular",
  plural: "entities:lot.plural",
  icon: Coins,
  href: "/portfolio",
  description: "dataStudio:modules.lot.description",
  fields: [
    { name: "holdingId", label: "forms:lot.holdingId.label", type: "select", dynamicOptions: "holdings", required: true },
    { name: "tradeDate", label: "forms:lot.tradeDate.label", type: "date", required: true },
    { name: "sharesMicro", label: "forms:lot.sharesMicro.label", type: "shares", required: true },
    { name: "costTotalCents", label: "forms:lot.costTotalCents.label", type: "money", required: true },
    { name: "feesCents", label: "forms:lot.feesCents.label", type: "money" },
    { name: "status", label: "forms:lot.status.label", type: "select", options: LOT_STATUS },
    { name: "closeDate", label: "forms:lot.closeDate.label", type: "date" },
    { name: "proceedsCents", label: "forms:lot.proceedsCents.label", type: "money" },
    { name: "note", label: "forms:lot.note.label", type: "textarea", colSpan: 2 },
  ],
  columns: [
    { label: "forms:columns.shares", align: "right", render: (e) => formatShares(e.sharesMicro) },
    { label: "forms:columns.costBasis", align: "right", render: (e) => formatCents(e.costTotalCents + e.feesCents) },
    { label: "forms:columns.status", render: (e) => <Badge variant="secondary">{labelOf(LOT_STATUS, e.status)}</Badge> },
  ],
  primary: (e, ctx) => tickerForLot(e, ctx),
  secondary: (e) => `${formatShares(e.sharesMicro)} @ ${formatDate(e.tradeDate)}`,
  searchText: (e, ctx) => `${tickerForLot(e, ctx)} ${e.tradeDate} ${e.note}`,
});
```

Register both in `ENTITY_REGISTRY` and `DATA_STUDIO_MODULES`. Import `formatShares` from `@/domain/value-objects/shares`.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all clean, 107 + the new tests still passing.

- [ ] **Step 6: Commit**

```bash
git add components/forms features/data-studio lib/i18n
git commit -m "feat(portfolio): add shares input and holding/lot registry entries"
```

---

### Task 10: Portfolio screen

The screen the whole feature exists for.

**Files:**
- Create: `app/(app)/portfolio/page.tsx`
- Create: `features/portfolio/positions-table.tsx`
- Create: `features/portfolio/lots-table.tsx`
- Create: `lib/i18n/messages/en-US/portfolio.json`
- Create: `lib/i18n/messages/pt-BR/portfolio.json`
- Modify: `lib/i18n/config.ts`
- Modify: `components/layout/nav-config.ts`
- Modify: `lib/i18n/messages/en-US/nav.json`, `.../pt-BR/nav.json`

**Interfaces:**
- Consumes: everything from Tasks 3–5 and 8.
- Produces: the `/portfolio` route.

- [ ] **Step 1: Add the i18n namespace**

Create `portfolio.json` in both locales with at least these keys: `title`, `description`, `summary.marketValue`, `summary.costBasis`, `summary.unrealizedGain`, `summary.moneyWeightedReturn`, `summary.missingPrices`, `positions.title`, `positions.empty`, `positions.noPrice`, `positions.setPrice`, `lots.title`, `lots.longTerm`, `lots.daysToLongTerm`, `allocation.title`, `allocation.drift`, `allocation.overweight`, `allocation.underweight`, `refresh.button`, `refresh.running`, `refresh.success`, `refresh.skipped`, `refresh.failed`, `refresh.noWorkbook`, `manualPrice.title`, `manualPrice.label`, `manualPrice.save`, `asOf` (interpolates `{{date}}`), `lots.perShare`.

Register the namespace in `lib/i18n/config.ts` in all five places (en import, pt import, `NAMESPACES`, `resources["en-US"]`, `resources["pt-BR"]`), immediately after `observations`.

- [ ] **Step 2: Build the positions table**

Create `features/portfolio/positions-table.tsx`:

```tsx
"use client";

import { useTranslation } from "react-i18next";
import type { Position } from "@/domain/engines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatShares } from "@/domain/value-objects/shares";
import { formatBps } from "@/domain/value-objects/basis-points";
import { formatCents } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";
import { cn } from "@/lib/utils";

export interface PositionsTableProps {
  positions: Position[];
  /** ticker -> quote date, for the "as of" hint under the price. */
  asOf: Record<string, string>;
  accountNameById: Record<string, string>;
  onSetPrice: (ticker: string) => void;
}

export function PositionsTable({
  positions, asOf, accountNameById, onSetPrice,
}: PositionsTableProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("forms:columns.ticker")}</TableHead>
            <TableHead>{t("forms:columns.account")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.shares")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.costBasis")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.price")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.marketValue")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.gain")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.weight")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((p) => {
            const pricePerShare =
              p.hasPrice && p.sharesMicro > 0
                ? Math.round((p.marketValueCents * 1_000_000) / p.sharesMicro)
                : 0;
            return (
              <TableRow key={p.holdingId}>
                <TableCell>
                  <div className="font-medium">{p.ticker || p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.name}</div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {accountNameById[p.accountId] ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatShares(p.sharesMicro)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCents(p.costBasisCents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? (
                    <>
                      <div>{formatCents(pricePerShare)}</div>
                      {asOf[p.ticker] ? (
                        <div className="text-xs text-muted-foreground">
                          {t("portfolio:asOf", { date: formatDate(asOf[p.ticker]) })}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant="secondary">{t("portfolio:positions.noPrice")}</Badge>
                      <Button size="sm" variant="outline" onClick={() => onSetPrice(p.ticker)}>
                        {t("portfolio:positions.setPrice")}
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? formatCents(p.marketValueCents) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    p.hasPrice && p.unrealizedGainCents > 0 && "text-emerald-600",
                    p.hasPrice && p.unrealizedGainCents < 0 && "text-red-600",
                  )}
                >
                  {p.hasPrice
                    ? `${formatCents(p.unrealizedGainCents)} (${formatBps(p.simpleReturnBps)})`
                    : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.hasPrice ? formatBps(p.weightBps) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

`Position.weightBps` comes from Task 3 — it is already defined and tested there.

- [ ] **Step 3: Build the lots table**

Create `features/portfolio/lots-table.tsx`:

```tsx
"use client";

import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { LotView } from "@/domain/engines";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatShares } from "@/domain/value-objects/shares";
import { formatCents } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";
import { cn } from "@/lib/utils";

export interface LotsTableProps {
  views: LotView[];
}

export function LotsTable({ views }: LotsTableProps) {
  const { t } = useTranslation();

  const byTicker = new Map<string, LotView[]>();
  for (const v of [...views].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))) {
    const list = byTicker.get(v.ticker);
    if (list) list.push(v);
    else byTicker.set(v.ticker, [v]);
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("forms:columns.tradeDate")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.shares")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.costBasis")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.marketValue")}</TableHead>
            <TableHead className="text-right">{t("forms:columns.gain")}</TableHead>
            <TableHead>{t("portfolio:lots.longTerm")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...byTicker.entries()].map(([ticker, lots]) => (
            <Fragment key={ticker}>
              <TableRow className="bg-muted/40">
                <TableCell colSpan={6} className="font-medium">{ticker}</TableCell>
              </TableRow>
              {lots.map((v) => (
                <TableRow key={v.lotId}>
                  <TableCell>{formatDate(v.tradeDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatShares(v.sharesMicro)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <div>{formatCents(v.costBasisCents)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatCents(v.costPerShareCents)} / share
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {v.hasPrice ? formatCents(v.marketValueCents) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      v.hasPrice && v.unrealizedGainCents > 0 && "text-emerald-600",
                      v.hasPrice && v.unrealizedGainCents < 0 && "text-red-600",
                    )}
                  >
                    {v.hasPrice ? formatCents(v.unrealizedGainCents) : "—"}
                  </TableCell>
                  <TableCell>
                    {v.isLongTerm ? (
                      <Badge variant="secondary">{t("portfolio:lots.longTerm")}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("portfolio:lots.daysToLongTerm", { count: v.daysToLongTerm })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

Replace the literal `/ share` with `t("portfolio:lots.perShare")` and add that key to both locales (en-US `"/ share"`, pt-BR `"/ cota"`) — no user-facing string may be hard-coded.

- [ ] **Step 4: Build the page**

Create `app/(app)/portfolio/page.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  allocationByAssetClass,
  allocationDrift,
  buildLotViews,
  buildPositions,
  moneyWeightedReturnBps,
  portfolioCostBasisCents,
  portfolioUnrealizedGainCents,
  portfolioValueCents,
} from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EChart } from "@/components/charts/echart";
import { donutMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { useLatestPrices } from "@/lib/queries/market-data";
import { PositionsTable } from "@/features/portfolio/positions-table";
import { LotsTable } from "@/features/portfolio/lots-table";

export default function PortfolioPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const { prices, asOf } = useLatestPrices();

  const model = useMemo(() => {
    const today = todayIsoDate();
    const positions = buildPositions(context, prices);
    return {
      positions,
      lotViews: buildLotViews(context, prices, today),
      valueCents: portfolioValueCents(positions),
      basisCents: portfolioCostBasisCents(positions),
      gainCents: portfolioUnrealizedGainCents(positions),
      returnBps: moneyWeightedReturnBps(context, prices, today),
      allocation: allocationByAssetClass(positions),
      drift: allocationDrift(context, positions),
      missingPrices: positions.filter((p) => !p.hasPrice).length,
    };
  }, [context, prices]);

  if (model.positions.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("portfolio:title")} description={t("portfolio:description")} />
        <EmptyState title={t("portfolio:positions.title")} description={t("portfolio:positions.empty")} />
      </div>
    );
  }

  const accountNameById = useMemo(
    () =>
      Object.fromEntries(
        context.investmentAccounts.filter((a) => !a.deletedAt).map((a) => [a.id, a.name]),
      ),
    [context.investmentAccounts],
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("portfolio:title")} description={t("portfolio:description")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("portfolio:summary.marketValue")}
          value={formatCents(model.valueCents)}
        />
        <KpiCard
          label={t("portfolio:summary.costBasis")}
          value={formatCents(model.basisCents)}
        />
        <KpiCard
          label={t("portfolio:summary.unrealizedGain")}
          value={formatCents(model.gainCents)}
          tone={model.gainCents >= 0 ? "positive" : "negative"}
          sub={
            model.basisCents > 0
              ? formatBps(Math.round((model.gainCents / model.basisCents) * 10_000))
              : undefined
          }
        />
        <KpiCard
          label={t("portfolio:summary.moneyWeightedReturn")}
          value={model.returnBps === null ? "—" : formatBps(model.returnBps)}
          tone={model.missingPrices > 0 ? "warning" : "default"}
          sub={
            model.missingPrices > 0
              ? t("portfolio:summary.missingPrices", { count: model.missingPrices })
              : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("portfolio:positions.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PositionsTable
            positions={model.positions}
            asOf={asOf}
            accountNameById={accountNameById}
            onSetPrice={() => undefined}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("portfolio:allocation.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart
              option={donutMoneyOption(
                model.allocation.map((slice) => ({
                  name: t(`entities:assetClass.${slice.assetClass}`),
                  value: toDollars(slice.valueCents),
                })),
              )}
              height={280}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("portfolio:allocation.drift")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {model.drift.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("portfolio:allocation.noTargets")}
              </p>
            ) : (
              model.drift.map((d) => (
                <div key={d.holdingId} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{d.ticker}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatBps(d.actualBps)} / {formatBps(d.targetBps)}
                  </span>
                  <span className="tabular-nums">
                    {t(
                      d.driftBps >= 0
                        ? "portfolio:allocation.overweight"
                        : "portfolio:allocation.underweight",
                      { amount: formatBps(Math.abs(d.driftBps)) },
                    )}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("portfolio:lots.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <LotsTable views={model.lotViews} />
        </CardContent>
      </Card>
    </div>
  );
}
```

`onSetPrice` is a no-op here on purpose — Task 11 replaces it with the dialog. Add `portfolio:allocation.noTargets` to both locales alongside the other keys.

`KpiCard`'s props are `{ label, value, sub?, tone?, icon? }` with `tone` one of `"default" | "positive" | "negative" | "warning"` — the calls above already match.

- [ ] **Step 5: Add the nav entry**

`components/layout/nav-config.ts`: add `{ label: "Portfolio", href: "/portfolio", icon: PieChart }` to the Planning group, immediately after Investments. Add `"Portfolio"` to `nav.json` items in both locales (pt-BR: `"Carteira"`).

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean.

**Do not run `npm run dev` in an automated session** — a long-running dev server blocks. A human verifies the screen at the end of the plan.

- [ ] **Step 7: Commit**

```bash
git add app features/portfolio components/layout lib/i18n
git commit -m "feat(portfolio): add the portfolio screen"
```

---

### Task 11: Refresh prices and manual price entry

The two ways a price gets into the app.

**Files:**
- Create: `features/portfolio/use-refresh-quotes.ts`
- Create: `features/portfolio/set-price-dialog.tsx`
- Modify: `app/(app)/portfolio/page.tsx`

**Interfaces:**
- Consumes: `refreshQuotes` (Task 8); `useWorkbookStore` (existing, for the spreadsheet id); `useEntityActions` (existing); `todayIsoDate`.
- Produces: `useRefreshQuotes()` returning `{ refresh, running }`; `SetPriceDialog`.

- [ ] **Step 1: Implement the refresh hook**

Create `features/portfolio/use-refresh-quotes.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getGoogleClients } from "@/infrastructure/google";
import { refreshQuotes } from "@/infrastructure/market/quote-service";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { useFinancialContext, useInvalidateFinancialData } from "@/lib/queries/financial-data";
import { useWorkbookStore } from "@/lib/stores/workbook-store";

/**
 * Manual refresh only. A static PWA has no scheduler, so an automatic hourly
 * update would be a lie in the UI. The user asks, the app fetches.
 */
export function useRefreshQuotes() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const invalidate = useInvalidateFinancialData();
  // The store holds the whole WorkbookRef, not a bare id.
  const workbookId = useWorkbookStore((s) => s.workbook?.id ?? null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    if (!workbookId) {
      toast.error(t("portfolio:refresh.noWorkbook"));
      return;
    }
    const tickers = [
      ...new Set(
        context.holdings
          .filter((h) => !h.deletedAt && h.ticker.trim() !== "")
          .map((h) => h.ticker.trim().toUpperCase()),
      ),
    ];
    if (tickers.length === 0) return;

    setRunning(true);
    try {
      const result = await refreshQuotes(getGoogleClients(), workbookId, tickers, todayIsoDate());
      await invalidate();
      if (result.failed.length > 0) {
        toast.warning(t("portfolio:refresh.failed", { tickers: result.failed.join(", ") }));
      } else {
        toast.success(
          t("portfolio:refresh.success", { count: result.written, skipped: result.skippedSameDay }),
        );
      }
    } catch (error) {
      toast.error(String(error instanceof Error ? error.message : error));
    } finally {
      setRunning(false);
    }
  }, [context.holdings, invalidate, t, workbookId]);

  return { refresh, running };
}
```

`lib/stores/workbook-store.ts` exposes `WorkbookState` as `{ status, workbook: WorkbookRef | null, error, step, init }` — there is no `workbookId` field, which is why the selector reads `s.workbook?.id`.

- [ ] **Step 2: Implement the manual price dialog**

Create `features/portfolio/set-price-dialog.tsx`, modelled on `components/shared/mark-value-dialog.tsx` — same Dialog primitives, same reset-on-open-rising-edge pattern, same `toast.error` on failure. It takes `{ open, onOpenChange, ticker, currentPriceCents }` and writes a `price_quote` for today with `source: "manual"` through `useEntityActions().create`.

This path is always available, whatever the quote feed does.

- [ ] **Step 3: Wire both into the page**

In `app/(app)/portfolio/page.tsx`, add a "Refresh prices" button to the page header using `useRefreshQuotes`, and hold `settingPriceFor: string | null` state so the positions table's "Set price" action opens `SetPriceDialog` for that ticker.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add features/portfolio app/\(app\)/portfolio
git commit -m "feat(portfolio): add price refresh and manual price entry"
```

---

### Task 12: Seed, integration test and full verification

**Files:**
- Modify: `lib/seed/demo-data.ts`
- Test: `test/integration/portfolio-flow.test.ts`

- [ ] **Step 1: Write the integration test**

Create `test/integration/portfolio-flow.test.ts`, mirroring `test/integration/observation-flow.test.ts`:

1. `beforeEach` resets the Dexie singleton, clears every table, and calls `getMockBackend().resetAll()`.
2. Create a `holding` and two `lot`s through `createEntity`. Assert the entity, the `CommandRecord` and the `SyncQueueItem` all landed for each.
3. `initWorkbook` then `pushPending`; assert the `holdings` and `lots` tabs each hold the expected rows, checking `shares_micro` and `cost_total_cents` by looking the column up with `headersFor(...)`.
4. Clear `db.entities`, `importWorkbook`, and assert both entities come back with their numeric fields intact.
5. Run `refreshQuotes` against the mock clients for the holding's ticker and assert exactly one `price_quote` was created, then assert `selectLatestPrices` over a freshly loaded context returns that ticker's price.

- [ ] **Step 2: Run it**

Run: `npx vitest run test/integration/portfolio-flow.test.ts`
Expected: PASS. Tasks 1–11 already built everything it exercises; this locks the behaviour in. If it fails, the fault is in the earlier plumbing — investigate, do not weaken the test.

- [ ] **Step 3: Seed a demo portfolio**

In `lib/seed/demo-data.ts`, after the investment accounts are created, give the brokerage account three holdings and four lots, plus one `price_quote` per ticker dated today so the portfolio screen has prices without needing a network call:

- VOO — `us_equity`, target 6000 bps — two lots (an older larger buy and a recent smaller one)
- BND — `bond`, target 3000 bps — one lot
- VXUS — `intl_equity`, target 1000 bps — one lot

Derive the lot trade dates from `todayIsoDate()` and `addMonthsIso` — never hardcode a calendar year, for the same reason the observation marks do not. Set each lot's `costTotalCents` so its per-share cost is a plausible fraction of the seeded quote, giving a mix of gains and one small loss (so `lotsAtALoss` has something to show). Use `mockPriceFor(ticker, today)` for the seeded quote prices so the demo agrees with what a refresh would return.

- [ ] **Step 4: Full verification**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: typecheck clean, every test passing, lint 0 errors.

Then, with no dev server running: `npm run build`
Expected: static export succeeds and `/portfolio` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add lib/seed test/integration/portfolio-flow.test.ts
git commit -m "feat(portfolio): seed a demo portfolio and add integration coverage"
```

---

## Done criteria

- [ ] A holding and its lots round-trip: command → sync queue → `holdings`/`lots` sheets → re-import, with share counts and cents intact.
- [ ] The portfolio screen shows market value, cost basis, unrealized gain, money-weighted return, allocation by asset class, drift against targets, and per-lot holding periods.
- [ ] "Refresh prices" writes GOOGLEFINANCE formulas to `__quotes`, reads the computed prices back, and persists one `price_quote` per ticker per day.
- [ ] A position with no price shows "No price" and offers manual entry — never a silent zero.
- [ ] An investment account that has holdings is valued from its positions everywhere net worth is computed.
- [ ] A lot bought exactly one year ago is **not** long-term; one day later it is.
- [ ] `npm run typecheck && npm run test && npm run lint` pass; the pre-existing 107 tests are untouched and green.
- [ ] `npm run build` produces the static export including `/portfolio`.

## Human verification (after the plan completes)

A browser pass is required — the automated loop cannot see any of this:

- Add a holding and a lot through the UI; confirm shares accept `12.5` and store as micros.
- Click "Refresh prices" against the real workbook and confirm a price lands and the `__quotes` tab looks sane.
- Confirm a bad ticker surfaces as a warning naming the ticker, not a silent failure.
- Check both locales for raw i18n keys, and both themes for the tables and donut.
