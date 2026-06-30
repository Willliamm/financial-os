# Financial OS — AI Context

Advanced personal-finance planning web app: net worth, income, expenses, real
estate, loans, investments, retirement, tax planning, scenarios and long-term
projections. It is a **fully static, offline-first SPA** — there is no backend
of our own. The runtime database is IndexedDB; Google Sheets is an optional
external backup reached only through the Sync Engine.

> Read this on every session. Keep it accurate. If a fact here drifts from the
> code, fix the code or fix this file — do not act on stale context.

## Stack

Next.js 15 (App Router, `output: "export"`) · React 19 · TypeScript strict ·
Tailwind v4 · shadcn/ui (Radix) · Zustand · TanStack Query · Zod ·
Dexie/IndexedDB · Apache ECharts (lazy-loaded) · react-i18next (en-US + pt-BR) ·
Vitest + Testing Library + fake-indexeddb. PWA via a hand-rolled service worker
at `public/sw.js` (registered in production only).

## Architecture & layer boundaries

```
UI → Application → Domain → Dexie (IndexedDB) → Sync Engine → Google Sheets
```

- **UI** (`app/`, `components/`) — screens, forms, charts, tables, lock banners,
  sync status. No financial rules live here.
- **Application** (`features/`, `lib/stores/`, `lib/queries/`) — orchestrates use
  cases: builds Commands, runs validation, persists locally, triggers sync, maps
  entities to view models. State is small Zustand stores; reads cache via
  TanStack Query over Dexie.
- **Domain** (`domain/`) — entities, value objects, Zod schemas, the Command
  model, and pure calculation **engines**. PURE: **no React, Dexie, or Google
  imports**.
- **Infrastructure** (`infrastructure/`) — Dexie + repositories, the command
  service, Google clients (mock + real), and the Sync Engine.

The Sync Engine is the seam that would let us swap Sheets for a real backend
later without rewriting the product.

## NON-NEGOTIABLE conventions

- **Money is integer US CENTS. Percentages are integer BASIS POINTS (bps).**
  Dollars and percent appear ONLY at the UI edge — convert in
  `components/forms/money-input.tsx` and `percent-input.tsx`. Never store or do
  domain math in dollars/floats.
- **Every mutation is a Command.** Go through
  `infrastructure/db/command-service.ts` `applyCommand`. It writes the entity +
  an audit `CommandRecord` + a `SyncQueueItem` in ONE Dexie transaction.
- **Local write ALWAYS precedes any Google Sheets sync.** The local Dexie write
  is the source of truth; sync is downstream and batched.
- **Domain purity.** Keep `domain/` free of React/Dexie/Google. Engines are pure
  functions. See `domain/AGENTS.md` if present.
- **No SSR / no backend.** `next.config.ts` is `output: "export"`. No API
  routes, no middleware, no server actions. Do not add them.
- **Client components.** Interactive code is client-side; this is a static SPA.
- **Currency stays USD across locales.** Only number formatting localizes
  (pt-BR shows `US$ 1.060.500,00`). Never do a fake BRL conversion.

## Where things live

```
app/            Routes. login at "/"; the (app) group has dashboard, data-studio,
                income, expenses, properties, property, loans, investments,
                retirement, tax-planning, scenarios, scenario, projections,
                sync, settings.
components/     ui, layout, charts, shared, sync, locks, forms, settings
features/       data-studio (registry-driven CRUD engine), properties, projections
domain/         entities, schemas, commands, value-objects, context, and
                engines/ (loans, real-estate, net-worth, fire, tax, scenarios,
                retirement, analysis, insights)
infrastructure/ db, google (mock + real clients), sync (sheet-mapper, sync-engine,
                lock-manager, conflict-resolver, migrations), money, dates
lib/            stores, queries, i18n, seed, constants, env, ids, logger, session, utils
test/           unit + integration (vitest)
docs/           architecture, sync-engine, google-sheets-schema, spec-ptbr-v3
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:3000. |
| `npm run build` | Static export to `out/`. |
| `npm run test` | Vitest suite (68 tests pass). |
| `npm run typecheck` | `tsc --noEmit` (strict). |
| `npm run lint` | ESLint. |

Verify loop before declaring done: `npm run typecheck && npm run test && npm run lint`.

## Data flow for an edit

1. User opens an entity → app acquires a soft **lock** for `type:id` (TTL +
   heartbeat, so two tabs cooperate).
2. The generic form validates with Zod and builds a payload already in cents/bps.
3. `applyCommand` persists the entity (dirty) + command + sync-queue item in one
   Dexie transaction.
4. TanStack Query is invalidated; the UI shows "local changes".
5. The Sync Engine pushes pending items to Sheets in batches and marks records
   synced; conflicts go to the Conflict Center.
6. The lock is released on save/cancel.

In **demo mode** (default, no `NEXT_PUBLIC_GOOGLE_CLIENT_ID`), `getGoogleClients()`
returns in-memory MOCK clients with seeded sample data — fully offline, no OAuth.
The mock persists its "remote" workbook to `localStorage` so the sync round-trip
survives reloads.

## Adding a feature / a new entity

Most CRUD screens are driven by the **Data Studio registry**
(`features/data-studio`). To add an entity, prefer wiring it into the registry
rather than hand-building a screen: define the Zod schema + entity in `domain/`,
add the registry entry, route the mutation through `applyCommand`, and add the
Sheets mapping in `infrastructure/sync/sheet-mapper`. This keeps screens tiny and
consistent. See `features/data-studio/AGENTS.md` if present.

## Testing

Vitest with `fake-indexeddb`. Unit-test the pure engines in `domain/engines/`;
use integration tests for the command/sync path. Keep the suite green (currently
68 passing).

## i18n

react-i18next, locales **en-US** and **pt-BR**. Add keys to BOTH locales.
Currency is always USD; only number formatting localizes. Locale detection is
**manual** in `lib/i18n/config.ts` — see Gotchas.

## Service worker / PWA

Hand-rolled service worker at `public/sw.js`, registered in **production only**.
It will not run under `npm run dev`.

## Gotchas / DO-NOT

- **DON'T run `npm run build` while `npm run dev` is running.** Both use `.next`
  and the build fails with `Cannot find module for page: /_not-found/page`. Stop
  dev first.
- **DON'T use `[id]` dynamic routes.** Static export cannot prerender them. Detail
  pages use query params: `/property?id=`, `/scenario?id=`.
- **DON'T add a backend.** No API routes, middleware, or server actions —
  `output: "export"` forbids them.
- **DON'T re-add `i18next-browser-languagedetector`.** With i18next 26 it BREAKS
  key resolution; detection is manual in `lib/i18n/config.ts`.
- **DON'T translate domain-generated text.** Engine insights/alerts and scenario
  comparison metrics are intentionally English-only (translating would require
  passing i18n keys out of the pure domain layer).
- **DON'T convert money to BRL.** Currency stays USD; only formatting localizes.

## More docs

`docs/architecture.md`, `docs/sync-engine.md`, `docs/google-sheets-schema.md`,
and `docs/spec-ptbr-v3.md` (original PT-BR product spec — may lag current code).
