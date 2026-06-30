import type { BaseEntity, EntityType } from "@/domain/entities/base";
import {
  type Command,
  type CommandOperation,
  commandTypeFor,
} from "@/domain/commands";
import { newId } from "@/lib/ids";
import { nowIso } from "@/infrastructure/dates/date-utils";
import { getDb } from "./dexie";
import type { CommandRecord, LocalEntityRecord, SyncQueueItem } from "./types";

export interface Actor {
  userId: string;
  userEmail: string;
  sessionId: string;
}

const ANONYMOUS: Actor = {
  userId: "local",
  userEmail: "local@financial-os",
  sessionId: "local-session",
};

export interface ApplyCommandInput<T extends BaseEntity> {
  entityType: EntityType;
  operation: CommandOperation;
  /** Full entity for create/update; for delete only `id` is required. */
  entity: Partial<T> & { id?: string };
  actor?: Actor;
}

export interface ApplyCommandResult<T extends BaseEntity> {
  entity: T;
  command: CommandRecord;
}

/**
 * Apply a mutation as a Command. In a single Dexie transaction this:
 *  - writes/updates the entity in the `entities` table (marked dirty),
 *  - appends a CommandRecord to the local audit log,
 *  - enqueues a SyncQueueItem for the Sync Engine.
 *
 * Local persistence always happens before any Google Sheets sync.
 */
export async function applyCommand<T extends BaseEntity>(
  input: ApplyCommandInput<T>,
): Promise<ApplyCommandResult<T>> {
  const { entityType, operation } = input;
  const actor = input.actor ?? ANONYMOUS;
  const db = getDb();
  const ts = nowIso();

  return db.transaction(
    "rw",
    db.entities,
    db.commands,
    db.syncQueue,
    async () => {
      const existing = input.entity.id
        ? await db.entities.get(input.entity.id)
        : undefined;

      const entityId = input.entity.id ?? newId();
      let nextEntity: T;
      let deletedAt: string | null = null;

      if (operation === "create") {
        nextEntity = {
          ...(input.entity as T),
          id: entityId,
          version: 0,
          createdAt: ts,
          updatedAt: ts,
          deletedAt: null,
          createdBy: actor.userEmail,
          updatedBy: actor.userEmail,
        };
      } else if (operation === "update") {
        const prev = (existing?.data ?? {}) as T;
        nextEntity = {
          ...prev,
          ...(input.entity as T),
          id: entityId,
          version: (existing?.version ?? 0) + 1,
          createdAt: prev.createdAt ?? existing?.createdAt ?? ts,
          updatedAt: ts,
          updatedBy: actor.userEmail,
        };
      } else {
        // delete
        const prev = (existing?.data ?? { id: entityId }) as T;
        deletedAt = ts;
        nextEntity = {
          ...prev,
          id: entityId,
          version: (existing?.version ?? 0) + 1,
          updatedAt: ts,
          deletedAt: ts,
          updatedBy: actor.userEmail,
        };
      }

      const record: LocalEntityRecord<T> = {
        id: entityId,
        type: entityType,
        version: nextEntity.version,
        data: nextEntity,
        createdAt: existing?.createdAt ?? nextEntity.createdAt ?? ts,
        updatedAt: ts,
        deletedAt: deletedAt ?? nextEntity.deletedAt ?? null,
        lastSyncedAt: existing?.lastSyncedAt ?? null,
        sheetRowNumber: existing?.sheetRowNumber ?? null,
        dirty: true,
      };
      await db.entities.put(record);

      const command: CommandRecord = {
        id: newId(),
        type: commandTypeFor(entityType, operation),
        entityType,
        entityId,
        operation,
        payload: nextEntity,
        userId: actor.userId,
        userEmail: actor.userEmail,
        sessionId: actor.sessionId,
        createdAt: ts,
        status: "applied",
      };
      await db.commands.add(command);

      const queueItem: SyncQueueItem = {
        id: newId(),
        commandId: command.id,
        entityType,
        entityId,
        operation,
        payload: nextEntity,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        errorMessage: null,
        createdAt: ts,
      };
      await db.syncQueue.add(queueItem);

      return { entity: nextEntity, command };
    },
  );
}

/** Convenience helpers. */
export function createEntity<T extends BaseEntity>(
  entityType: EntityType,
  entity: Partial<T>,
  actor?: Actor,
): Promise<ApplyCommandResult<T>> {
  return applyCommand<T>({ entityType, operation: "create", entity, actor });
}

export function updateEntity<T extends BaseEntity>(
  entityType: EntityType,
  entity: Partial<T> & { id: string },
  actor?: Actor,
): Promise<ApplyCommandResult<T>> {
  return applyCommand<T>({ entityType, operation: "update", entity, actor });
}

export function deleteEntity<T extends BaseEntity>(
  entityType: EntityType,
  id: string,
  actor?: Actor,
): Promise<ApplyCommandResult<T>> {
  return applyCommand<T>({
    entityType,
    operation: "delete",
    entity: { id } as Partial<T> & { id: string },
    actor,
  });
}

export type { Command };
