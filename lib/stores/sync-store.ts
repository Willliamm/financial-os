"use client";

import { create } from "zustand";
import { createLogger } from "@/lib/logger";

// NOTE: the heavy data-layer modules (Dexie, the sync engine, Google clients,
// Zod schemas) are imported dynamically inside the async actions below. Importing
// them at the top would pull the entire offline-data engine into the shared
// bundle that even the login page loads. `setOnline`/`setWorkbookId` stay
// synchronous and depend on nothing heavy.

const log = createLogger("sync-store");

export type SyncStatus =
  | "idle"
  | "dirty"
  | "syncing"
  | "synced"
  | "offline"
  | "failed"
  | "conflict";

interface SyncState {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingCount: number;
  conflictCount: number;
  online: boolean;
  workbookId: string | null;
  setWorkbookId: (id: string | null) => void;
  setOnline: (online: boolean) => void;
  refreshCounts: () => Promise<void>;
  sync: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: "idle",
  lastSyncedAt: null,
  pendingCount: 0,
  conflictCount: 0,
  online: true,
  workbookId: null,

  setWorkbookId: (id) => set({ workbookId: id }),
  setOnline: (online) =>
    set((s) => ({
      online,
      status: !online
        ? "offline"
        : s.pendingCount > 0
          ? "dirty"
          : s.status === "offline"
            ? "idle"
            : s.status,
    })),

  async refreshCounts() {
    const [{ countPending }, { countOpenConflicts }, { metadataRepo, META_KEYS }] =
      await Promise.all([
        import("@/infrastructure/sync/sync-engine"),
        import("@/infrastructure/sync/conflict-resolver"),
        import("@/infrastructure/db/metadata-repo"),
      ]);
    const [pendingCount, conflictCount, lastSyncedAt] = await Promise.all([
      countPending(),
      countOpenConflicts(),
      metadataRepo.get(META_KEYS.lastSyncedAt),
    ]);
    set((s) => ({
      pendingCount,
      conflictCount,
      lastSyncedAt: lastSyncedAt ?? s.lastSyncedAt,
      status:
        conflictCount > 0
          ? "conflict"
          : !s.online
            ? "offline"
            : pendingCount > 0
              ? "dirty"
              : s.status === "syncing"
                ? "syncing"
                : "idle",
    }));
  },

  async sync() {
    const { workbookId, online } = get();
    if (!workbookId) {
      log.warn("sync called before workbook ready");
      return;
    }
    if (!online) {
      set({ status: "offline" });
      return;
    }
    set({ status: "syncing" });
    try {
      const [{ syncAll }, { getGoogleClients }] = await Promise.all([
        import("@/infrastructure/sync/sync-engine"),
        import("@/infrastructure/google"),
      ]);
      await syncAll(getGoogleClients(), workbookId);
      await get().refreshCounts();
      set((s) => ({
        status: s.conflictCount > 0 ? "conflict" : "synced",
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (error) {
      log.error("sync failed", error);
      set({ status: "failed" });
    }
  },
}));
