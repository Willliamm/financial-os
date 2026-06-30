import { APP_SCHEMA_VERSION } from "@/lib/constants";
import { createLogger } from "@/lib/logger";
import { nowIso } from "@/infrastructure/dates/date-utils";
import type { GoogleClients } from "@/infrastructure/google/google-api-types";

const log = createLogger("migrations");

export interface MigrationContext {
  clients: GoogleClients;
  spreadsheetId: string;
}

export interface SchemaMigration {
  version: number;
  name: string;
  up(context: MigrationContext): Promise<void>;
}

/**
 * Ordered list of schema migrations. The MVP ships at schema version 3 with no
 * prior versions to migrate from, so this list is empty. New migrations append
 * here with an incrementing version.
 */
export const MIGRATIONS: SchemaMigration[] = [];

async function readSchemaVersion(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<number> {
  const values = await clients.sheets.getValues(spreadsheetId, "__meta!A:C");
  for (const row of values) {
    if (row[0] === "schema_version") {
      const v = Number(row[1]);
      return Number.isFinite(v) ? v : 0;
    }
  }
  return 0;
}

/**
 * Run any migrations whose version is greater than the workbook's current
 * schema_version, in order, then stamp the new version.
 */
export async function runMigrations(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<{ ran: number; version: number }> {
  const current = await readSchemaVersion(clients, spreadsheetId);
  if (current >= APP_SCHEMA_VERSION) {
    return { ran: 0, version: current };
  }

  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    log.info(`Applying migration ${migration.version}: ${migration.name}`);
    await migration.up({ clients, spreadsheetId });
    await clients.sheets.appendRows(spreadsheetId, "__schema_migrations", [
      [
        `mig-${migration.version}`,
        String(migration.version),
        nowIso(),
        "local",
      ],
    ]);
  }

  // Stamp the meta version (best-effort; the meta tab uses key/value rows).
  const meta = await clients.sheets.getValues(spreadsheetId, "__meta!A:C");
  const idx = meta.findIndex((r) => r[0] === "schema_version");
  if (idx >= 0) {
    await clients.sheets.updateRange(spreadsheetId, `__meta!A${idx + 1}`, [
      ["schema_version", String(APP_SCHEMA_VERSION), nowIso()],
    ]);
  }

  return { ran: pending.length, version: APP_SCHEMA_VERSION };
}
