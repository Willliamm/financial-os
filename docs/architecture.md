# Architecture

Financial OS is a **static, offline-first SPA**. There is no backend of our own.
The operational database is **IndexedDB** (via Dexie). **Google Sheets + Drive**
are an external persistence and backup layer reached only through the Sync Engine.

```
UI → Application → Domain → Dexie (IndexedDB) → Sync Engine → Google Sheets
```

The Google Sheets format never dictates the internal architecture. The Sync
Engine is the seam that would let us swap Sheets for a real backend later
without rewriting the product.

## Layers

### UI layer (`app/`, `components/`)
Screens, forms, charts, tables, navigation, loading/empty/error states, lock
banners and sync status. Contains no financial rules.

### Application layer (`features/`, `lib/stores/`, `lib/queries/`)
Orchestrates use cases: creates Commands, runs validation, persists locally,
triggers sync, and turns entities into view models. State lives in small Zustand
stores (`auth`, `workbook`, `sync`, `lock`, `ui`); reads are cached with
TanStack Query over Dexie.

### Domain layer (`domain/`)
Entities, value objects (money in cents, percentages in basis points), Zod
schemas, the Command model, and the pure calculation **engines** (mortgage, real
estate, net worth, FIRE, tax, scenario, retirement) plus analyzers and the
rule-based insight provider. **No** React, Dexie, or Google imports here.

### Infrastructure layer (`infrastructure/`)
Dexie database and repositories, the command service, Google client interfaces
with in-memory mocks and real REST/GIS implementations, and the Sync Engine
(sheet mapper, sync engine, lock manager, conflict resolver, migrations).

## Key decisions

- **No backend / no API routes / no server actions.** `next.config.ts` uses
  `output: "export"`.
- **IndexedDB is the runtime database.** Everything renders from local data.
- **Money is integer cents; percentages are integer basis points.** Conversion
  to/from dollars and percent happens only at the UI edge (`MoneyInput`,
  `PercentInput`).
- **Every mutation is a Command.** `applyCommand` writes the entity, an audit
  `CommandRecord`, and a `SyncQueueItem` in one Dexie transaction. Local
  persistence always precedes any Google Sheets write.
- **Optimistic soft locks.** `LockManager` coordinates edits per origin (so two
  tabs cooperate), with a TTL and heartbeat.
- **Config-driven Data Studio.** A single entity registry (`features/data-studio`)
  powers list/table/form CRUD for every entity, so screens stay tiny and
  consistent.

## Data flow for an edit

1. User opens an entity → app acquires a soft lock for `type:id`.
2. The generic form validates and builds a payload (already in cents/bps).
3. `applyCommand` persists the entity (dirty), the command, and a queue item.
4. TanStack Query is invalidated; the UI shows "local changes".
5. The Sync Engine pushes pending items to Sheets in batches, updates
   `__sync_log`, and marks records synced. Conflicts go to the Conflict Center.
6. The lock is released on save/cancel.

## Google clients

`getGoogleClients()` returns in-memory **mock** clients unless
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set, so the app is fully usable offline and
without OAuth. The mock persists its "remote" workbook to `localStorage`, which
makes the sync round-trip demonstrable across reloads. Real clients
(`real-clients.ts`) use Google Identity Services for the token and REST calls to
the Drive and Sheets APIs.
