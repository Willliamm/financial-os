import type { EntityType } from "@/domain/entities/base";
import type { Command, CommandStatus } from "@/domain/commands";

/** key/value metadata stored locally (mirrors the workbook __meta tab). */
export interface LocalMetadata {
  key: string;
  value: string;
}

/** Generic local record wrapping any domain entity. */
export interface LocalEntityRecord<T = unknown> {
  id: string;
  type: EntityType;
  version: number;
  data: T;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lastSyncedAt?: string | null;
  sheetRowNumber?: number | null;
  /** true when there are local changes not yet pushed to Google Sheets. */
  dirty: boolean;
}

/** A command persisted in the local audit log. */
export interface CommandRecord extends Command {
  // status is part of Command; kept here for Dexie indexing clarity.
  status: CommandStatus;
}

export type SyncItemStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

export interface SyncQueueItem {
  id: string;
  commandId: string;
  entityType: EntityType;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  status: SyncItemStatus;
  attempts: number;
  lastAttemptAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export type LockStatus = "active" | "released" | "expired";

export interface LocalLockRecord {
  resourceKey: string;
  resourceType: string;
  resourceId: string;
  lockToken: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  ownerSessionId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
  status: LockStatus;
}

export type ConflictStatus = "open" | "resolved" | "dismissed";

export interface ConflictRecord {
  id: string;
  entityType: EntityType;
  entityId: string;
  status: ConflictStatus;
  localData: unknown;
  remoteData: unknown;
  localVersion: number;
  remoteVersion: number;
  createdAt: string;
  resolvedAt?: string | null;
  resolution?: "local" | "remote" | "merge" | null;
}

/** A user-saved projection snapshot stored locally. */
export interface ProjectionSnapshotRecord {
  id: string;
  type: string;
  scenarioId: string | null;
  label: string;
  payload: unknown;
  createdAt: string;
}
