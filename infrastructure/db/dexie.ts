import Dexie, { type Table } from "dexie";
import type {
  CommandRecord,
  ConflictRecord,
  LocalEntityRecord,
  LocalLockRecord,
  LocalMetadata,
  ProjectionSnapshotRecord,
  SyncQueueItem,
} from "./types";

/**
 * IndexedDB is the operational runtime database. Google Sheets is only an
 * external persistence/backup layer reached through the Sync Engine.
 */
export class FinancialOsDb extends Dexie {
  metadata!: Table<LocalMetadata, string>;
  entities!: Table<LocalEntityRecord, string>;
  commands!: Table<CommandRecord, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  locks!: Table<LocalLockRecord, string>;
  conflicts!: Table<ConflictRecord, string>;
  snapshots!: Table<ProjectionSnapshotRecord, string>;

  constructor(name = "financial_os") {
    super(name);
    this.version(1).stores({
      metadata: "key",
      entities: "id, type, updatedAt, deletedAt, dirty, [type+dirty]",
      commands: "id, entityId, entityType, status, createdAt",
      syncQueue: "id, status, createdAt, entityType",
      locks: "resourceKey, expiresAt, status",
      conflicts: "id, status, createdAt, entityType",
      snapshots: "id, type, createdAt, scenarioId",
    });
  }
}

let dbInstance: FinancialOsDb | null = null;

/** Singleton accessor so the whole app shares one IndexedDB connection. */
export function getDb(): FinancialOsDb {
  if (!dbInstance) {
    dbInstance = new FinancialOsDb();
  }
  return dbInstance;
}

/** For tests: create an isolated database instance with a unique name. */
export function createTestDb(name: string): FinancialOsDb {
  return new FinancialOsDb(name);
}

/** For tests/reset: drop the singleton so a fresh one is created next call. */
export function resetDbSingleton(): void {
  dbInstance = null;
}
