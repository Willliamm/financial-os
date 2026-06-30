# Google Sheets schema

The workbook is named **"Financial OS - Personal Workbook"** and is stamped with
Drive `appProperties` so the app can rediscover it:

```json
{ "app": "financial-os", "workbookType": "personal-finance", "schemaVersion": "3" }
```

## Conventions

- Headers are `snake_case`; the first row of every sheet is the header.
- IDs are UUIDs. Dates are ISO 8601.
- **Money is stored in cents** (integers). **Percentages in basis points**
  (100 bps = 1%). Booleans are `TRUE`/`FALSE`.
- Soft delete via a `deleted_at` timestamp.
- The app never relies on spreadsheet formulas for logic.

Every domain sheet shares: `id, version, …business columns…, created_at,
updated_at, deleted_at, created_by, updated_by`.

## Technical tabs

- `__meta` — `key, value, updated_at`. Holds `schema_version`, `app_name`,
  `workbook_id`, `default_currency`, `lock_ttl_seconds`, `created_at`,
  `updated_at`.
- `__locks` — soft optimistic locks (`resource_key`, `lock_token`, owner fields,
  `acquired_at`, `heartbeat_at`, `expires_at`, `status`).
- `__sync_log` — one row per synced command (`command_id`, `entity_type`,
  `entity_id`, `operation`, `payload_hash`, `user_email`, timestamps, `status`).
- `__schema_migrations` — `id, version, applied_at, applied_by`.

## Domain sheets

`households`, `people`, `income_sources`, `expenses`, `properties`, `loans`,
`investment_accounts`, `tax_strategies`, `tax_assumptions`, `scenarios`,
`scenario_assumptions`, `projection_snapshots`.

The authoritative, ordered column list for each sheet lives in code at
`infrastructure/sync/sheet-schema.ts` (`SHEET_COLUMNS`). The mapper
(`sheet-mapper.ts`) serializes entities to rows and parses rows back into
Zod-validated entities; a single malformed row is dropped, never fatal.
