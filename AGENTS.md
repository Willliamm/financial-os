# AGENTS.md

Financial OS is a static, offline-first personal-finance planning SPA (Next.js 15 App
Router with `output: "export"`, React 19, TypeScript strict, Tailwind v4, shadcn/ui).
It has no backend: state lives in Zustand/TanStack Query, data persists to Dexie
(IndexedDB), and an optional Sync Engine backs up to Google Sheets. Money is stored as
integer US cents and percentages as integer basis points; every mutation goes through
`applyCommand`. It runs in demo mode by default (mock Google client + seeded data).

## Authoritative AI guidance

The full, authoritative AI guidance lives in **[CLAUDE.md](./CLAUDE.md)**. Read it first.
This file is just a short pointer for cross-tool compatibility (the AGENTS.md standard).

## Key docs

- [CLAUDE.md](./CLAUDE.md) — architecture, conventions, and key gotchas (start here).
- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, dev/build/test loop, deployment.
- [docs/CONVENTIONS.md](./docs/CONVENTIONS.md) — cents/bps and command conventions.
- [README.md](./README.md) — project overview.
- [docs/architecture.md](./docs/architecture.md) — system architecture.
- [docs/sync-engine.md](./docs/sync-engine.md) — Google Sheets sync engine.
- [docs/google-sheets-schema.md](./docs/google-sheets-schema.md) — sheet schema.
