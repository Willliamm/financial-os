---
name: add-entity
description: Use when adding a new domain entity (a new data type like "vehicle", "goal", "insurance_policy") to the financial-os app. Covers the full wiring — TypeScript interface, Zod schema, sheet columns, repository, FinancialContext, command types, Data Studio registry, i18n keys, route page, and a unit test. Invoke when the user says "add an entity", "add a new model/table", "create a new domain type", or names a new financial data type to track.
---

# Add a new domain entity

This app stores every domain type in one consistent pipeline: a TypeScript
interface, a Zod schema, Google Sheets columns, an IndexedDB repository, the
in-memory `FinancialContext`, command types, a Data Studio CRUD registry config,
i18n keys, a route page, and a test. You must touch all of them or the build
breaks — several `Record<EntityType, ...>` maps are exhaustive and `tsc` will
fail if you miss one.

## Conventions you MUST follow
- Money is always integer **cents**. Field/property names end in `Cents`.
- Percentages and rates are always integer **basis points** (bps). 1% = 100 bps.
  Field/property names end in `Bps`.
- Dates are ISO strings (`string | null`).
- TypeScript fields are `camelCase`. Sheet column headers are `snake_case`.
- Enum option labels in the registry are **i18n keys**, not display text.
- Pick a concrete example for the recipe below. This guide uses a new entity
  named `vehicle` (type `"vehicle"`, interface `Vehicle`). Replace it everywhere.

## Pre-read (do this first)
Open these to copy the exact existing pattern. `income_source` is the simplest
full example; copy its shape:
- `domain/entities/index.ts` and `domain/entities/base.ts`
- `domain/schemas/index.ts`
- `infrastructure/sync/sheet-schema.ts`
- `infrastructure/db/repositories/index.ts`
- `domain/context.ts`
- `domain/commands/index.ts`
- `features/data-studio/registry.tsx` and `features/data-studio/types.ts`
- `lib/i18n/messages/en-US/entities.json`, `.../forms.json`, `.../dataStudio.json`
- `app/(app)/income/page.tsx`

## Steps

### 1. Entity interface + base maps — `domain/entities/`
1a. In `domain/entities/index.ts`, add the interface. Extend `BaseEntity`. Add an
`householdId: string` link (most entities belong to a household). Use `...Cents`
and `...Bps` suffixes. Add any enums as `export type` unions above the interface.
```ts
export type VehicleStatus = "owned" | "leased" | "sold";

export interface Vehicle extends BaseEntity {
  householdId: string;
  name: string;
  status: VehicleStatus;
  currentValueCents: number;
  loanBalanceCents: number;
  apprDepreciationRateBps: number;
}
```
Add `Vehicle` to the `AnyEntity` union at the bottom of the file.

1b. In `domain/entities/base.ts`, add the literal to the `EntityType` union, and
add an entry to BOTH `ENTITY_SHEET` (tab name, snake_case plural) and
`ENTITY_LOCK_TYPE` (usually the same string as the type):
```ts
// EntityType union: add | "vehicle"
// ENTITY_SHEET:     vehicle: "vehicles",
// ENTITY_LOCK_TYPE: vehicle: "vehicle",
```

### 2. Zod schema + ENTITY_SCHEMAS — `domain/schemas/index.ts`
Add the schema using the shared helpers (`baseEntityShape`, `idString`,
`nonNegCents`, `cents`, `bps`, `rateBps`). Give defaults that match the
interface. Add enum schemas if needed. Then add the entry to `ENTITY_SCHEMAS`.
```ts
export const vehicleStatusSchema = z.enum(["owned", "leased", "sold"]);

export const vehicleSchema = z.object({
  ...baseEntityShape,
  householdId: idString,
  name: z.string().min(1),
  status: vehicleStatusSchema.default("owned"),
  currentValueCents: nonNegCents,
  loanBalanceCents: nonNegCents.default(0),
  apprDepreciationRateBps: bps.default(-1500),
});
// ENTITY_SCHEMAS: vehicle: vehicleSchema,
```
Note: `nonNegCents` rejects negatives; use `cents` if the value can be negative.
`rateBps` clamps 0–1,000,000; use `bps` for rates that can be negative
(like depreciation).

### 3. Sheet columns — `infrastructure/sync/sheet-schema.ts`
Add a `vehicle:` entry to `SHEET_COLUMNS`. Use `entityColumns([...])` so the
leading (`id`, `version`) and trailing (`created_at` … `updated_by`) columns are
added automatically. List only the business columns, in order, with snake_case
headers that match the camelCase field:
```ts
vehicle: entityColumns([
  col("household_id", "householdId", "string"),
  col("name", "name", "string"),
  col("status", "status", "string"),
  col("current_value_cents", "currentValueCents", "number"),
  col("loan_balance_cents", "loanBalanceCents", "number"),
  col("appr_depreciation_rate_bps", "apprDepreciationRateBps", "number"),
]),
```
`type` is `"string" | "number" | "boolean"` — booleans and dates use those.

### 4. Repository + context loader — `infrastructure/db/repositories/index.ts`
4a. Import the `Vehicle` type. Add a repository to the `repositories` object:
```ts
vehicle: new EntityRepository<Vehicle>("vehicle"),
```
4b. In `loadFinancialContext()`, add `repositories.vehicle.list()` to the
`Promise.all([...])` array, add a matching `vehicles` binding in the destructure,
and return `vehicles` in the result object.

### 5. FinancialContext — `domain/context.ts`
Import `Vehicle`. Add `vehicles: Vehicle[];` to the `FinancialContext`
interface AND `vehicles: [],` to `emptyContext()`. Keep both in sync with
the loader in step 4b.

