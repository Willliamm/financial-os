# Contributing to Financial OS

Financial OS is an advanced personal-finance planning web app. It tracks net worth,
income, expenses, real estate, loans, investments, retirement, tax planning, scenarios,
and projections.

The app is a static, offline-first single-page app (SPA). It runs fully in the browser.
There is no server, no backend, and no database on a server. Your data lives in the
browser (IndexedDB) and can optionally sync to Google Sheets.

This guide explains how to set up, develop, test, and ship the app.

## Prerequisites

- **Node.js 22** (LTS). Check with `node --version`.
- **npm** (ships with Node). Check with `npm --version`.
- A modern browser (Chrome, Edge, or Firefox).

## Install

Clone the repo, then install dependencies.

```bash
npm install
```

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload. Open the printed URL. |
| `npm run build` | Build the static export to `out/`. |
| `npm run test` | Run the test suite (Vitest). 68 tests should pass. |
| `npm run typecheck` | Type-check the code (`tsc --noEmit`). No emit. |
| `npm run lint` | Lint the code. |

## The dev / build / test loop

A normal change follows these steps.

1. Run `npm run dev`. Edit code. The browser reloads on save.
2. Run `npm run typecheck` to catch type errors.
3. Run `npm run lint` to catch style issues.
4. Run `npm run test` to confirm logic still works.
5. Run `npm run build` to confirm the static export works.

### IMPORTANT: never build while dev is running

Do **not** run `npm run build` while `npm run dev` is running.

Both use the `.next` folder. If they run at the same time, the build fails with:

```
Cannot find module for page: /_not-found/page
```

Stop the dev server first. Then run the build.

## Demo mode (no Google login needed)

The app runs in **demo mode** by default. Demo mode uses an in-memory mock Google client
and seeds sample data. You do not need a Google account or OAuth to develop.

Just run `npm run dev` and use the app. Sample data loads on first run.

## Code style

The codebase uses TypeScript in **strict** mode. Keep full type safety.

### Money and percentages (read this first)

These conventions are not optional. They prevent rounding bugs.

- **Money is stored as integer US cents.** Example: `$1,060,500.00` is stored as
  `106050000`. Never store dollars as a float.
- **Percentages are stored as integer basis points (bps).** One basis point is
  1/100th of a percent. Example: `5.25%` is stored as `525`.
- Dollars and percents appear **only at the UI edge**. Convert in the input
  components: `components/forms/money-input.tsx` and `components/forms/percent-input.tsx`.

### Commands (every mutation)

Every data change is a **command**. Do not write to the database directly.

Use `applyCommand` in `infrastructure/db/command-service.ts`. In one Dexie transaction it:

1. Writes the entity.
2. Writes an audit command (the history record).
3. Writes a sync-queue item (the pending Google Sheets sync).

The **local write always happens first**. Google Sheets sync happens later, never before.

### The domain layer is pure

Code in `domain/` has **no** React, Dexie, or Google imports. It is pure TypeScript:
entities, Zod schemas, value objects, and calculation engines. Keep it that way.

For the full list of rules, see:

- `docs/CONVENTIONS.md` — the detailed convention reference.
- `CLAUDE.md` — AI assistant guidance and key gotchas.

## How to add a screen or entity

The app uses a registry-driven CRUD engine in `features/data-studio`. Most new entities
plug into it instead of needing hand-written screens.

1. **Define the domain.** Add the entity type, a Zod schema, and any value objects in
   `domain/entities` and `domain/schemas`.
2. **Add a command.** Wire the create/update/delete through `applyCommand` in
   `infrastructure/db/command-service.ts`.
3. **Map for sync.** Add the Google Sheets mapping in
   `infrastructure/sync/sheet-mapper`.
4. **Register the entity.** Add it to the data-studio registry so the CRUD engine can
   list, create, edit, and delete it.
5. **Add a route (if needed).** Routes live in `app/`. The `(app)` group holds the main
   screens (dashboard, income, expenses, properties, loans, investments, retirement,
   tax-planning, scenarios, projections, sync, settings).
6. **Add translations.** Add `en-US` and `pt-BR` keys for any new UI text.

### Detail pages use query params

Static export cannot pre-render dynamic `[id]` routes. So detail pages use query
parameters, not path segments. Examples: `/property?id=...` and `/scenario?id=...`.

## How tests are organized

Tests use **Vitest** and live in `test/`.

- `test/unit` — pure unit tests (mostly domain engines and value objects).
- `test/integration` — integration tests (commands, sync, database flows).

Run all tests with `npm run test`. Keep the suite green (68 tests pass).

When you add a calculation engine or a command, add tests for it.

## Internationalization (i18n)

The app supports `en-US` and `pt-BR` via `react-i18next`.

Two things to know:

1. **Locale detection is manual.** It lives in `lib/i18n/config.ts`. The
   `i18next-browser-languagedetector` plugin breaks key resolution with i18next 26, so we
   do not use it.
2. **Currency stays USD.** Only the number format changes per locale. For example,
   `pt-BR` shows `US$ 1.060.500,00`. We never fake a BRL conversion.

Some dynamic text from the domain layer (engine insights, alerts, scenario comparison
metrics) is **English-only** on purpose. Translating it would require passing i18n keys
out of the pure domain layer, which we avoid.

## Deployment

The app is a static export. It can host on any static host.

1. Run `npm run build`. The output goes to `out/`.
2. Upload `out/` to your static host (GitHub Pages, Netlify, Vercel static, S3, etc.).

For **GitHub Pages**, a workflow builds the export and publishes `out/` on push to the
main branch. Static hosts need no server runtime — just serve the files.

The app works offline after first load. A hand-rolled service worker at `public/sw.js`
caches assets. It registers in production builds only.
