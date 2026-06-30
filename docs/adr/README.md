# Architecture Decision Records (ADRs)

An **ADR** is a short note that records one important architecture decision:
the context, the choice, and the trade-offs.

Read these to understand *why* Financial OS is built the way it is.
For the concrete coding rules, see [`../CONVENTIONS.md`](../CONVENTIONS.md).

## Index

| # | Title | Status |
|---|-------|--------|
| [0001](0001-static-export-no-backend.md) | Static export, no backend | Accepted |
| [0002](0002-indexeddb-as-runtime-database.md) | IndexedDB as the runtime database | Accepted |
| [0003](0003-google-sheets-as-sync-layer.md) | Google Sheets as the sync layer | Accepted |
| [0004](0004-command-pattern-for-mutations.md) | Command pattern for all mutations | Accepted |
| [0005](0005-money-in-cents-percent-in-bps.md) | Money in cents, percent in basis points | Accepted |
| [0006](0006-react-i18next-for-static-i18n.md) | react-i18next for static i18n | Accepted |
| [0007](0007-service-worker-pwa.md) | Hand-rolled service worker for PWA | Accepted |

## Format

Each ADR uses the same sections:

- **Title**
- **Status** — Accepted
- **Context** — the problem and the forces at play.
- **Decision** — what we chose.
- **Consequences** — what follows, good and bad.
