import { LOCK_TTL_SECONDS } from "@/lib/constants";
import { newId } from "@/lib/ids";
import { now, nowIso } from "@/infrastructure/dates/date-utils";
import { getDb } from "@/infrastructure/db/dexie";
import type { LocalLockRecord } from "@/infrastructure/db/types";

export interface LockOwner {
  userId: string;
  email: string;
  name: string;
  sessionId: string;
}

export type LockMode = "owner" | "readonly";

export interface LockResult {
  acquired: boolean;
  mode: LockMode;
  lock: LocalLockRecord;
  /** present when the resource is locked by someone else */
  heldBy?: { name: string; email: string };
}

/** Storage abstraction so the lock algorithm can be unit-tested in memory. */
export interface LockStore {
  get(resourceKey: string): Promise<LocalLockRecord | undefined>;
  put(lock: LocalLockRecord): Promise<void>;
  delete(resourceKey: string): Promise<void>;
}

export class DexieLockStore implements LockStore {
  async get(resourceKey: string): Promise<LocalLockRecord | undefined> {
    return getDb().locks.get(resourceKey);
  }
  async put(lock: LocalLockRecord): Promise<void> {
    await getDb().locks.put(lock);
  }
  async delete(resourceKey: string): Promise<void> {
    await getDb().locks.delete(resourceKey);
  }
}

export class InMemoryLockStore implements LockStore {
  private map = new Map<string, LocalLockRecord>();
  async get(resourceKey: string): Promise<LocalLockRecord | undefined> {
    return this.map.get(resourceKey);
  }
  async put(lock: LocalLockRecord): Promise<void> {
    this.map.set(lock.resourceKey, { ...lock });
  }
  async delete(resourceKey: string): Promise<void> {
    this.map.delete(resourceKey);
  }
}

/**
 * Soft optimistic lock manager. Locks are stored per-origin so multiple browser
 * tabs of the same user genuinely coordinate. Locks expire after a TTL and are
 * renewed by a heartbeat.
 */
export class LockManager {
  constructor(
    private readonly store: LockStore = new DexieLockStore(),
    private readonly ttlSeconds: number = LOCK_TTL_SECONDS,
  ) {}

  isExpired(lock: LocalLockRecord): boolean {
    if (lock.status !== "active") return true;
    return new Date(lock.expiresAt).getTime() <= now().getTime();
  }

  private buildLock(
    resourceKey: string,
    resourceType: string,
    resourceId: string,
    owner: LockOwner,
  ): LocalLockRecord {
    const acquiredAt = nowIso();
    const expiresAt = new Date(
      now().getTime() + this.ttlSeconds * 1000,
    ).toISOString();
    return {
      resourceKey,
      resourceType,
      resourceId,
      lockToken: newId(),
      ownerUserId: owner.userId,
      ownerEmail: owner.email,
      ownerName: owner.name,
      ownerSessionId: owner.sessionId,
      acquiredAt,
      heartbeatAt: acquiredAt,
      expiresAt,
      status: "active",
    };
  }

  async acquire(
    resourceType: string,
    resourceId: string,
    owner: LockOwner,
  ): Promise<LockResult> {
    const resourceKey = `${resourceType}:${resourceId}`;
    const existing = await this.store.get(resourceKey);

    if (!existing || this.isExpired(existing)) {
      const lock = this.buildLock(resourceKey, resourceType, resourceId, owner);
      await this.store.put(lock);
      return { acquired: true, mode: "owner", lock };
    }

    if (existing.ownerSessionId === owner.sessionId) {
      // Same session re-acquires: renew the lease.
      const renewed: LocalLockRecord = {
        ...existing,
        heartbeatAt: nowIso(),
        expiresAt: new Date(
          now().getTime() + this.ttlSeconds * 1000,
        ).toISOString(),
        status: "active",
      };
      await this.store.put(renewed);
      return { acquired: true, mode: "owner", lock: renewed };
    }

    // Active lock held by another session → read-only.
    return {
      acquired: false,
      mode: "readonly",
      lock: existing,
      heldBy: { name: existing.ownerName, email: existing.ownerEmail },
    };
  }

  async heartbeat(resourceKey: string, lockToken: string): Promise<boolean> {
    const existing = await this.store.get(resourceKey);
    if (!existing || existing.lockToken !== lockToken) return false;
    if (this.isExpired(existing)) return false;
    await this.store.put({
      ...existing,
      heartbeatAt: nowIso(),
      expiresAt: new Date(
        now().getTime() + this.ttlSeconds * 1000,
      ).toISOString(),
    });
    return true;
  }

  async release(resourceKey: string, lockToken: string): Promise<void> {
    const existing = await this.store.get(resourceKey);
    if (!existing || existing.lockToken !== lockToken) return;
    await this.store.put({
      ...existing,
      status: "released",
      expiresAt: nowIso(),
    });
  }

  async get(resourceKey: string): Promise<LocalLockRecord | undefined> {
    return this.store.get(resourceKey);
  }
}

export const lockManager = new LockManager();
