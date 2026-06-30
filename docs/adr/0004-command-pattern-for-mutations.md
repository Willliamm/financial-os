# 0004 — Command pattern for all mutations

## Status

Accepted

## Context

The app has two stores that must agree: the local IndexedDB database (the
source of truth, ADR 0002) and the optional Google Sheets backup (ADR 0003).

For every change to data, we need three things to stay consistent:

1. The **entity** itself is updated.
2. An **audit record** captures what changed and when (history, debugging,
   undo support).
3. A **sync-queue item** is created so the change can later reach Google
   Sheets.

If these three were written separately, a crash between writes could leave the
data, the audit log, and the sync queue out of step. That is a hard bug to find
and a real risk with financial data.

We also want a single, predictable path for every write, so feature code never
pokes the database directly.

## Decision

Make **every mutation a Command**, applied through one function:

```ts
// infrastructure/db/command-service.ts
applyCommand(command);
```

`applyCommand` runs **one Dexie transaction** that writes all three records
together:

1. The entity row.
2. The audit command record.
3. The sync-queue item.

All three commit together or none do. There is no partial write.

Rules that follow:

- Feature and component code never calls `db.table.put(...)` directly. It
  builds a typed command and calls `applyCommand`.
- The **local write always precedes any Google Sheets sync.** Sync reads from
  the queue afterward (see ADR 0003).

## Consequences

**Good**

- Atomicity: entity, audit, and sync queue can never drift apart.
- A built-in audit trail of every change.
- A single, testable write path for the whole app.
- Sync is decoupled: writes finish locally and fast; sync drains the queue
  later, even after going offline and back online.

**Bad / trade-offs**

- More structure per write: you must build a command object, not just call
  `put`.
- Every entity needs its command builder wired up (the data-studio registry
  helps standardize this).
- The audit and sync-queue tables grow over time and may need pruning.
