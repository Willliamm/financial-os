# Sync Engine

The Sync Engine moves data between IndexedDB and Google Sheets. It never writes
cell-by-cell; it batches by worksheet.

## Read (import)

`importWorkbook(clients, spreadsheetId)`:

1. For each domain sheet, read the full range.
2. Parse each row with the sheet mapper (Zod-validated). Invalid rows are
   skipped.
3. Upsert into IndexedDB as **clean** (`dirty = false`).
4. If a local record is **dirty** and the remote copy has also moved on, a
   `ConflictRecord` is raised instead of overwriting local edits.
5. Stamp `last_synced_at` in local metadata.

## Write (push)

`pushPending(clients, spreadsheetId)`:

1. Read all `pending`/`failed` items from the Sync Queue, grouped by entity type.
2. Read the worksheet once; resolve each entity's row by `id`.
3. **Create** → append a row. **Update/Delete** → rewrite the entity's row
   (deletes set `deleted_at`).
4. On success, mark the queue item, command and entity as synced; append a
   `__sync_log` row.
5. On failure, increment attempts; after `MAX_SYNC_ATTEMPTS` the item is marked
   `failed` (retryable from the Sync Center).

`syncAll` runs push then import. A periodic background sync runs every minute
when there are pending changes and the app is online.

## Global sync status

`idle | dirty | syncing | synced | offline | failed | conflict`, surfaced in the
top bar and the Sync Center along with pending counts and last-sync time.

## Locks

`LockManager` implements a soft optimistic lock (spec §15). Acquire reads the
current lock for `type:id`; if none/expired it takes ownership, if held by the
same session it renews, if held by another session it returns read-only. A
heartbeat renews the lease every 30s (TTL 120s). Locks are stored per browser
origin, so multiple tabs of the same user coordinate.

## Conflicts

A conflict exists when a local record is dirty **and** the remote `version` is
higher (or remote `updated_at` is newer than the local `last_synced_at`). The
Conflict Center offers: keep mine, use the sheet's version, or merge.

## Migrations

`runMigrations` compares `__meta.schema_version` with `APP_SCHEMA_VERSION`,
acquires the `workbook:schema_migration` lock conceptually, runs pending
migrations in order, records them in `__schema_migrations`, and stamps the new
version. The MVP ships at schema version 3 with no prior migrations.
