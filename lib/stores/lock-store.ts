"use client";

import { create } from "zustand";
import { LOCK_HEARTBEAT_MS } from "@/lib/constants";
import { getSessionId } from "@/lib/session";
import {
  type LockMode,
  type LockResult,
  lockManager,
} from "@/infrastructure/sync/lock-manager";
import { useAuthStore } from "./auth-store";

interface HeldLock {
  resourceKey: string;
  lockToken: string;
  mode: LockMode;
  heldByName?: string;
  heldByEmail?: string;
  expiresAt: string;
}

interface LockState {
  held: Record<string, HeldLock>;
  acquire: (resourceType: string, resourceId: string) => Promise<LockResult>;
  release: (resourceKey: string) => Promise<void>;
}

const heartbeats = new Map<string, ReturnType<typeof setInterval>>();

function stopHeartbeat(resourceKey: string) {
  const timer = heartbeats.get(resourceKey);
  if (timer) {
    clearInterval(timer);
    heartbeats.delete(resourceKey);
  }
}

export const useLockStore = create<LockState>((set, get) => ({
  held: {},

  async acquire(resourceType, resourceId) {
    const user = useAuthStore.getState().user;
    const owner = {
      userId: user?.sub ?? "local",
      email: user?.email ?? "local@financial-os",
      name: user?.name ?? "You",
      sessionId: getSessionId(),
    };
    const result = await lockManager.acquire(resourceType, resourceId, owner);
    const resourceKey = result.lock.resourceKey;

    set((s) => ({
      held: {
        ...s.held,
        [resourceKey]: {
          resourceKey,
          lockToken: result.lock.lockToken,
          mode: result.mode,
          heldByName: result.heldBy?.name,
          heldByEmail: result.heldBy?.email,
          expiresAt: result.lock.expiresAt,
        },
      },
    }));

    if (result.acquired) {
      stopHeartbeat(resourceKey);
      const timer = setInterval(() => {
        void lockManager.heartbeat(resourceKey, result.lock.lockToken);
      }, LOCK_HEARTBEAT_MS);
      heartbeats.set(resourceKey, timer);
    }

    return result;
  },

  async release(resourceKey) {
    const held = get().held[resourceKey];
    if (held) {
      await lockManager.release(resourceKey, held.lockToken);
    }
    stopHeartbeat(resourceKey);
    set((s) => {
      const next = { ...s.held };
      delete next[resourceKey];
      return { held: next };
    });
  },
}));
