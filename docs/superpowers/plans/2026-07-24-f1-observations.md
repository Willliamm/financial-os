# F1 — Observations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a datestamped value mark (`Observation`) for investment accounts, properties and loans, so net worth becomes a historical curve and every asset shows how old its last mark is.

**Architecture:** A new `observation` domain entity flows through the existing command pipeline and Google Sheets sync with no special cases. Two pure engines (`net-worth-history`, `data-freshness`) turn observations into a curve and a staleness report. A shared "Mark value" dialog writes the observation and, when the mark is the newest one, also updates the subject entity's current-value field — so no existing engine changes and the current 68 tests stay green.

**Tech Stack:** Next.js 15 (static export) · React 19 · TypeScript strict · Zod · Dexie · TanStack Query · date-fns · Apache ECharts (lazy) · react-i18next · Vitest + fake-indexeddb.

**Source spec:** `docs/superpowers/specs/2026-07-24-portfolio-observations-quotes-design.md` (§4, §5, §8, §9). This plan covers **F1 only**. F2 (holdings/lots) and F3 (quotes) get their own plans.

## Global Constraints

- Money is **integer US cents**. Percentages are **integer basis points**. Dollars appear only at the UI edge, converted in `components/forms/money-input.tsx`.
- Every mutation goes through `applyCommand` in `infrastructure/db/command-service.ts` (usually via `useEntityActions()` in the UI).
- Local Dexie write always precedes any Google Sheets sync.
- `domain/` imports **no** React, Dexie, or Google. It may import `infrastructure/money`, `infrastructure/dates` and `domain/value-objects` — existing engines already do.
- `domain/` must **not** import from `features/`. (Spec §5.1 put the liability map in `features/`; this plan corrects that — see Task 1, Step 5.)
- No SSR, no API routes, no `[id]` dynamic routes. `next.config.ts` is `output: "export"`.
- Engines take no clock. Any "today" is passed in as a `"YYYY-MM-DD"` string parameter.
- Date strings in this feature are **calendar dates**, format `"YYYY-MM-DD"` — never timestamps. Lexicographic string comparison equals chronological comparison; the code relies on that.
- i18n keys go into **both** `lib/i18n/messages/en-US/` and `lib/i18n/messages/pt-BR/`.
- Verify loop: `npm run typecheck && npm run test && npm run lint`.
- **Do not run `npm run build` while `npm run dev` is running.**

---

### Task 1: Observation entity and persistence plumbing

Adds the entity end to end: type, interface, schema, sheet columns, repository, context, schema version. Nothing renders yet; the deliverable is a row that survives a sheet round-trip.

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
- Consumes: nothing (first task).
- Produces:
  - `Observation`, `ObservationSubjectType`, `ObservationSource`, `OBSERVATION_SUBJECT_IS_LIABILITY` from `@/domain/entities`
  - `observationSchema` from `@/domain/schemas`
  - `FinancialContext.observations: Observation[]`
  - `repositories.observation`
  - `makeObservation(over?: Partial<Observation>): Observation` from `test/unit/engines/fixtures`

- [ ] **Step 1: Write the failing test**

Append to `test/unit/sheet-mapper.test.ts`:

```ts
it("round-trips an Observation through a sheet row", () => {
  const observation: Observation = {
    id: "obs-1",
    version: 0,
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    createdBy: "tester@x",
    updatedBy: "tester@x",
    householdId: "h1",
    subjectType: "investment_account",
    subjectId: "acct-1",
    observedAt: "2026-06-30",
    valueCents: 9_600_000,
    source: "manual",
    note: "Statement, mid-year",
  };

  const row = entityToRow("observation", observation);
  const parsed = rowToEntity(
    "observation",
    headersFor("observation"),
    row,
  ) as Observation | null;

  expect(parsed).not.toBeNull();
  expect(parsed?.subjectType).toBe("investment_account");
  expect(parsed?.subjectId).toBe("acct-1");
  expect(parsed?.observedAt).toBe("2026-06-30");
  expect(parsed?.valueCents).toBe(9_600_000);
  expect(parsed?.source).toBe("manual");
  expect(parsed?.note).toBe("Statement, mid-year");
});
```

Extend the existing import at the top of the file:

```ts
import type { IncomeSource, Observation, Property } from "@/domain/entities";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/sheet-mapper.test.ts`
Expected: FAIL — TypeScript cannot resolve `Observation`, and `entityToRow("observation", ...)` is not a valid entity type.

- [ ] **Step 3: Add the entity type**

In `domain/entities/base.ts`, add `"observation"` as the last member of `EntityType`, then add the two map entries:

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
  | "observation";
```

In `ENTITY_SHEET` add `observation: "observations",`.
In `ENTITY_LOCK_TYPE` add `observation: "observation",`.

- [ ] **Step 4: Add the command types**

In `domain/commands/index.ts`, add to `CommandType`:

```ts
  | "CreateObservation"
  | "UpdateObservation"
  | "DeleteObservation";
```

and to `ENTITY_PASCAL`:

```ts
  observation: "Observation",
```

- [ ] **Step 5: Add the entity interface**

In `domain/entities/index.ts`, add before the `AnyEntity` union:

```ts
/** What an observation can be a mark of. */
export type ObservationSubjectType =
  | "investment_account"
  | "property"
  | "loan";

export type ObservationSource = "manual" | "quote" | "import";

/**
 * A datestamped value mark for an asset or liability. Observations are additive
 * history: they never replace an entity's current-value field, they record what
 * that value was on a given calendar day.
 */
export interface Observation extends BaseEntity {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Calendar day of the mark, "YYYY-MM-DD". Not a timestamp. */
  observedAt: string;
  /**
   * The value as reported, normally positive. A loan balance is stored positive;
   * the history engine subtracts it. Negative is allowed so a margin account can
   * be marked honestly.
   */
  valueCents: number;
  source: ObservationSource;
  note: string;
}

/**
 * Whether a subject reduces net worth. Lives in the domain (not in features/)
 * because the pure history engine needs it and domain must not import features.
 */
export const OBSERVATION_SUBJECT_IS_LIABILITY: Record<
  ObservationSubjectType,
  boolean
> = {
  investment_account: false,
  property: false,
  loan: true,
};
```

Add `| Observation` to the `AnyEntity` union.

- [ ] **Step 6: Add the Zod schema**

In `domain/schemas/index.ts`, add near the other schemas (before the `ENTITY_SCHEMAS` block):

```ts
/** Calendar date "YYYY-MM-DD". Permissive, like the other date fields, so one
 *  malformed spreadsheet cell never drops a whole row. */
const dateOnly = z.string();

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
```

Add to `ENTITY_SCHEMAS`: `observation: observationSchema,`.

- [ ] **Step 7: Add the sheet columns**

In `infrastructure/sync/sheet-schema.ts`, add to `SHEET_COLUMNS`:

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
```

In `infrastructure/sync/workbook-manager.ts`, add to `DOMAIN_SHEET_NAMES`:

```ts
  observation: "observations",
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run test/unit/sheet-mapper.test.ts`
Expected: PASS, all cases.

- [ ] **Step 9: Wire the repository and context**

In `infrastructure/db/repositories/index.ts`:

- Add `Observation` to the type import from `@/domain/entities`.
- Add to `repositories`: `observation: new EntityRepository<Observation>("observation"),`
- Add `repositories.observation.list()` to the `Promise.all` array in `loadFinancialContext` (append it last, and destructure it as `observations` in the same position).
- Add `observations,` to the returned object.

In `domain/context.ts`:

- Add `Observation` to the type import.
- Add `observations: Observation[];` to `FinancialContext`.
- Add `observations: [],` to `emptyContext()`.

- [ ] **Step 10: Bump the schema version**

In `lib/constants.ts`: `export const APP_SCHEMA_VERSION = 4;`

In `infrastructure/sync/migrations/index.ts`, replace the empty array:

```ts
export const MIGRATIONS: SchemaMigration[] = [
  {
    version: 4,
    name: "add observations",
    async up() {
      // No data transform needed. initWorkbook -> ensureSheets creates the new
      // tab idempotently from SHEET_COLUMNS. This entry exists so the workbook
      // stamps schema_version 4.
    },
  },
];
```

