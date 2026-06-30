# 0002 — IndexedDB as the runtime database

## Status

Accepted

## Context

The app has no backend and no server database (see ADR 0001). But it still
needs a real database. It must store many entities — accounts, properties,
loans, investments, scenarios — and query them fast, even offline.

Browser storage options:

- **`localStorage`** — simple, but only stores strings, has a small size
  limit, has no indexes, and blocks the main thread. Too weak for this data.
- **IndexedDB** — a real in-browser database. It stores structured objects,
  supports indexes and transactions, holds far more data, and works offline.

Raw IndexedDB has an awkward, low-level API. **Dexie** is a small library that
wraps IndexedDB with a clean, typed, promise-based API and proper transactions.

## Decision

Use **Dexie (IndexedDB)** as the **operational database** of the app.

- IndexedDB on the device is the source of truth for all app data.
- All reads and writes go through Dexie.
- Transactions group related writes so they all succeed or all fail. This is
  the basis for the Command pattern (see ADR 0004).
- TanStack Query sits on top to cache and refresh query results in the UI.
- Schema changes are handled by migrations in `infrastructure/sync/migrations`.

Google Sheets is **not** the operational database. It is an optional sync and
backup target only (see ADR 0003).

## Consequences

**Good**

- A real, indexed, transactional database that works fully offline.
- Transactions let one write update the entity, the audit log, and the sync
  queue atomically (see ADR 0004).
- Large capacity compared to `localStorage`.
- Data stays on the user's device, which supports the privacy goal.

**Bad / trade-offs**

- Data is tied to one browser profile on one device. Sharing across devices
  needs the Google Sheets sync layer.
- Clearing browser data wipes the local database. The Google Sheets backup is
  the recovery path.
- IndexedDB is async and browser-only, so the **domain layer must not import
  Dexie** — engines stay pure and the DB is called from the application layer.
- Schema changes require explicit migrations.
