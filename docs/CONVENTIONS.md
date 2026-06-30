# Financial OS — Coding Conventions

This file lists the concrete coding rules for the project. Follow them exactly.
They keep the data correct, the layers clean, and the app fully offline.

If a rule here conflicts with habit or a library default, this file wins.

---

## 1. Money is stored as integer US cents

Never store money as a float (decimal) like `1060.50`. Floats lose accuracy.

- Store every money value as a whole number of **US cents** (an integer).
- `$1,060.50` is stored as `106050`.
- `$0.01` is stored as `1`.
- Currency is always **USD**. See rule 8 for why this never changes.

```ts
// Domain / DB: integer cents
const homePrice = 106050; // means $1,060.50

// WRONG — never store dollars as a float
const homePrice = 1060.5;
```

Convert at the **UI edge only**:

- `components/forms/money-input.tsx` turns user dollars into cents on input.
- The same component turns cents back into dollars for display.
- Math, storage, and the domain layer stay in cents the whole time.

Use the helpers in `infrastructure/money/` for all conversion and formatting.
Do not hand-roll `value / 100` in feature or component code.

---

## 2. Percentages are stored as integer basis points (bps)

A **basis point** is one hundredth of one percent. So `1%` = `100` bps.

- Store every rate/percent as a whole number of basis points (an integer).
- `5.25%` is stored as `525`.
- `100%` is stored as `10000`.
- `0.01%` is stored as `1`.

```ts
// Domain / DB: integer basis points
const interestRate = 525; // means 5.25%

// WRONG — never store percent as a float
const interestRate = 5.25;
```

Convert at the **UI edge only**, in `components/forms/percent-input.tsx`.
Use the helpers in `infrastructure/money/` (or the matching value-object) to
convert and format. Do not divide by `100` or `10000` in feature code.

---

## 3. Every mutation is a Command

A **mutation** is any write: create, update, or delete an entity.
You must never call `db.table.put(...)` directly from a feature or component.

All writes go through **one** function:

```ts
// infrastructure/db/command-service.ts
applyCommand(command);
```

`applyCommand` runs **one Dexie transaction** that writes three things together:

1. The entity row (the real data change).
2. An **audit command** record (what changed, when, and the payload).
3. A **sync-queue** item (the pending Google Sheets sync).

All three succeed or all three fail. There is no half-written state.

Rules:

- Build a typed command object, then call `applyCommand`.
- Never write an entity without its audit command and sync-queue item.
- Never split these three writes across more than one transaction.

---

## 4. Local write always precedes any sync

The **operational database** is IndexedDB (Dexie), on the device.
Google Sheets is an **optional** backup/sync target, not the source of truth.

- The local Dexie write must finish first and must succeed.
- Only after that does the Sync Engine push the queued item to Google Sheets.
- If sync fails or the user is offline, the local data is still correct.
- The app must work fully with no network and no Google account.

Never block a user action while waiting for a Google Sheets call.

---

## 5. The domain layer is pure

`domain/` holds entities, Zod schemas, commands, value-objects, and the
calculation **engines** (loans, real-estate, net-worth, fire, tax, scenarios,
retirement, analysis, insights).

The domain layer must have **no** imports from:

- React (no components, no hooks, no JSX).
- Dexie / IndexedDB.
- Google clients (mock or real).
- Any browser-only API.

Why: the engines are pure functions. Same input gives same output.
This makes them easy to test (vitest) and safe to reuse anywhere.

Data flow is one direction:

```
UI  ->  Application (features/, lib/stores)  ->  Domain (entities, schemas, engines)
     ->  Dexie (IndexedDB)  ->  Sync Engine  ->  Google Sheets (optional)
```

UI may call the domain. The domain may not call the UI, the DB, or Google.

---

## 6. One Zod schema per entity

Every entity has a **Zod** schema in `domain/schemas/`. Zod checks data shape
and types at runtime.

- The schema is the single source of truth for the entity's shape.
- Derive the TypeScript type from the schema with `z.infer`, do not hand-write it.
- Validate at the boundaries: data read from Dexie, data read from Google
  Sheets, and form input before it becomes a command.
- Money fields are integer cents. Percent fields are integer bps. Enforce this
  in the schema (for example `z.number().int()`).

```ts
export const LoanSchema = z.object({
  id: z.string(),
  principalCents: z.number().int(),   // cents, not dollars
  rateBps: z.number().int(),          // basis points, not percent
  // ...
});
export type Loan = z.infer<typeof LoanSchema>;
```

