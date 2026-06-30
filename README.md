# Financial OS

Advanced personal financial planning that feels like a real product, not a
spreadsheet. It covers net worth, income, expenses, real estate, loans,
investments, retirement, tax planning, scenarios and long-term projections.

It is a **fully static, offline-first web app**, installable as a **PWA**
(progressive web app) via a hand-rolled service worker. There is no backend of
our own. The interface is bilingual: **en-US** and **pt-BR**.

- The runtime database is **IndexedDB** (via Dexie).
- **Google Sheets + Google Drive** are an optional external store and backup,
  reached only through the Sync Engine.
- Out of the box it runs in **demo mode**: fully offline, with in-memory mock
  Google clients and seeded sample data. No Google account needed.

> Seus dados ficam no seu Google Drive. Sem backend, sem servidor nosso.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3000
```

Click **Continue with Google**. In demo mode this signs you in instantly, builds
an in-memory workbook, and seeds a realistic sample household so every screen is
populated.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server. |
| `npm run build` | Static export to `out/`. |
| `npm run test` | Run the Vitest suite. |
| `npm run typecheck` | TypeScript strict check (`tsc --noEmit`). |
| `npm run lint` | ESLint. |

## Using real Google Sheets

1. Create an OAuth 2.0 **Web** client in Google Cloud Console.
2. Enable the **Drive** and **Sheets** APIs.
3. Add your origin to the authorized JavaScript origins.
4. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

The app then signs in with Google Identity Services, finds or creates the
**"Financial OS - Personal Workbook"** spreadsheet in your Drive, and syncs to
it. Only minimal scopes are requested (`drive.file`, `spreadsheets`).

## Tech stack

Next.js 15 (App Router, `output: export`) · React 19 · TypeScript (strict) ·
Tailwind v4 · shadcn/ui (Radix via the `radix-ui` package, plus `@base-ui/react`) ·
Zustand · TanStack Query · Zod · Dexie/IndexedDB · Apache ECharts (lazy-loaded
via `next/dynamic`) · date-fns · `react-i18next`/`i18next` (en-US + pt-BR) ·
hand-rolled PWA service worker (`public/sw.js`, `app/manifest.ts`) ·
Vitest + Testing Library.

Forms are hand-rolled (no React Hook Form). Money stays in USD across locales —
only the formatting is localized. Domain-generated insight and alert text is
English-only.

## Project layout

```
app/            Routes (login + the (app) shell and screens)
components/     UI primitives, layout, charts, shared, sync, locks
features/       Data Studio engine (registry-driven CRUD), properties, projections
domain/         Entities, Zod schemas, commands, value objects, calculation engines
infrastructure/ Dexie + repositories, Google clients (mock + real), Sync Engine, money, dates
lib/            stores, queries, constants, env, ids, logger, seed
docs/           architecture, google-sheets-schema, sync-engine, original spec
test/           unit + integration tests
```

## How it works

Every change is a **Command**: it is written to IndexedDB (entity + audit log +
sync queue) in one transaction, then pushed to Google Sheets in batches by the
Sync Engine. Money is stored in integer **cents** and percentages in integer
**basis points**; dollars/percent only appear at the UI edge. Editing acquires a
soft **lock** with a heartbeat so two tabs do not clobber each other, and
conflicts are surfaced in the Sync Center.

## Documentation

| Doc | What it covers |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Layers, stores, command flow, design gotchas. |
| [`docs/sync-engine.md`](docs/sync-engine.md) | Import/push/sync, locks, conflicts, migrations. |
| [`docs/google-sheets-schema.md`](docs/google-sheets-schema.md) | Workbook tabs and column layout. |
| [`docs/spec-ptbr-v3.md`](docs/spec-ptbr-v3.md) | Original product spec (Portuguese). |
| [`CLAUDE.md`](CLAUDE.md) | Primary AI context: architecture, conventions, gotchas. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, scripts, dev loop, and how to add features. |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Coding conventions (cents/bps, command pattern, registry). |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Future plans: Plaid, Firebase, recurrence, input UX. |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records. |

## Deployment

Push to `main` and the included GitHub Actions workflow builds the static export
and publishes it to GitHub Pages. The site is also a clean fit for Cloudflare
Pages or Netlify (publish directory `out/`). For a GitHub Pages *project* site,
the workflow sets `NEXT_PUBLIC_BASE_PATH` automatically.

## Disclaimer

Tax and financial figures are **estimates** for planning only. They do not
replace a CPA, EA, attorney or licensed advisor.