### 6. Command types — `domain/commands/index.ts`
6a. Add the three command-type strings to the `CommandType` union:
`"CreateVehicle" | "UpdateVehicle" | "DeleteVehicle"`.
6b. Add the PascalCase entry to `ENTITY_PASCAL`: `vehicle: "Vehicle",`.
(`commandTypeFor` derives the strings from this map, so both must agree.)

### 7. Data Studio registry + i18n — `features/data-studio/registry.tsx`
7a. Import an icon from `lucide-react` and the `Vehicle` type. Build enum option
lists with `enumOpts("vehicleStatus", ["owned","leased","sold"])`.
7b. Add a `def<Vehicle>({...})` config. Copy the `income` config's shape. Set
`type`, `singular`/`plural` (entities namespace keys), `icon`, `href`
(e.g. `/vehicles`), `description` (dataStudio key), `inject` (usually
`(ctx) => ({ householdId: ctx.householdId })`), `fields`, `columns`, `primary`,
`secondary`, `searchText`. Use `type: "money"` for `...Cents` fields and
`type: "percent"` for `...Bps` fields — the form converts display↔storage. All
`label`/`singular`/`plural`/`description`/section/column labels are i18n keys.
7c. Register it in `ENTITY_REGISTRY` (`vehicle: vehicle as EntityConfig<never>,`)
AND in the `DATA_STUDIO_MODULES` array.

7d. Add the i18n keys to BOTH locales (`en-US` and `pt-BR`):
- `lib/i18n/messages/<locale>/entities.json`: `vehicle.singular`, `vehicle.plural`,
  and a `vehicleStatus` object mapping each enum value to a label.
- `lib/i18n/messages/<locale>/forms.json`: a `vehicle` object with `<field>.label`
  for every form field; add any new `columns.*` keys you referenced.
- `lib/i18n/messages/<locale>/dataStudio.json`: `modules.vehicle.description`.
- `lib/i18n/messages/<locale>/<page>.json` (new file, e.g. `vehicles.json`): a
  `title` and `description` for the route page. Then register the new namespace
  in `lib/i18n/config.ts` — add the import, add it to the `resources` map for
  both locales, and add the name to the `NAMESPACES` array.

Pt-BR values must be real Portuguese translations, not copies of the English.

### 8. Route page — `app/(app)/vehicles/page.tsx`
Create the page. It is a thin client component that renders `ListScreen` with
the entity type. Copy `app/(app)/income/page.tsx`:
```tsx
"use client";

import { useTranslation } from "react-i18next";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function VehiclesPage() {
  const { t } = useTranslation();
  return (
    <ListScreen
      type="vehicle"
      title={t("vehicles:title")}
      description={t("vehicles:description")}
    />
  );
}
```
If there is a nav/sidebar config, add the new route there too (check
`lib/i18n/messages/*/nav.json` and any nav component).

### 9. Unit test
Tests use **vitest** (`*.test.ts`). Add a test next to the code it covers, e.g.
`domain/schemas/vehicle.test.ts`. At minimum assert the Zod schema parses a valid
row, applies defaults, and that the entity is wired into the exhaustive maps:
```ts
import { describe, expect, it } from "vitest";
import { vehicleSchema, ENTITY_SCHEMAS } from "@/domain/schemas";
import { ENTITY_SHEET } from "@/domain/entities/base";
import { SHEET_COLUMNS } from "@/infrastructure/sync/sheet-schema";

describe("vehicle entity", () => {
  it("parses and defaults", () => {
    const v = vehicleSchema.parse({
      id: "v1", version: 0, createdAt: "", updatedAt: "",
      householdId: "h1", name: "Truck", currentValueCents: 2_500_000,
    });
    expect(v.status).toBe("owned");
    expect(v.loanBalanceCents).toBe(0);
  });
  it("is registered in every map", () => {
    expect(ENTITY_SCHEMAS.vehicle).toBeDefined();
    expect(ENTITY_SHEET.vehicle).toBe("vehicles");
    expect(SHEET_COLUMNS.vehicle.length).toBeGreaterThan(0);
  });
});
```

### 10. Verify
Run both from the repo root:
```
npm run typecheck
npm run test
```
`tsc` catches any missing entry in the exhaustive `Record<EntityType, ...>` maps
(base.ts, schemas, sheet-schema, commands). Fix every reported gap, then re-run
until both pass.

## Checklist (every item or the build breaks)
- [ ] Interface + enums in `domain/entities/index.ts`, added to `AnyEntity`
- [ ] `EntityType`, `ENTITY_SHEET`, `ENTITY_LOCK_TYPE` in `base.ts`
- [ ] Zod schema + `ENTITY_SCHEMAS` in `domain/schemas/index.ts`
- [ ] `SHEET_COLUMNS` entry in `sheet-schema.ts`
- [ ] Repository + `loadFinancialContext` in `repositories/index.ts`
- [ ] `FinancialContext` + `emptyContext` in `domain/context.ts`
- [ ] `CommandType` union + `ENTITY_PASCAL` in `domain/commands/index.ts`
- [ ] Registry `def` + `ENTITY_REGISTRY` + `DATA_STUDIO_MODULES` in `registry.tsx`
- [ ] i18n keys in entities/forms/dataStudio JSON for en-US AND pt-BR
- [ ] New page namespace JSON + registered in `lib/i18n/config.ts`
- [ ] Route page under `app/(app)/<route>/page.tsx`
- [ ] Unit test
- [ ] `npm run typecheck` and `npm run test` both pass
