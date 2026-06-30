# 0003 — Google Sheets as the sync layer

## Status

Accepted

## Context

The operational database is IndexedDB on the device (see ADR 0002). That data
lives in one browser on one device. Two needs follow:

1. **Backup.** If the user clears browser data or loses the device, the data
   should be recoverable.
2. **Portability.** The user should be able to see and own their data outside
   the app, and move it between devices.

We have no backend, so we cannot host the backup ourselves (see ADR 0001).
The backup must live in storage the **user already owns**.

Google Sheets fits well:

- Most users have a Google account.
- A spreadsheet is human-readable. The user can open and inspect every row.
- The data stays in the user's own Google Drive, not on our servers.
- A clear sheet-per-entity schema is easy to map to and from our entities.

## Decision

Use **Google Sheets as an optional sync and backup layer**, not as the
database.

- The **Sync Engine** (`infrastructure/sync`) pushes local changes to Google
  Sheets and resolves conflicts.
- `sheet-mapper` maps entities to and from sheet rows.
- `lock-manager` and `conflict-resolver` keep concurrent edits safe.
- The **local Dexie write always happens first** and must succeed. Only then
  does a queued item sync to Google Sheets (see ADR 0004). The app never blocks
  on a Google call.
- Sync is **optional**. The app is fully usable with no Google account and no
  network.

**Demo mode is the default.** Out of the box the app uses **in-memory mock
Google clients** plus seeded sample data. No OAuth (Google sign-in) is needed
to try the app. Real Google clients are swapped in only when the user connects
their account.

## Consequences

**Good**

- Backup and portability without us running any server.
- The user owns and can read their backup data directly.
- Demo mode lets anyone try the full app instantly, with no sign-in.
- Mock clients make the sync engine easy to test deterministically.

**Bad / trade-offs**

- Google Sheets is not a fast transactional database. It is a backup target,
  which is why it is never the operational store.
- Concurrent edits across devices need locking and conflict resolution.
- Real Google integration needs OAuth and API quota handling.
- The domain layer must not import Google clients — sync lives in the
  infrastructure layer only.