---

## 7. Data Studio uses the registry CRUD pattern

`features/data-studio/` is a **registry-driven** CRUD engine. CRUD means
create, read, update, delete.

- You do **not** write a new page or table component for each entity.
- You register an entity in the registry: its Zod schema, its columns, its
  labels, and its command builders.
- The generic engine renders the table, the form, and the edit flow from that
  registration, and routes all writes through `applyCommand` (rule 3).

To add a new manageable entity, add a registry entry. Do not copy-paste a page.

---

## 8. Currency stays USD across locales

The app supports `en-US` and `pt-BR`. Locale changes **number formatting only**.

- Currency is always USD. There is no BRL conversion, real or fake.
- `pt-BR` formats `$1,060,500.00` as `US$ 1.060.500,00` — same money, new format.
- Never multiply by an exchange rate to "convert" the displayed currency.

---

## 9. Client-component default

This is a static export SPA. There is no server runtime.

- Treat components as **client** components. Add `"use client"` where React
  state, effects, browser APIs, or event handlers are used.
- Do not use Server Components for data, Server Actions, API routes, or
  middleware. None of these exist in a static export. See ADR 0001.
- All data comes from Dexie (IndexedDB) on the client, through TanStack Query.

---

## 10. Dynamic routes use query params, not `[id]`

Static export cannot prerender dynamic `[id]` routes.

- Detail pages read an id from the URL query string.
- Use `/property?id=...` and `/scenario?id=...`, not `/property/[id]`.
- Read the id with the client-side router/search-params, on the client only.

---

## 11. Naming and file conventions

- Files and folders: `kebab-case` (for example `command-service.ts`,
  `money-input.tsx`).
- React components: `PascalCase` names.
- Functions and variables: `camelCase`.
- Types, interfaces, Zod schema constants: `PascalCase` (for example
  `LoanSchema`, `NetWorthSnapshot`).
- Money fields end in `Cents`. Percent/rate fields end in `Bps`.
- Keep a feature's code under its `features/<name>/` folder.
- Keep engines pure and under `domain/engines/<area>/`.
- Use the id helpers in `lib/ids`; do not generate ids inline.
- Use `lib/logger`; do not call `console.log` directly in shipped code.

---

## 12. i18n key conventions (react-i18next)

The project uses **react-i18next** with two locales: `en-US` and `pt-BR`.

- Locale detection is **manual**, in `lib/i18n/config.ts`. Do not add the
  `i18next-browser-languagedetector` plugin — it breaks key resolution with
  i18next 26. See ADR 0006.
- All user-facing UI text comes from a translation key. No hard-coded strings
  in components.
- Keys are namespaced by area and use dot notation, lower-camel segments:
  `dashboard.netWorth.title`, `loans.form.rateLabel`, `common.actions.save`.
- Add the key to **both** `en-US` and `pt-BR` resource files. Missing keys are
  a bug.
- **Exception — domain-generated text is English-only.** Engine insights,
  alerts, and scenario-comparison metrics are produced inside the pure domain
  layer (rule 5). Passing i18n keys into the pure layer would break its purity,
  so this dynamic text stays in English in both locales. This is intentional.

---

## 13. Build and test gotchas

- Run `npm run typecheck` (`tsc --noEmit`), `npm run lint`, and `npm run test`
  (vitest, 68 tests) before sending changes.
- **Never run `npm run build` while `npm run dev` is running.** Both use the
  `.next` folder. The build fails with
  `Cannot find module for page: /_not-found/page`. Stop dev first.
- `npm run build` produces the static export in `out/`.

---

## Quick checklist for any change

- [ ] Money stored as integer cents, percent as integer bps.
- [ ] Dollars/percent appear only via `money-input` / `percent-input`.
- [ ] Every write goes through `applyCommand` (entity + audit + sync queue).
- [ ] Local Dexie write happens before any Google Sheets sync.
- [ ] No React/Dexie/Google imports inside `domain/`.
- [ ] Entity has a Zod schema; type comes from `z.infer`.
- [ ] New CRUD entity added via the data-studio registry, not a copy-paste page.
- [ ] New UI text has keys in both `en-US` and `pt-BR`.
- [ ] Detail pages use `?id=` query params, not `[id]` routes.
- [ ] `typecheck`, `lint`, and `test` all pass.