- [ ] **Step 11: Add the test fixture builder**

In `test/unit/engines/fixtures.ts`, add `Observation` to the type import and append:

```ts
export function makeObservation(over: Partial<Observation> = {}): Observation {
  return {
    id: nextId("obs"),
    ...base(),
    householdId: "hh-1",
    subjectType: "investment_account",
    subjectId: "acct-1",
    observedAt: "2026-01-31",
    valueCents: 1_000_000,
    source: "manual",
    note: "",
    ...over,
  };
}
```

- [ ] **Step 12: Run the full suite**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; all tests pass (68 existing + 1 new).

- [ ] **Step 13: Commit**

```bash
git add domain infrastructure lib/constants.ts test
git commit -m "feat(observations): add observation entity, schema and sheet mapping"
```

---

### Task 2: Calendar-date helpers

Both engines need day-level date math over `"YYYY-MM-DD"` strings. `date-fns` is already a dependency.

**Files:**
- Modify: `infrastructure/dates/date-utils.ts`
- Test: `test/unit/date-utils.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all from `@/infrastructure/dates/date-utils`:
  - `todayIsoDate(): string`
  - `addDaysIso(isoDate: string, days: number): string`
  - `diffCalendarDays(from: string, to: string): number`
  - `monthEndsBetween(from: string, to: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `test/unit/date-utils.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import {
  addDaysIso,
  diffCalendarDays,
  monthEndsBetween,
  setNowProvider,
  todayIsoDate,
} from "@/infrastructure/dates/date-utils";

describe("todayIsoDate", () => {
  afterEach(() => setNowProvider(() => new Date()));

  it("formats the injected clock as a calendar date", () => {
    setNowProvider(() => new Date(2026, 6, 24, 13, 45)); // 24 Jul 2026, local
    expect(todayIsoDate()).toBe("2026-07-24");
  });
});

describe("addDaysIso", () => {
  it("adds days and keeps the date-only format", () => {
    expect(addDaysIso("2026-07-24", 1)).toBe("2026-07-25");
    expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a leap day correctly", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysIso("2024-02-29", 1)).toBe("2024-03-01");
  });
});

describe("diffCalendarDays", () => {
  it("counts whole days forward and backward", () => {
    expect(diffCalendarDays("2026-07-01", "2026-07-24")).toBe(23);
    expect(diffCalendarDays("2026-07-24", "2026-07-24")).toBe(0);
    expect(diffCalendarDays("2026-07-24", "2026-07-01")).toBe(-23);
  });
});

describe("monthEndsBetween", () => {
  it("returns month ends in range plus the end date itself", () => {
    expect(monthEndsBetween("2026-01-15", "2026-04-10")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-10",
    ]);
  });

  it("does not duplicate an end date that is already a month end", () => {
    expect(monthEndsBetween("2026-01-15", "2026-02-28")).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
  });

  it("returns just the single date when from equals to", () => {
    expect(monthEndsBetween("2026-03-10", "2026-03-10")).toEqual(["2026-03-10"]);
  });

  it("returns an empty list when from is after to", () => {
    expect(monthEndsBetween("2026-05-01", "2026-04-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/date-utils.test.ts`
Expected: FAIL — `addDaysIso`, `diffCalendarDays`, `monthEndsBetween`, `todayIsoDate` are not exported.

- [ ] **Step 3: Implement the helpers**

In `infrastructure/dates/date-utils.ts`, extend the `date-fns` import and append the functions:

```ts
import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  endOfMonth,
  format,
  parseISO,
} from "date-fns";
```

```ts
/** Calendar-date format used for marks, trades and quotes. */
const DATE_ONLY = "yyyy-MM-dd";

/** Today as a calendar date string, "YYYY-MM-DD". Honors setNowProvider. */
export function todayIsoDate(): string {
  return format(nowProvider(), DATE_ONLY);
}

/** Add (or subtract) days to a "YYYY-MM-DD" string, same format out. */
export function addDaysIso(isoDate: string, days: number): string {
  return format(addDays(parseISO(isoDate), days), DATE_ONLY);
}

/** Whole calendar days from `from` to `to`. Negative when `to` precedes `from`. */
export function diffCalendarDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from));
}

/**
 * Ascending sample dates for a monthly series: every month end within
 * [from, to], plus `to` itself when it is not already a month end.
 * Returns [] when `from` is after `to`.
 */
export function monthEndsBetween(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cursor = endOfMonth(parseISO(from));
  while (format(cursor, DATE_ONLY) <= to) {
    const day = format(cursor, DATE_ONLY);
    if (day >= from) out.push(day);
    cursor = endOfMonth(addDays(cursor, 1));
  }
  if (out[out.length - 1] !== to) out.push(to);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/unit/date-utils.test.ts`
Expected: PASS, 8 cases.

- [ ] **Step 5: Commit**

```bash
git add infrastructure/dates/date-utils.ts test/unit/date-utils.test.ts
git commit -m "feat(dates): add calendar-date helpers for observation history"
```

---

### Task 3: Net-worth history engine

Turns observations into a net-worth curve. Pure. Reports coverage instead of inventing values for unmarked subjects.

**Files:**
- Create: `domain/engines/history/net-worth-history.ts`
- Modify: `domain/engines/index.ts`
- Test: `test/unit/engines/net-worth-history.test.ts` (create)

**Interfaces:**
- Consumes: `FinancialContext.observations`, `OBSERVATION_SUBJECT_IS_LIABILITY` (Task 1); `monthEndsBetween` (Task 2).
- Produces, from `@/domain/engines`:
  - `interface HistoryPoint { date: string; totalAssetsCents: number; totalLiabilitiesCents: number; netWorthCents: number; observedSubjects: number; totalSubjects: number; coverageBps: number }`
  - `interface HistoryOptions { from?: string; to: string; granularity?: "month" }`
  - `buildNetWorthHistory(context: FinancialContext, options: HistoryOptions): HistoryPoint[]`

- [ ] **Step 1: Write the failing test**

Create `test/unit/engines/net-worth-history.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildNetWorthHistory } from "@/domain/engines/history/net-worth-history";
import {
  makeContext,
  makeInvestment,
  makeLoan,
  makeObservation,
  makeProperty,
} from "./fixtures";

describe("net-worth-history", () => {
  it("returns an empty series when there are no observations", () => {
    const ctx = makeContext({ investmentAccounts: [makeInvestment({})] });
    expect(buildNetWorthHistory(ctx, { to: "2026-06-30" })).toEqual([]);
  });

  it("carries the last mark forward across an unmarked month", () => {
    const account = makeInvestment({ id: "acct-1" });
    const ctx = makeContext({
      investmentAccounts: [account],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-20",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-03-10",
          valueCents: 12_000_000,
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-03-31" });

    expect(series.map((p) => p.date)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    // February has no mark of its own: January's value carries forward.
    expect(series[1].netWorthCents).toBe(10_000_000);
    expect(series[2].netWorthCents).toBe(12_000_000);
  });

  it("subtracts loan balances from net worth", () => {
    const ctx = makeContext({
      properties: [makeProperty({ id: "prop-1" })],
      loans: [makeLoan({ id: "loan-1" })],
      observations: [
        makeObservation({
          subjectType: "property",
          subjectId: "prop-1",
          observedAt: "2026-01-31",
          valueCents: 50_000_000,
        }),
        makeObservation({
          subjectType: "loan",
          subjectId: "loan-1",
          observedAt: "2026-01-31",
          valueCents: 30_000_000,
        }),
      ],
    });

    const [point] = buildNetWorthHistory(ctx, { to: "2026-01-31" });
    expect(point.totalAssetsCents).toBe(50_000_000);
    expect(point.totalLiabilitiesCents).toBe(30_000_000);
    expect(point.netWorthCents).toBe(20_000_000);
  });

  it("reports coverage that rises as more subjects get marked", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      properties: [makeProperty({ id: "prop-1" })],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-31",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectType: "property",
          subjectId: "prop-1",
          observedAt: "2026-02-28",
          valueCents: 50_000_000,
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-02-28" });
    expect(series[0].observedSubjects).toBe(1);
    expect(series[0].totalSubjects).toBe(2);
    expect(series[0].coverageBps).toBe(5000);
    expect(series[1].coverageBps).toBe(10000);
  });

  it("ignores soft-deleted observations", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-31",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-02-28",
          valueCents: 99_000_000,
          deletedAt: "2026-03-01T00:00:00.000Z",
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-02-28" });
    expect(series[1].netWorthCents).toBe(10_000_000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/engines/net-worth-history.test.ts`
Expected: FAIL — cannot resolve `@/domain/engines/history/net-worth-history`.

- [ ] **Step 3: Implement the engine**

Create `domain/engines/history/net-worth-history.ts`:

```ts
/**
 * Net-worth history from observed marks.
 *
 * Pure. Money is integer US cents. Dates are calendar days, "YYYY-MM-DD".
 *
 * The engine never invents a value for a subject that has no mark on or before
 * a sample date. It carries the last known mark forward and reports how much of
 * the portfolio each point actually covers, so a sparse history reads as sparse
 * rather than as a confident line.
 */

import type { FinancialContext } from "@/domain/context";
import type { Observation, ObservationSubjectType } from "@/domain/entities";
import { OBSERVATION_SUBJECT_IS_LIABILITY } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { monthEndsBetween } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";

export interface HistoryPoint {
  /** Sample date, "YYYY-MM-DD". */
  date: string;
  totalAssetsCents: MoneyCents;
  totalLiabilitiesCents: MoneyCents;
  netWorthCents: MoneyCents;
  /** Tracked subjects that had a mark on or before this date. */
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
  /** Defaults to "month". Only monthly sampling exists today. */
  granularity?: "month";
}

interface TrackedSubject {
  subjectType: ObservationSubjectType;
  subjectId: string;
  isLiability: boolean;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function subjectKey(type: ObservationSubjectType, id: string): string {
  return `${type}:${id}`;
}

/** Every entity whose value belongs on the net-worth curve. */
function trackedSubjects(context: FinancialContext): TrackedSubject[] {
  const make = (
    subjectType: ObservationSubjectType,
    subjectId: string,
  ): TrackedSubject => ({
    subjectType,
    subjectId,
    isLiability: OBSERVATION_SUBJECT_IS_LIABILITY[subjectType],
  });

  return [
    ...context.investmentAccounts
      .filter(notDeleted)
      .map((a) => make("investment_account", a.id)),
    ...context.properties.filter(notDeleted).map((p) => make("property", p.id)),
    ...context.loans.filter(notDeleted).map((l) => make("loan", l.id)),
  ];
}

/** Latest observation on or before `date`, or undefined. `list` is ascending. */
function markOnOrBefore(
  list: Observation[] | undefined,
  date: string,
): Observation | undefined {
  if (!list) return undefined;
  let found: Observation | undefined;
  for (const o of list) {
    if (o.observedAt > date) break;
    found = o;
  }
  return found;
}

export function buildNetWorthHistory(
  context: FinancialContext,
  options: HistoryOptions,
): HistoryPoint[] {
  const observations = context.observations
    .filter(notDeleted)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (observations.length === 0) return [];

  const subjects = trackedSubjects(context);
  if (subjects.length === 0) return [];

  const from = options.from ?? observations[0].observedAt;
  const dates = monthEndsBetween(from, options.to);
  if (dates.length === 0) return [];

  const bySubject = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = subjectKey(o.subjectType, o.subjectId);
    const list = bySubject.get(key);
    if (list) list.push(o);
    else bySubject.set(key, [o]);
  }

  return dates.map((date) => {
    let totalAssetsCents = 0;
    let totalLiabilitiesCents = 0;
    let observedSubjects = 0;

    for (const subject of subjects) {
      const mark = markOnOrBefore(
        bySubject.get(subjectKey(subject.subjectType, subject.subjectId)),
        date,
      );
      if (!mark) continue;
      observedSubjects += 1;
      if (subject.isLiability) totalLiabilitiesCents += mark.valueCents;
      else totalAssetsCents += mark.valueCents;
    }

    return {
      date,
      totalAssetsCents,
      totalLiabilitiesCents,
      netWorthCents: totalAssetsCents - totalLiabilitiesCents,
      observedSubjects,
      totalSubjects: subjects.length,
      coverageBps: Math.round((observedSubjects / subjects.length) * 10_000),
    };
  });
}
```

- [ ] **Step 4: Export from the engines barrel**

In `domain/engines/index.ts`, append:

```ts
export * from "./history/net-worth-history";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/unit/engines/net-worth-history.test.ts`
Expected: PASS, 5 cases.

- [ ] **Step 6: Commit**

```bash
git add domain/engines test/unit/engines/net-worth-history.test.ts
git commit -m "feat(engines): add net-worth history engine with coverage reporting"
```

---

### Task 4: Data freshness engine

Reports how old each subject's last mark is, and a single confidence number for the plan.

**Files:**
- Create: `domain/engines/history/data-freshness.ts`
- Modify: `domain/engines/index.ts`
- Test: `test/unit/engines/data-freshness.test.ts` (create)

**Interfaces:**
- Consumes: `FinancialContext.observations` (Task 1); `diffCalendarDays` (Task 2).
- Produces, from `@/domain/engines`:
  - `type FreshnessLevel = "fresh" | "aging" | "stale"`
  - `interface FreshnessThresholds { freshDays: number; agingDays: number }`
  - `const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds`
  - `interface SubjectFreshness { subjectType: ObservationSubjectType; subjectId: string; label: string; lastObservedAt: string | null; ageDays: number | null; level: FreshnessLevel }`
  - `assessFreshness(context: FinancialContext, asOf: string, thresholds?: Partial<FreshnessThresholds>): SubjectFreshness[]`
  - `planConfidenceBps(freshness: SubjectFreshness[]): number`

- [ ] **Step 1: Write the failing test**

Create `test/unit/engines/data-freshness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  assessFreshness,
  planConfidenceBps,
} from "@/domain/engines/history/data-freshness";
import {
  makeContext,
  makeInvestment,
  makeLoan,
  makeObservation,
} from "./fixtures";

describe("assessFreshness", () => {
  it("marks a never-observed subject as stale with a null age", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", name: "Brokerage" })],
    });

    const [row] = assessFreshness(ctx, "2026-07-24");
    expect(row.subjectId).toBe("acct-1");
    expect(row.label).toBe("Brokerage");
    expect(row.lastObservedAt).toBeNull();
    expect(row.ageDays).toBeNull();
    expect(row.level).toBe("stale");
  });

  it("uses the newest mark and honors the threshold boundaries", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      observations: [
        makeObservation({ subjectId: "acct-1", observedAt: "2026-01-01" }),
        makeObservation({ subjectId: "acct-1", observedAt: "2026-06-09" }),
      ],
    });

    // 2026-06-09 -> 2026-07-24 is exactly 45 days: still fresh.
    expect(assessFreshness(ctx, "2026-07-24")[0].level).toBe("fresh");
    expect(assessFreshness(ctx, "2026-07-24")[0].ageDays).toBe(45);
    // 46 days: aging.
    expect(assessFreshness(ctx, "2026-07-25")[0].level).toBe("aging");
    // Exactly 180 days: still aging. 181: stale.
    expect(assessFreshness(ctx, "2026-12-06")[0].level).toBe("aging");
    expect(assessFreshness(ctx, "2026-12-07")[0].level).toBe("stale");
  });

  it("labels a loan by its lender", () => {
    const ctx = makeContext({
      loans: [makeLoan({ id: "loan-1", lender: "Chase" })],
    });
    expect(assessFreshness(ctx, "2026-07-24")[0].label).toBe("Chase");
  });

  it("sorts stale subjects before fresh ones", () => {
    const ctx = makeContext({
      investmentAccounts: [
        makeInvestment({ id: "fresh-1", name: "Fresh" }),
        makeInvestment({ id: "never-1", name: "Never" }),
      ],
      observations: [
        makeObservation({ subjectId: "fresh-1", observedAt: "2026-07-20" }),
      ],
    });

    const rows = assessFreshness(ctx, "2026-07-24");
    expect(rows[0].label).toBe("Never");
    expect(rows[1].label).toBe("Fresh");
  });
});

describe("planConfidenceBps", () => {
  it("is 10000 for an empty list", () => {
    expect(planConfidenceBps([])).toBe(10_000);
  });

  it("weights fresh at 1, aging at 0.5 and stale at 0", () => {
    const rows = [
      { level: "fresh" as const },
      { level: "aging" as const },
    ] as Parameters<typeof planConfidenceBps>[0];
    expect(planConfidenceBps(rows)).toBe(7500);
  });

  it("is 0 when every subject is stale", () => {
    const rows = [
      { level: "stale" as const },
      { level: "stale" as const },
    ] as Parameters<typeof planConfidenceBps>[0];
    expect(planConfidenceBps(rows)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/engines/data-freshness.test.ts`
Expected: FAIL — cannot resolve `@/domain/engines/history/data-freshness`.

- [ ] **Step 3: Implement the engine**

Create `domain/engines/history/data-freshness.ts`:

```ts
/**
 * How old the data behind the plan is.
 *
 * Pure. Dates are calendar days, "YYYY-MM-DD". The caller supplies `asOf`;
 * the engine never reads a clock.
 */

import type { FinancialContext } from "@/domain/context";
import type { ObservationSubjectType } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { diffCalendarDays } from "@/infrastructure/dates/date-utils";

export type FreshnessLevel = "fresh" | "aging" | "stale";

export interface FreshnessThresholds {
  /** Max age in days that still counts as fresh. */
  freshDays: number;
  /** Max age in days that still counts as aging. Beyond this is stale. */
  agingDays: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshDays: 45,
  agingDays: 180,
};

export interface SubjectFreshness {
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Display name of the subject entity. */
  label: string;
  lastObservedAt: string | null;
  /** null when the subject was never observed. */
  ageDays: number | null;
  level: FreshnessLevel;
}

const LEVEL_ORDER: Record<FreshnessLevel, number> = {
  stale: 0,
  aging: 1,
  fresh: 2,
};

const LEVEL_WEIGHT: Record<FreshnessLevel, number> = {
  fresh: 1,
  aging: 0.5,
  stale: 0,
};

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function levelFor(
  ageDays: number | null,
  thresholds: FreshnessThresholds,
): FreshnessLevel {
  if (ageDays === null) return "stale";
  if (ageDays <= thresholds.freshDays) return "fresh";
  if (ageDays <= thresholds.agingDays) return "aging";
  return "stale";
}

export function assessFreshness(
  context: FinancialContext,
  asOf: string,
  thresholds: Partial<FreshnessThresholds> = {},
): SubjectFreshness[] {
  const limits = { ...DEFAULT_FRESHNESS_THRESHOLDS, ...thresholds };

  const newestMark = new Map<string, string>();
  for (const o of context.observations.filter(notDeleted)) {
    const key = `${o.subjectType}:${o.subjectId}`;
    const current = newestMark.get(key);
    if (!current || o.observedAt > current) newestMark.set(key, o.observedAt);
  }

  const subjects: Array<{
    subjectType: ObservationSubjectType;
    subjectId: string;
    label: string;
  }> = [
    ...context.investmentAccounts.filter(notDeleted).map((a) => ({
      subjectType: "investment_account" as const,
      subjectId: a.id,
      label: a.name,
    })),
    ...context.properties.filter(notDeleted).map((p) => ({
      subjectType: "property" as const,
      subjectId: p.id,
      label: p.name,
    })),
    ...context.loans.filter(notDeleted).map((l) => ({
      subjectType: "loan" as const,
      subjectId: l.id,
      label: l.lender,
    })),
  ];

  const rows: SubjectFreshness[] = subjects.map((s) => {
    const lastObservedAt =
      newestMark.get(`${s.subjectType}:${s.subjectId}`) ?? null;
    const ageDays =
      lastObservedAt === null ? null : diffCalendarDays(lastObservedAt, asOf);
    return { ...s, lastObservedAt, ageDays, level: levelFor(ageDays, limits) };
  });

  // Worst first, and within a level the oldest first, so the banner leads with
  // what most needs attention.
  return rows.sort((a, b) => {
    const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (byLevel !== 0) return byLevel;
    return (b.ageDays ?? Number.MAX_SAFE_INTEGER) - (a.ageDays ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Weighted share of fresh data: fresh = 1, aging = 0.5, stale = 0. */
export function planConfidenceBps(
  freshness: Pick<SubjectFreshness, "level">[],
): BasisPoints {
  if (freshness.length === 0) return 10_000;
  const total = freshness.reduce((sum, f) => sum + LEVEL_WEIGHT[f.level], 0);
  return Math.round((total / freshness.length) * 10_000);
}
```

- [ ] **Step 4: Export from the engines barrel**

In `domain/engines/index.ts`, append:

```ts
export * from "./history/data-freshness";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/unit/engines/data-freshness.test.ts`
Expected: PASS, 7 cases.

- [ ] **Step 6: Run the full suite**

Run: `npm run typecheck && npm run test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add domain/engines test/unit/engines/data-freshness.test.ts
git commit -m "feat(engines): add data-freshness engine and plan confidence"
```

---

### Task 5: Mark-value application layer

The rule that keeps backdated marks from clobbering the current value, plus the hook the UI calls.

**Files:**
- Create: `features/observations/subject-map.ts`
- Create: `features/observations/use-mark-value.ts`
- Test: `test/unit/subject-map.test.ts` (create)

**Interfaces:**
- Consumes: `Observation`, `ObservationSubjectType` (Task 1); `useEntityActions` from `@/features/data-studio/use-entity-actions`; `useFinancialContext` from `@/lib/queries/financial-data`.
- Produces:
  - `SUBJECT_VALUE_FIELD: Record<ObservationSubjectType, string>` from `@/features/observations/subject-map`
  - `isNewestMark(observations, subjectType, subjectId, observedAt): boolean` from the same file
  - `interface MarkValueInput { householdId: string; subjectType: ObservationSubjectType; subjectId: string; observedAt: string; valueCents: number; note?: string }` from `@/features/observations/use-mark-value`
  - `useMarkValue(): (input: MarkValueInput) => Promise<void>` from the same file

- [ ] **Step 1: Write the failing test**

Create `test/unit/subject-map.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  SUBJECT_VALUE_FIELD,
  isNewestMark,
} from "@/features/observations/subject-map";
import { makeObservation } from "./engines/fixtures";

describe("SUBJECT_VALUE_FIELD", () => {
  it("maps each subject type to the field a mark writes through to", () => {
    expect(SUBJECT_VALUE_FIELD.investment_account).toBe("currentBalanceCents");
    expect(SUBJECT_VALUE_FIELD.property).toBe("currentValueCents");
    expect(SUBJECT_VALUE_FIELD.loan).toBe("currentBalanceCents");
  });
});

describe("isNewestMark", () => {
  const existing = [
    makeObservation({ subjectId: "acct-1", observedAt: "2026-03-31" }),
    makeObservation({ subjectId: "acct-1", observedAt: "2026-06-30" }),
    makeObservation({ subjectId: "acct-2", observedAt: "2026-12-31" }),
  ];

  it("is true for a mark newer than every mark on that subject", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-07-24"),
    ).toBe(true);
  });

  it("is true for a mark on the same day as the newest one", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-06-30"),
    ).toBe(true);
  });

  it("is false for a backdated mark", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-05-01"),
    ).toBe(false);
  });

  it("ignores a newer mark that belongs to a different subject", () => {
    // acct-2 carries a 2026-12-31 mark. Without subject filtering it would make
    // this acct-1 mark look backdated, so `true` here proves the filter works.
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-07-01"),
    ).toBe(true);
    // acct-2 judged on its own marks: 2026-12-31 is still ahead of 2026-07-01.
    expect(
      isNewestMark(existing, "investment_account", "acct-2", "2026-07-01"),
    ).toBe(false);
    expect(
      isNewestMark(existing, "investment_account", "acct-2", "2027-01-01"),
    ).toBe(true);
  });

  it("is true when the subject has no marks yet", () => {
    expect(
      isNewestMark(existing, "property", "prop-9", "2020-01-01"),
    ).toBe(true);
  });

  it("ignores soft-deleted marks", () => {
    const withDeleted = [
      ...existing,
      makeObservation({
        subjectId: "acct-1",
        observedAt: "2026-12-31",
        deletedAt: "2027-01-01T00:00:00.000Z",
      }),
    ];
    expect(
      isNewestMark(withDeleted, "investment_account", "acct-1", "2026-07-24"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/unit/subject-map.test.ts`
Expected: FAIL — cannot resolve `@/features/observations/subject-map`.

- [ ] **Step 3: Implement the subject map**

Create `features/observations/subject-map.ts`:

```ts
import type { Observation, ObservationSubjectType } from "@/domain/entities";

/**
 * Which persisted field a mark of this subject type writes through to.
 * Application-layer knowledge: it names storage fields, so it does not belong
 * in the pure domain. The liability flag lives in the domain instead, as
 * OBSERVATION_SUBJECT_IS_LIABILITY.
 */
export const SUBJECT_VALUE_FIELD: Record<ObservationSubjectType, string> = {
  investment_account: "currentBalanceCents",
  property: "currentValueCents",
  loan: "currentBalanceCents",
};

/**
 * True when `observedAt` is at least as recent as every existing mark on the
 * subject, so the mark should also update the entity's current value.
 * A backdated mark is history only and must not overwrite a newer value.
 */
export function isNewestMark(
  observations: Observation[],
  subjectType: ObservationSubjectType,
  subjectId: string,
  observedAt: string,
): boolean {
  return observations
    .filter(
      (o) =>
        !o.deletedAt &&
        o.subjectType === subjectType &&
        o.subjectId === subjectId,
    )
    .every((o) => o.observedAt <= observedAt);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/unit/subject-map.test.ts`
Expected: PASS, 7 cases.

- [ ] **Step 5: Implement the hook**

Create `features/observations/use-mark-value.ts`:

```ts
"use client";

import { useCallback } from "react";
import type { Observation, ObservationSubjectType } from "@/domain/entities";
import type { BaseEntity } from "@/domain/entities/base";
import { useEntityActions } from "@/features/data-studio/use-entity-actions";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { SUBJECT_VALUE_FIELD, isNewestMark } from "./subject-map";

/** Any entity that carries a numeric current-value field a mark can update. */
type ValueBearingEntity = BaseEntity & Record<string, number>;
type ValuePatch = { id: string } & Record<string, number>;

export interface MarkValueInput {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Calendar day of the mark, "YYYY-MM-DD". */
  observedAt: string;
  valueCents: number;
  note?: string;
}

/**
 * Record a value mark. Writes the Observation, and — only when the mark is the
 * newest one for that subject — also updates the subject's current-value field
 * so every existing engine keeps reading a correct "today".
 *
 * Two commands, one user action: a historical fact and a change to the current
 * value are two distinct things, and both belong in the audit log.
 */
export function useMarkValue() {
  const { create, update } = useEntityActions();
  const { data: context } = useFinancialContext();

  return useCallback(
    async (input: MarkValueInput): Promise<void> => {
      const shouldUpdateCurrent = isNewestMark(
        context.observations,
        input.subjectType,
        input.subjectId,
        input.observedAt,
      );

      await create<Observation>("observation", {
        householdId: input.householdId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        observedAt: input.observedAt,
        valueCents: input.valueCents,
        source: "manual",
        note: input.note ?? "",
      });

      if (shouldUpdateCurrent) {
        // The field name is chosen at runtime, so the patch is typed through a
        // widened entity shape rather than a specific entity interface.
        const patch = {
          id: input.subjectId,
          [SUBJECT_VALUE_FIELD[input.subjectType]]: input.valueCents,
        } as ValuePatch;
        await update<ValueBearingEntity>(input.subjectType, patch, {
          sync: true,
        });
      }
    },
    [context.observations, create, update],
  );
}
```

- [ ] **Step 6: Verify types and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add features/observations test/unit/subject-map.test.ts
git commit -m "feat(observations): add mark-value hook and newest-mark rule"
```

---

### Task 6: Mark value dialog

The shared UI for recording a mark, plus its i18n keys.

**Files:**
- Create: `components/shared/mark-value-dialog.tsx`
- Create: `lib/i18n/messages/en-US/observations.json`
- Create: `lib/i18n/messages/pt-BR/observations.json`
- Modify: `lib/i18n/config.ts`

**Interfaces:**
- Consumes: `useMarkValue`, `MarkValueInput` (Task 5); `todayIsoDate` (Task 2).
- Produces: `MarkValueDialog` from `@/components/shared/mark-value-dialog` with props:
  `{ open: boolean; onOpenChange: (open: boolean) => void; householdId: string; subjectType: ObservationSubjectType; subjectId: string; subjectLabel: string; currentValueCents: number }`

- [ ] **Step 1: Add the i18n namespace**

Create `lib/i18n/messages/en-US/observations.json`:

```json
{
  "title": "Marks",
  "description": "Datestamped values for your accounts, properties and loans. Marks build your net-worth history.",
  "markValue": "Mark value",
  "markBalance": "Mark balance",
  "dialog": {
    "title": "Mark value",
    "subtitle": "Record what {{subject}} was worth on a given day.",
    "date": "As of",
    "value": "Value",
    "note": "Note",
    "notePlaceholder": "Where this number came from",
    "cancel": "Cancel",
    "save": "Save mark",
    "saving": "Saving…"
  },
  "freshness": {
    "fresh": "Fresh",
    "aging": "Aging",
    "stale": "Stale",
    "never": "Never marked",
    "bannerTitle": "{{count}} item needs a fresh mark",
    "bannerTitle_other": "{{count}} items need a fresh mark",
    "bannerBody": "Your projection is only as good as its inputs. Oldest: {{names}}.",
    "confidence": "Data confidence",
    "lastMarked": "Last marked {{date}}",
    "ageDays": "{{count}} day ago",
    "ageDays_other": "{{count}} days ago"
  },
  "history": {
    "title": "Net worth history",
    "empty": "No marks yet. Record a value on an account, property or loan to start the history.",
    "coverage": "{{observed}} of {{total}} items marked",
    "netWorth": "Net worth"
  }
}
```

Create `lib/i18n/messages/pt-BR/observations.json`:

```json
{
  "title": "Marcações",
  "description": "Valores com data para suas contas, imóveis e financiamentos. As marcações constroem seu histórico de patrimônio.",
  "markValue": "Marcar valor",
  "markBalance": "Marcar saldo",
  "dialog": {
    "title": "Marcar valor",
    "subtitle": "Registre quanto {{subject}} valia em um dia específico.",
    "date": "Na data de",
    "value": "Valor",
    "note": "Observação",
    "notePlaceholder": "De onde veio esse número",
    "cancel": "Cancelar",
    "save": "Salvar marcação",
    "saving": "Salvando…"
  },
  "freshness": {
    "fresh": "Atual",
    "aging": "Envelhecendo",
    "stale": "Desatualizado",
    "never": "Nunca marcado",
    "bannerTitle": "{{count}} item precisa de marcação nova",
    "bannerTitle_other": "{{count}} itens precisam de marcação nova",
    "bannerBody": "Sua projeção vale o que valem os dados. Mais antigos: {{names}}.",
    "confidence": "Confiança dos dados",
    "lastMarked": "Marcado em {{date}}",
    "ageDays": "há {{count}} dia",
    "ageDays_other": "há {{count}} dias"
  },
  "history": {
    "title": "Histórico de patrimônio",
    "empty": "Nenhuma marcação ainda. Registre um valor em uma conta, imóvel ou financiamento para começar o histórico.",
    "coverage": "{{observed}} de {{total}} itens marcados",
    "netWorth": "Patrimônio líquido"
  }
}
```

- [ ] **Step 2: Register the namespace**

In `lib/i18n/config.ts`, make four edits.

After the `enEntities` import (line 23):

```ts
import enObservations from "./messages/en-US/observations.json";
```

After the `ptEntities` import (line 42):

```ts
import ptObservations from "./messages/pt-BR/observations.json";
```

In the `NAMESPACES` array, after `"entities",`:

```ts
  "observations",
```

In `resources`, after `entities: enEntities,` in the `"en-US"` block:

```ts
    observations: enObservations,
```

and after `entities: ptEntities,` in the `"pt-BR"` block:

```ts
    observations: ptObservations,
```

- [ ] **Step 3: Verify the namespace loads**

Run: `npm run typecheck`
Expected: clean. (JSON imports are typed by the existing config pattern.)

- [ ] **Step 4: Implement the dialog**

Create `components/shared/mark-value-dialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ObservationSubjectType } from "@/domain/entities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/forms/money-input";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { useMarkValue } from "@/features/observations/use-mark-value";

