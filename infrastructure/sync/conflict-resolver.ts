import type { AnyEntity } from "@/domain/entities";
import type { EntityType } from "@/domain/entities/base";
import { newId } from "@/lib/ids";
import { nowIso } from "@/infrastructure/dates/date-utils";
import { getDb } from "@/infrastructure/db/dexie";
import { repositoryFor } from "@/infrastructure/db/repositories";
import type { ConflictRecord, LocalEntityRecord } from "@/infrastructure/db/types";

/**
 * A conflict exists when the local record has unsynced edits (dirty) and the
 * remote copy has moved on (higher version or a newer updated_at than the last
 * time we synced).
 */
export function isConflict(
  local: LocalEntityRecord,
  remote: { version: number; updatedAt: string },
): boolean {
  if (!local.dirty) return false;
  if (remote.version > local.version) return true;
  const lastSynced = local.lastSyncedAt
    ? new Date(local.lastSyncedAt).getTime()
    : 0;
  return new Date(remote.updatedAt).getTime() > lastSynced;
}

export async function recordConflict(
  entityType: EntityType,
  local: LocalEntityRecord,
  remote: AnyEntity,
): Promise<ConflictRecord> {
  const db = getDb();
  const existing = await db.conflicts
    .where("status")
    .equals("open")
    .filter((c) => c.entityId === local.id)
    .first();
  if (existing) return existing;

  const conflict: ConflictRecord = {
    id: newId(),
    entityType,
    entityId: local.id,
    status: "open",
    localData: local.data,
    remoteData: remote,
    localVersion: local.version,
    remoteVersion: (remote as { version: number }).version,
    createdAt: nowIso(),
    resolvedAt: null,
    resolution: null,
  };
  await db.conflicts.add(conflict);
  return conflict;
}

export async function listOpenConflicts(): Promise<ConflictRecord[]> {
  return getDb().conflicts.where("status").equals("open").toArray();
}

export async function countOpenConflicts(): Promise<number> {
  return getDb().conflicts.where("status").equals("open").count();
}

/**
 * Resolve a conflict by keeping the local version, taking the remote version,
 * or applying a manually-merged entity.
 */
export async function resolveConflict(
  conflictId: string,
  resolution: "local" | "remote" | "merge",
  mergedEntity?: AnyEntity,
): Promise<void> {
  const db = getDb();
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return;

  const repo = repositoryFor(conflict.entityType);

  if (resolution === "remote") {
    await repo.put(conflict.remoteData as never, { dirty: false });
    await repo.markSynced(conflict.entityId);
  } else if (resolution === "local") {
    // Keep local data but bump version above remote so the next push wins.
    const local = conflict.localData as AnyEntity;
    const bumped = {
      ...local,
      version: Math.max(conflict.localVersion, conflict.remoteVersion) + 1,
      updatedAt: nowIso(),
    } as AnyEntity;
    await repo.put(bumped as never, { dirty: true });
  } else {
    const merged = (mergedEntity ?? conflict.localData) as AnyEntity;
    const bumped = {
      ...merged,
      version: Math.max(conflict.localVersion, conflict.remoteVersion) + 1,
      updatedAt: nowIso(),
    } as AnyEntity;
    await repo.put(bumped as never, { dirty: true });
  }

  await db.conflicts.update(conflictId, {
    status: "resolved",
    resolvedAt: nowIso(),
    resolution,
  });
}
