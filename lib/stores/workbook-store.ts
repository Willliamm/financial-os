"use client";

import { create } from "zustand";
import { getGoogleClients, isUsingMockGoogle } from "@/infrastructure/google";
import type { WorkbookRef } from "@/infrastructure/google/google-api-types";
import { metadataRepo, META_KEYS } from "@/infrastructure/db/metadata-repo";
import { importWorkbook } from "@/infrastructure/sync/sync-engine";
import { runMigrations } from "@/infrastructure/sync/migrations";
import { initWorkbook } from "@/infrastructure/sync/workbook-manager";
import { seedDemoDataIfEmpty } from "@/lib/seed/demo-data";
import { createLogger } from "@/lib/logger";
import { useSyncStore } from "./sync-store";

const log = createLogger("workbook-store");

export type WorkbookStatus =
  | "uninitialized"
  | "initializing"
  | "ready"
  | "error";

interface WorkbookState {
  status: WorkbookStatus;
  workbook: WorkbookRef | null;
  error: string | null;
  step: string;
  init: () => Promise<void>;
}

export const useWorkbookStore = create<WorkbookState>((set, get) => ({
  status: "uninitialized",
  workbook: null,
  error: null,
  step: "",

  async init() {
    if (get().status === "initializing" || get().status === "ready") return;
    set({ status: "initializing", error: null, step: "Connecting workbook" });
    const clients = getGoogleClients();
    const syncStore = useSyncStore.getState();

    try {
      const workbook = await initWorkbook(clients);
      set({ workbook, step: "Checking schema" });
      await metadataRepo.set(META_KEYS.workbookId, workbook.id);
      await metadataRepo.set(META_KEYS.workbookName, workbook.name);
      syncStore.setWorkbookId(workbook.id);

      await runMigrations(clients, workbook.id);

      set({ step: "Importing data" });
      await importWorkbook(clients, workbook.id);

      // Seed the sample "Rivera Household" ONLY in demo mode, so a first-time
      // demo user sees a populated app. With a real Google account we never
      // inject fake data — the user's (possibly empty) workbook is the source
      // of truth and they start with their own data.
      set({ step: "Preparing your dashboard" });
      const seeded = isUsingMockGoogle() ? await seedDemoDataIfEmpty() : false;
      if (seeded) {
        set({ step: "Saving starter data" });
        await useSyncStore.getState().sync();
      }

      await useSyncStore.getState().refreshCounts();
      set({ status: "ready", step: "" });
      log.info("Workbook ready", { id: workbook.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("init failed", message);
      set({ status: "error", error: message });
    }
  },
}));
