import type { EntityType } from "@/domain/entities/base";
import { MAX_SYNC_ATTEMPTS } from "@/lib/constants";
import { newId } from "@/lib/ids";
import { createLogger } from "@/lib/logger";
import { nowIso } from "@/infrastructure/dates/date-utils";
import { getDb } from "@/infrastructure/db/dexie";
import { metadataRepo, META_KEYS } from "@/infrastructure/db/metadata-repo";
import { repositoryFor } from "@/infrastructure/db/repositories";
import type { LocalEntityRecord, SyncQueueItem } from "@/infrastructure/db/types";
import type { GoogleClients } from "../google/google-api-types";
import {
  entityToRow,
  findRowNumberById,
  rowToEntity,
} from "./sheet-mapper";
import { isConflict, recordConflict } from "./conflict-resolver";
import { DOMAIN_ENTITY_TYPES, sheetName } from "./workbook-manager";

const log = createLogger("sync");

export interface ImportSummary {
  imported: number;
  byType: Record<string, number>;
}

export interface PushSummary {
  pushed: number;
  failed: number;
  conflicts: number;
}

/**
 * Import every domain sheet from the workbook into IndexedDB. Rows are
 * validated with Zod; invalid rows are skipped. Imported entities are marked
 * clean (dirty = false). Local rows that are still dirty are NOT overwritten,
 * so unsynced local edits are preserved.
 */
export async function importWorkbook(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<ImportSummary> {
  const byType: Record<string, number> = {};
  let imported = 0;

  for (const type of DOMAIN_ENTITY_TYPES) {
    const name = sheetName(type);
    const values = await clients.sheets.getValues(spreadsheetId, `${name}!A:ZZ`);
    if (values.length < 2) {
      byType[type] = 0;
      continue;
    }
    const header = values[0];
    const repo = repositoryFor(type);
    let count = 0;

    for (let i = 1; i < values.length; i++) {
      const entity = rowToEntity(type, header, values[i]);
      if (!entity) continue;

      // Preserve dirty local edits. If the remote copy has also moved on we
      // raise a conflict instead of clobbering local changes.
      const existing = await repo.getRecord(entity.id);
      if (existing?.dirty) {
        if (
          isConflict(existing, {
            version: (entity as { version: number }).version,
            updatedAt: (entity as { updatedAt: string }).updatedAt,
          })
        ) {
          await recordConflict(type, existing, entity);
        }
        continue;
      }

      await repo.put(entity as never, { dirty: false });
      await repo.markSynced(entity.id, { sheetRowNumber: i + 1 });
      count += 1;
      imported += 1;
    }
    byType[type] = count;
  }

  await metadataRepo.set(META_KEYS.lastSyncedAt, nowIso());
  log.info("Imported workbook", byType);
  return { imported, byType };
}

/**
 * Push every pending sync-queue item to Google Sheets, grouped by worksheet.
 * Creates append, updates and deletes rewrite the entity's row (deletes stamp
 * deleted_at). Each success marks the queue item, command and entity synced and
 * writes a __sync_log entry.
 */
export async function pushPending(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<PushSummary> {
  const db = getDb();
  const pending = await db.syncQueue
    .where("status")
    .anyOf("pending", "failed")
    .toArray();

  const summary: PushSummary = { pushed: 0, failed: 0, conflicts: 0 };
  if (pending.length === 0) return summary;

  // Group by entity type so we read each worksheet once.
  const byType = new Map<EntityType, SyncQueueItem[]>();
  for (const item of pending) {
    const list = byType.get(item.entityType) ?? [];
    list.push(item);
    byType.set(item.entityType, list);
  }

  for (const [type, items] of byType) {
    const name = sheetName(type);
    let values = await clients.sheets.getValues(spreadsheetId, `${name}!A:ZZ`);
    const header = values[0] ?? [];

    for (const item of items) {
      try {
        await db.syncQueue.update(item.id, {
          status: "syncing",
          attempts: item.attempts + 1,
          lastAttemptAt: nowIso(),
        });

        const record = (await db.entities.get(
          item.entityId,
        )) as LocalEntityRecord | undefined;
        const entityData = (record?.data ?? item.payload) as Record<
          string,
          unknown
        >;
        const row = entityToRow(type, entityData);
        const existingRowNumber = findRowNumberById(values, item.entityId);

        if (existingRowNumber) {
          await clients.sheets.updateRange(
            spreadsheetId,
            `${name}!A${existingRowNumber}`,
            [row],
          );
          values[existingRowNumber - 1] = row;
        } else {
          const result = await clients.sheets.appendRows(spreadsheetId, name, [
            row,
          ]);
          // refresh local copy of the sheet values for subsequent items
          values = await clients.sheets.getValues(
            spreadsheetId,
            `${name}!A:ZZ`,
          );
          if (record && result.startRow) {
            await repositoryFor(type).markSynced(item.entityId, {
              sheetRowNumber: result.startRow,
            });
          }
        }

        await db.syncQueue.update(item.id, {
          status: "synced",
          errorMessage: null,
        });
        await db.commands.update(item.commandId, { status: "synced" });
        await repositoryFor(type).markSynced(item.entityId, {
          sheetRowNumber: existingRowNumber ?? record?.sheetRowNumber ?? null,
        });
        await writeSyncLog(clients, spreadsheetId, item, header);
        summary.pushed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed = item.attempts + 1 >= MAX_SYNC_ATTEMPTS;
        await db.syncQueue.update(item.id, {
          status: failed ? "failed" : "pending",
          errorMessage: message,
        });
        log.error(`Failed to sync ${type} ${item.entityId}`, message);
        summary.failed += 1;
      }
    }
  }

  await metadataRepo.set(META_KEYS.lastSyncedAt, nowIso());
  return summary;
}

async function writeSyncLog(
  clients: GoogleClients,
  spreadsheetId: string,
  item: SyncQueueItem,
  _header: string[],
): Promise<void> {
  try {
    const row = [
      newId(),
      item.commandId,
      item.entityType,
      item.entityId,
      item.operation,
      simpleHash(JSON.stringify(item.payload)),
      "local",
      item.createdAt,
      nowIso(),
      "synced",
    ];
    await clients.sheets.appendRows(spreadsheetId, "__sync_log", [row]);
  } catch (error) {
    log.warn("Could not write __sync_log", error);
  }
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `h${(hash >>> 0).toString(16)}`;
}

/** Push local changes then re-import remote state. */
export async function syncAll(
  clients: GoogleClients,
  spreadsheetId: string,
): Promise<{ push: PushSummary; import: ImportSummary }> {
  const push = await pushPending(clients, spreadsheetId);
  const imported = await importWorkbook(clients, spreadsheetId);
  return { push, import: imported };
}

export async function countPending(): Promise<number> {
  const db = getDb();
  return db.syncQueue.where("status").anyOf("pending", "failed").count();
}
