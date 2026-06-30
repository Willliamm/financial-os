import type { BaseEntity, EntityType } from "@/domain/entities/base";
import { nowIso } from "@/infrastructure/dates/date-utils";
import { getDb } from "../dexie";
import type { FinancialOsDb } from "../dexie";
import type { LocalEntityRecord } from "../types";

/**
 * Generic repository over the `entities` table. Each instance is bound to one
 * EntityType. The repository deals in domain entities; it wraps them in a
 * LocalEntityRecord for storage and tracks dirty/synced bookkeeping.
 */
export class EntityRepository<T extends BaseEntity> {
  constructor(
    readonly entityType: EntityType,
    private readonly db: FinancialOsDb = getDb(),
  ) {}

  private toEntity(record: LocalEntityRecord): T {
    return record.data as T;
  }

  /** All non-deleted entities of this type. */
  async list(): Promise<T[]> {
    const records = await this.db.entities
      .where("type")
      .equals(this.entityType)
      .toArray();
    return records
      .filter((r) => !r.deletedAt)
      .map((r) => this.toEntity(r))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  /** All records including soft-deleted ones. */
  async listRecords(includeDeleted = false): Promise<LocalEntityRecord<T>[]> {
    const records = (await this.db.entities
      .where("type")
      .equals(this.entityType)
      .toArray()) as LocalEntityRecord<T>[];
    return includeDeleted ? records : records.filter((r) => !r.deletedAt);
  }

  async get(id: string): Promise<T | undefined> {
    const record = await this.db.entities.get(id);
    if (!record || record.type !== this.entityType || record.deletedAt) {
      return undefined;
    }
    return this.toEntity(record);
  }

  async getRecord(id: string): Promise<LocalEntityRecord<T> | undefined> {
    const record = await this.db.entities.get(id);
    if (!record || record.type !== this.entityType) return undefined;
    return record as LocalEntityRecord<T>;
  }

  /**
   * Insert or update an entity. `dirty` marks whether the change still needs to
   * be pushed to Google Sheets (true for local edits, false for sync imports).
   */
  async put(entity: T, opts: { dirty?: boolean } = {}): Promise<void> {
    const dirty = opts.dirty ?? true;
    const existing = await this.db.entities.get(entity.id);
    const record: LocalEntityRecord<T> = {
      id: entity.id,
      type: this.entityType,
      version: entity.version,
      data: entity,
      createdAt: existing?.createdAt ?? entity.createdAt ?? nowIso(),
      updatedAt: entity.updatedAt ?? nowIso(),
      deletedAt: entity.deletedAt ?? null,
      lastSyncedAt: dirty ? (existing?.lastSyncedAt ?? null) : nowIso(),
      sheetRowNumber: existing?.sheetRowNumber ?? null,
      dirty,
    };
    await this.db.entities.put(record);
  }

  /** Soft-delete: stamp deletedAt and bump version, keep the record dirty. */
  async softDelete(id: string): Promise<void> {
    const record = await this.db.entities.get(id);
    if (!record) return;
    const ts = nowIso();
    const data = { ...(record.data as T), deletedAt: ts, updatedAt: ts };
    await this.db.entities.put({
      ...record,
      data,
      deletedAt: ts,
      updatedAt: ts,
      version: record.version + 1,
      dirty: true,
    });
  }

  /** Mark a record as synced after a successful push to Sheets. */
  async markSynced(
    id: string,
    opts: { sheetRowNumber?: number | null } = {},
  ): Promise<void> {
    const record = await this.db.entities.get(id);
    if (!record) return;
    await this.db.entities.put({
      ...record,
      dirty: false,
      lastSyncedAt: nowIso(),
      sheetRowNumber: opts.sheetRowNumber ?? record.sheetRowNumber ?? null,
    });
  }

  async dirtyRecords(): Promise<LocalEntityRecord<T>[]> {
    const records = await this.listRecords(true);
    return records.filter((r) => r.dirty);
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }
}