export interface MarkValueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  subjectLabel: string;
  /** Prefills the value field so a small correction is one keystroke. */
  currentValueCents: number;
}

export function MarkValueDialog({
  open,
  onOpenChange,
  householdId,
  subjectType,
  subjectId,
  subjectLabel,
  currentValueCents,
}: MarkValueDialogProps) {
  const { t } = useTranslation();
  const markValue = useMarkValue();

  const [observedAt, setObservedAt] = useState(todayIsoDate);
  const [valueCents, setValueCents] = useState(currentValueCents);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset to the subject's current state each time the dialog opens.
  useEffect(() => {
    if (open) {
      setObservedAt(todayIsoDate());
      setValueCents(currentValueCents);
      setNote("");
      setSaving(false);
    }
  }, [open, currentValueCents]);

  async function handleSave() {
    setSaving(true);
    try {
      await markValue({
        householdId,
        subjectType,
        subjectId,
        observedAt,
        valueCents,
        note,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("observations:dialog.title")}</DialogTitle>
          <DialogDescription>
            {t("observations:dialog.subtitle", { subject: subjectLabel })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-date">{t("observations:dialog.date")}</Label>
            <Input
              id="mark-date"
              type="date"
              value={observedAt}
              max={todayIsoDate()}
              onChange={(e) => setObservedAt(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-value">{t("observations:dialog.value")}</Label>
            <MoneyInput
              id="mark-value"
              value={valueCents}
              onChange={setValueCents}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="mark-note">{t("observations:dialog.note")}</Label>
            <Textarea
              id="mark-note"
              rows={2}
              value={note}
              placeholder={t("observations:dialog.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t("observations:dialog.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !observedAt}>
            {saving
              ? t("observations:dialog.saving")
              : t("observations:dialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Verify types and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/shared/mark-value-dialog.tsx lib/i18n
git commit -m "feat(observations): add mark value dialog and i18n namespace"
```

---

### Task 7: Wire the mark action into investments, loans and properties

**Files:**
- Modify: `app/(app)/investments/page.tsx`
- Modify: `app/(app)/loans/page.tsx`
- Modify: `app/(app)/property/page.tsx`

**Interfaces:**
- Consumes: `MarkValueDialog` (Task 6); `useFinancialContext` from `@/lib/queries/financial-data`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the mark action to the investments page**

Replace `app/(app)/investments/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function InvestmentsPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const accounts = context.investmentAccounts.filter((a) => !a.deletedAt);
  const marking = accounts.find((a) => a.id === markingId) ?? null;

  return (
    <>
      <ListScreen
        type="investment_account"
        title={t("investments:title")}
        description={t("investments:description")}
        header={
          accounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => (
                <Button
                  key={account.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setMarkingId(account.id)}
                >
                  {t("observations:markValue")}: {account.name}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      {marking ? (
        <MarkValueDialog
          open={markingId !== null}
          onOpenChange={(open) => setMarkingId(open ? markingId : null)}
          householdId={context.household?.id ?? ""}
          subjectType="investment_account"
          subjectId={marking.id}
          subjectLabel={marking.name}
          currentValueCents={marking.currentBalanceCents}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Add the mark action to the loans page**

Replace `app/(app)/loans/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function LoansPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loans = context.loans.filter((l) => !l.deletedAt);
  const marking = loans.find((l) => l.id === markingId) ?? null;

  return (
    <>
      <ListScreen
        type="loan"
        title={t("loans:title")}
        description={t("loans:description")}
        header={
          loans.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {loans.map((loan) => (
                <Button
                  key={loan.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setMarkingId(loan.id)}
                >
                  {t("observations:markBalance")}: {loan.lender}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      {marking ? (
        <MarkValueDialog
          open={markingId !== null}
          onOpenChange={(open) => setMarkingId(open ? markingId : null)}
          householdId={context.household?.id ?? ""}
          subjectType="loan"
          subjectId={marking.id}
          subjectLabel={marking.lender}
          currentValueCents={marking.currentBalanceCents}
        />
      ) : null}
    </>
  );
}
```

If the existing `loans/page.tsx` passes different i18n keys to `ListScreen` than `loans:title` / `loans:description`, keep the ones already there — only the `header` prop, the dialog and the state are new.

- [ ] **Step 3: Add the mark action to the property detail page**

`app/(app)/property/page.tsx` is a ~300-line detail page, so this is an insertion, not a rewrite.

Add the imports:

```tsx
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
```

Add the state next to the component's other `useState` calls:

```tsx
const [markOpen, setMarkOpen] = useState(false);
```

Add the button to the page header's action area (next to the existing Edit/Back controls):

```tsx
<Button variant="outline" size="sm" onClick={() => setMarkOpen(true)}>
  {t("observations:markValue")}
</Button>
```

Add the dialog just before the component's closing fragment/element, where `property` is the loaded property object:

```tsx
{property ? (
  <MarkValueDialog
    open={markOpen}
    onOpenChange={setMarkOpen}
    householdId={property.householdId}
    subjectType="property"
    subjectId={property.id}
    subjectLabel={property.name}
    currentValueCents={property.currentValueCents}
  />
) : null}
```

If the page's root is a single element rather than a fragment, wrap it in a fragment so the dialog can sit as a sibling.

- [ ] **Step 4: Verify types and lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Manually verify the round trip**

Run: `npm run dev`, open http://localhost:3000/investments, mark a value on any account.
Expected: a success toast; the account's balance in the list updates to the marked value; the Sync Center pending count increases by 2 (the observation and the account update).
Stop the dev server before any later `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat(observations): add mark value action to investments, loans and properties"
```

---

### Task 8: Observations screen, registry entry and nav

Gives observations a browsable list and an editable form through the existing Data Studio engine.

**Files:**
- Create: `app/(app)/observations/page.tsx`
- Modify: `features/data-studio/registry.tsx`
- Modify: `features/data-studio/list-screen.tsx`
- Modify: `components/layout/nav-config.ts`
- Modify: `lib/i18n/messages/en-US/entities.json`
- Modify: `lib/i18n/messages/pt-BR/entities.json`
- Modify: `lib/i18n/messages/en-US/forms.json`
- Modify: `lib/i18n/messages/pt-BR/forms.json`
- Modify: `lib/i18n/messages/en-US/nav.json`
- Modify: `lib/i18n/messages/pt-BR/nav.json`
- Modify: `lib/i18n/messages/en-US/dataStudio.json`
- Modify: `lib/i18n/messages/pt-BR/dataStudio.json`

**Interfaces:**
- Consumes: `Observation` (Task 1); the `ListScreen` component.
- Produces: `/observations` route; `ENTITY_REGISTRY.observation`.

- [ ] **Step 1: Add the i18n keys**

`entities.json` (en-US) — add:

```json
  "observation": { "singular": "Mark", "plural": "Marks" },
  "observationSubjectType": {
    "investment_account": "Investment account",
    "property": "Property",
    "loan": "Loan"
  },
  "observationSource": {
    "manual": "Manual",
    "quote": "Quote",
    "import": "Import"
  },
```

`entities.json` (pt-BR) — add:

```json
  "observation": { "singular": "Marcação", "plural": "Marcações" },
  "observationSubjectType": {
    "investment_account": "Conta de investimento",
    "property": "Imóvel",
    "loan": "Financiamento"
  },
  "observationSource": {
    "manual": "Manual",
    "quote": "Cotação",
    "import": "Importação"
  },
```

`forms.json` (en-US) — add an `observation` block and three column labels:

```json
  "observation": {
    "subjectType": { "label": "Subject type" },
    "subjectId": {
      "label": "Subject ID",
      "help": "Prefer the Mark value button on the account, property or loan."
    },
    "observedAt": { "label": "As of" },
    "valueCents": { "label": "Value" },
    "note": { "label": "Note" }
  },
```

and inside the existing `columns` object: `"subject": "Subject"`, `"asOf": "As of"`, `"lastMarked": "Last marked"`.

`forms.json` (pt-BR) — same structure with: `"Tipo de item"`, `"ID do item"`, help `"Prefira o botão Marcar valor na conta, imóvel ou financiamento."`, `"Na data de"`, `"Valor"`, `"Observação"`; columns `"Item"`, `"Data"`, `"Última marcação"`.

`nav.json` — add `"Marks": "Marks"` (en-US) and `"Marks": "Marcações"` (pt-BR) inside `items`.

`dataStudio.json` — add `modules.observation.description`: `"Datestamped values that build your net-worth history."` (en-US) / `"Valores com data que constroem seu histórico de patrimônio."` (pt-BR).

- [ ] **Step 2: Add the registry entry**

In `features/data-studio/registry.tsx`:

Add `History` to the `lucide-react` import and `Observation` to the entity type import. Add the enum option lists next to the existing ones:

```tsx
const OBSERVATION_SUBJECT_TYPES = enumOpts("observationSubjectType", [
  "investment_account",
  "property",
  "loan",
]);
```

Add the config before the `ENTITY_REGISTRY` block:

```tsx
const observation = def<Observation>({
  type: "observation",
  singular: "entities:observation.singular",
  plural: "entities:observation.plural",
  icon: History,
  href: "/observations",
  description: "dataStudio:modules.observation.description",
  inject: (ctx) => ({ householdId: ctx.householdId }),
  fields: [
    { name: "subjectType", label: "forms:observation.subjectType.label", type: "select", options: OBSERVATION_SUBJECT_TYPES, required: true },
    { name: "subjectId", label: "forms:observation.subjectId.label", type: "text", required: true, help: "forms:observation.subjectId.help" },
    { name: "observedAt", label: "forms:observation.observedAt.label", type: "date", required: true },
    { name: "valueCents", label: "forms:observation.valueCents.label", type: "money", required: true },
    { name: "note", label: "forms:observation.note.label", type: "textarea", colSpan: 2 },
  ],
  columns: [
    { label: "forms:columns.subject", render: (e) => <Badge variant="secondary">{labelOf(OBSERVATION_SUBJECT_TYPES, e.subjectType)}</Badge> },
    { label: "forms:columns.asOf", render: (e) => formatDate(e.observedAt) },
    { label: "forms:columns.value", align: "right", render: (e) => formatCents(e.valueCents) },
  ],
  primary: (e) => formatDate(e.observedAt),
  secondary: (e) => `${labelOf(OBSERVATION_SUBJECT_TYPES, e.subjectType)} · ${formatCents(e.valueCents)}`,
  searchText: (e) => `${e.subjectType} ${e.subjectId} ${e.observedAt} ${e.note}`,
});
```

Add `observation: observation as EntityConfig<never>,` to `ENTITY_REGISTRY` and `"observation",` to `DATA_STUDIO_MODULES`.

- [ ] **Step 3: Teach the list screen about the new array**

In `features/data-studio/list-screen.tsx`, add a case to `selectEntities`:

```ts
    case "observation":
      return context.observations;
```

- [ ] **Step 4: Add the route**

Create `app/(app)/observations/page.tsx`:

```tsx
"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function ObservationsPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="observation"
      title={t("observations:title")}
      description={t("observations:description")}
    />
  );
}
```

- [ ] **Step 5: Add the nav item**

In `components/layout/nav-config.ts`, add `History` to the `lucide-react` import and add to the `Overview` group, after Data Studio:

```ts
      { label: "Marks", href: "/observations", icon: History },
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all clean.

Run: `npm run dev`, open http://localhost:3000/observations.
Expected: the marks created in Task 7 are listed, in both languages, with no raw i18n keys visible.

- [ ] **Step 7: Commit**

```bash
git add app features components lib/i18n
git commit -m "feat(observations): add marks list screen, registry entry and nav"
```

---

### Task 9: Net-worth history chart on the dashboard

**Files:**
- Create: `components/charts/net-worth-history-chart.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

(No new i18n keys: the chart reuses the `observations:history.*` keys added in Task 6.)

**Interfaces:**
- Consumes: `buildNetWorthHistory`, `HistoryPoint` (Task 3); `todayIsoDate` (Task 2); `EChart`, `CHART_PALETTE`, `toDollars` from the charts module.
- Produces: `NetWorthHistoryChart` from `@/components/charts/net-worth-history-chart`, props `{ points: HistoryPoint[] }`.

- [ ] **Step 1: Implement the chart component**

Create `components/charts/net-worth-history-chart.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsCoreOption } from "echarts/core";
import type { HistoryPoint } from "@/domain/engines";
import { EChart } from "@/components/charts/echart";
import { CHART_PALETTE, toDollars } from "@/components/charts/chart-helpers";
import { formatCompactCurrency } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";

export interface NetWorthHistoryChartProps {
  points: HistoryPoint[];
  height?: number;
}

/**
 * Observed net worth over time. Point opacity encodes coverage: a faint marker
 * means most assets had no mark on that date, so the value understates reality.
 */
export function NetWorthHistoryChart({
  points,
  height = 300,
}: NetWorthHistoryChartProps) {
  const { t } = useTranslation();

  const option = useMemo<EChartsCoreOption>(() => {
    const seriesName = t("observations:history.netWorth");
    return {
      color: [CHART_PALETTE[0]],
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const rows = params as Array<{ dataIndex: number; axisValue: string }>;
          const point = points[rows[0]?.dataIndex ?? 0];
          if (!point) return "";
          const coverage = t("observations:history.coverage", {
            observed: point.observedSubjects,
            total: point.totalSubjects,
          });
          return [
            formatDate(point.date),
            `${seriesName}: ${formatCompactCurrency(toDollars(point.netWorthCents))}`,
            coverage,
          ].join("<br/>");
        },
      },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => formatDate(p.date, "MMM yy")),
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => formatCompactCurrency(v) },
        splitLine: { lineStyle: { opacity: 0.3 } },
      },
      series: [
        {
          name: seriesName,
          type: "line",
          smooth: true,
          showSymbol: true,
          symbolSize: 7,
          areaStyle: { opacity: 0.12 },
          data: points.map((p) => ({
            value: toDollars(p.netWorthCents),
            itemStyle: { opacity: 0.35 + 0.65 * (p.coverageBps / 10_000) },
          })),
        },
      ],
    };
  }, [points, t]);

  return <EChart option={option} height={height} />;
}
```

- [ ] **Step 2: Add the dashboard card**

In `app/(app)/dashboard/page.tsx`:

Add the imports:

```tsx
import { buildNetWorthHistory } from "@/domain/engines";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { NetWorthHistoryChart } from "@/components/charts/net-worth-history-chart";
```

Inside the component, next to the existing memos:

```tsx
const history = useMemo(
  () => buildNetWorthHistory(context, { to: todayIsoDate() }),
  [context],
);
```

Add a card next to the existing projection card:

```tsx
<Card className="lg:col-span-2">
  <CardHeader>
    <CardTitle>{t("observations:history.title")}</CardTitle>
  </CardHeader>
  <CardContent>
    {history.length > 0 ? (
      <NetWorthHistoryChart points={history} />
    ) : (
      <EmptyState
        title={t("observations:history.title")}
        description={t("observations:history.empty")}
      />
    )}
  </CardContent>
</Card>
```

`EmptyState` takes `{ icon?, title, description?, action?, className? }`, so the call above is correct as written. `EmptyState` and `Card`/`CardHeader`/`CardContent`/`CardTitle` are already imported by the dashboard.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

Run: `npm run dev`, open http://localhost:3000/dashboard.
Expected: with no marks, the empty state shows. After marking two accounts on different dates, a line appears with faint early points and a tooltip reading "1 of 5 items marked".

- [ ] **Step 4: Commit**

```bash
git add components/charts "app/(app)/dashboard"
git commit -m "feat(observations): add net-worth history chart to the dashboard"
```

---

### Task 10: Freshness banner on the dashboard

**Files:**
- Create: `components/shared/freshness-banner.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `assessFreshness`, `planConfidenceBps`, `SubjectFreshness` (Task 4); `todayIsoDate` (Task 2).
- Produces: `FreshnessBanner` from `@/components/shared/freshness-banner`, props `{ rows: SubjectFreshness[] }`.

- [ ] **Step 1: Implement the banner**

Create `components/shared/freshness-banner.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";
import type { SubjectFreshness } from "@/domain/engines";
import { planConfidenceBps } from "@/domain/engines";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatBps } from "@/domain/value-objects/basis-points";

export interface FreshnessBannerProps {
  rows: SubjectFreshness[];
}

/**
 * Names the data that is too old to trust. Renders nothing when everything is
 * fresh — a banner that is always on is a banner nobody reads.
 */
export function FreshnessBanner({ rows }: FreshnessBannerProps) {
  const { t } = useTranslation();
  const stale = rows.filter((r) => r.level === "stale");
  if (stale.length === 0) return null;

  const names = stale
    .slice(0, 3)
    .map((r) => r.label)
    .join(", ");

  return (
    <Alert>
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>
        {t("observations:freshness.bannerTitle", { count: stale.length })}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>{t("observations:freshness.bannerBody", { names })}</span>
        <span className="text-muted-foreground">
          {t("observations:freshness.confidence")}:{" "}
          {formatBps(planConfidenceBps(rows))}
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/observations">{t("observations:title")}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 2: Mount it on the dashboard**

In `app/(app)/dashboard/page.tsx`, add:

```tsx
import { assessFreshness } from "@/domain/engines";
import { FreshnessBanner } from "@/components/shared/freshness-banner";
```

```tsx
const freshness = useMemo(
  () => assessFreshness(context, todayIsoDate()),
  [context],
);
```

Render `<FreshnessBanner rows={freshness} />` directly under the `PageHeader`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint`
Expected: clean.

Run: `npm run dev`, open the dashboard.
Expected: with seeded accounts and no marks, the banner lists the three oldest and shows a low confidence percentage. After marking every subject today, the banner disappears.

- [ ] **Step 4: Commit**

```bash
git add components/shared/freshness-banner.tsx "app/(app)/dashboard"
git commit -m "feat(observations): add data freshness banner to the dashboard"
```

---

### Task 11: Seed data, integration test and final verification

**Files:**
- Modify: `lib/seed/demo-data.ts`
- Test: `test/integration/observation-flow.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: nothing.

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/observation-flow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { Observation } from "@/domain/entities";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend } from "@/infrastructure/google/mocks/mock-backend";
import { initWorkbook } from "@/infrastructure/sync/workbook-manager";
import { importWorkbook, pushPending } from "@/infrastructure/sync/sync-engine";
import { headersFor } from "@/infrastructure/sync/sheet-schema";

function baseObservation(): Partial<Observation> {
  return {
    householdId: "h1",
    subjectType: "investment_account",
    subjectId: "acct-1",
    observedAt: "2026-06-30",
    valueCents: 9_600_000,
    source: "manual",
    note: "Mid-year statement",
  };
}

describe("observation flow (Dexie + mock Google)", () => {
  beforeEach(async () => {
    resetDbSingleton();
    const db = getDb();
    await Promise.all(
      [
        db.entities,
        db.commands,
        db.syncQueue,
        db.locks,
        db.conflicts,
        db.metadata,
        db.snapshots,
      ].map((t) => t.clear()),
    );
    getMockBackend().resetAll();
  });

  it("writes entity, command and queue item in one transaction", async () => {
    const created = await createEntity<Observation>(
      "observation",
      baseObservation(),
    );
    const id = created.entity.id;
    const db = getDb();

    expect(await db.entities.get(id)).toBeTruthy();
    expect(
      await db.commands.where("entityId").equals(id).count(),
    ).toBe(1);
    expect(await db.syncQueue.where("entityType").equals("observation").count()).toBe(1);
  });

  it("pushes an observation to the sheet and re-imports it", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);

    const created = await createEntity<Observation>(
      "observation",
      baseObservation(),
    );
    const id = created.entity.id;

    const summary = await pushPending(clients, wb.id);
    expect(summary.pushed).toBe(1);

    const rows = getMockBackend()
      .getSheet("observations")
      .slice(1)
      .filter((row) => row[0] === id);
    expect(rows).toHaveLength(1);

    const valueCol = headersFor("observation").indexOf("value_cents");
    expect(rows[0][valueCol]).toBe("9600000");

    await getDb().entities.clear();
    await importWorkbook(clients, wb.id);

    const reimported = await repositories.observation.list();
    expect(reimported).toHaveLength(1);
    expect(reimported[0].observedAt).toBe("2026-06-30");
    expect(reimported[0].subjectType).toBe("investment_account");
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npx vitest run test/integration/observation-flow.test.ts`
Expected: PASS. Tasks 1–10 already made this work; this test locks the behaviour in. If it fails, the fault is in Task 1's plumbing, not in this test.

- [ ] **Step 3: Seed demo observations**

In `lib/seed/demo-data.ts`, after the investment-account loop, capture the brokerage account and add six monthly marks plus one property mark. Add `Observation` to the type import.

Change the account loop to keep a reference:

```ts
  let brokerageId: string | null = null;
  for (const a of accounts) {
    const { entity } = await createEntity<InvestmentAccount>(
      "investment_account",
      { householdId: household.id, ...a },
    );
    if (a.accountType === "brokerage") brokerageId = entity.id;
  }
```

Then append:

```ts
  // Six months of marks so the net-worth history has a curve on first run.
  if (brokerageId) {
    const marks: Array<[string, number]> = [
      ["2026-01-31", 88_000_00],
      ["2026-02-28", 90_500_00],
      ["2026-03-31", 89_200_00],
      ["2026-04-30", 92_800_00],
      ["2026-05-31", 94_100_00],
      ["2026-06-30", 96_000_00],
    ];
    for (const [observedAt, valueCents] of marks) {
      await createEntity<Observation>("observation", {
        householdId: household.id,
        subjectType: "investment_account",
        subjectId: brokerageId,
        observedAt,
        valueCents,
        source: "manual",
        note: "",
      });
    }
  }

  await createEntity<Observation>("observation", {
    householdId: household.id,
    subjectType: "property",
    subjectId: townhouse.id,
    observedAt: "2026-06-30",
    valueCents: townhouse.currentValueCents,
    source: "manual",
    note: "",
  });
```

- [ ] **Step 4: Verify the seed renders**

Run: `npm run dev`, clear site data in the browser, reload so the seed runs.
Expected: the dashboard shows a six-point net-worth history and a freshness banner naming the unmarked accounts.

- [ ] **Step 5: Run the full verify loop**

Run: `npm run typecheck && npm run test && npm run lint`
Expected: typecheck clean, all tests pass (68 existing + the new unit and integration tests), lint clean.

- [ ] **Step 6: Verify the production build**

Stop `npm run dev` first, then run: `npm run build`
Expected: static export succeeds, including the new `/observations` route.

- [ ] **Step 7: Commit**

```bash
git add lib/seed test/integration/observation-flow.test.ts
git commit -m "feat(observations): seed demo marks and add integration coverage"
```

---

## Done criteria

- [ ] `observation` round-trips: local command → sync queue → `observations` sheet → re-import.
- [ ] Marking a value updates the subject's current value; a backdated mark does not.
- [ ] The dashboard shows a net-worth history line with coverage-weighted points, and an empty state when there are no marks.
- [ ] The freshness banner names stale subjects and hides itself when everything is fresh.
- [ ] `/observations` lists and edits marks in both en-US and pt-BR with no raw keys visible.
- [ ] `npm run typecheck && npm run test && npm run lint` pass; the pre-existing 68 tests are untouched and green.
- [ ] `npm run build` produces the static export.
