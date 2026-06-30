"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import type { BaseEntity, EntityType } from "@/domain/entities/base";
import {
  createEntity,
  deleteEntity,
  updateEntity,
  type Actor,
} from "@/infrastructure/db/command-service";
import { getSessionId } from "@/lib/session";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useSyncStore } from "@/lib/stores/sync-store";
import { useInvalidateFinancialData } from "@/lib/queries/financial-data";
import { isUsingMockGoogle } from "@/infrastructure/google";

/** Toast description for a save, honest about demo (mock) vs real sync. */
function syncDescription(sync?: boolean): string | undefined {
  if (!sync) return undefined;
  return isUsingMockGoogle()
    ? "Saved to your local workbook."
    : "Syncing to your Google Sheet…";
}

export function useEntityActions() {
  const user = useAuthStore((s) => s.user);
  const invalidate = useInvalidateFinancialData();
  const refreshCounts = useSyncStore((s) => s.refreshCounts);
  const sync = useSyncStore((s) => s.sync);

  const actor: Actor = {
    userId: user?.sub ?? "local",
    userEmail: user?.email ?? "local@financial-os",
    sessionId: getSessionId(),
  };

  const after = useCallback(
    async (opts: { sync?: boolean }) => {
      await invalidate();
      await refreshCounts();
      if (opts.sync) void sync();
    },
    [invalidate, refreshCounts, sync],
  );

  const create = useCallback(
    async <T extends BaseEntity>(
      type: EntityType,
      payload: Partial<T>,
      opts: { sync?: boolean } = {},
    ) => {
      const result = await createEntity<T>(type, payload, actor);
      await after(opts);
      toast.success("Saved locally", {
        description: syncDescription(opts.sync),
      });
      return result.entity;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [after, actor.userEmail],
  );

  const update = useCallback(
    async <T extends BaseEntity>(
      type: EntityType,
      payload: Partial<T> & { id: string },
      opts: { sync?: boolean } = {},
    ) => {
      const result = await updateEntity<T>(type, payload, actor);
      await after(opts);
      toast.success("Changes saved locally", {
        description: syncDescription(opts.sync),
      });
      return result.entity;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [after, actor.userEmail],
  );

  const remove = useCallback(
    async (type: EntityType, id: string, opts: { sync?: boolean } = {}) => {
      await deleteEntity(type, id, actor);
      await after(opts);
      toast.success("Deleted");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [after, actor.userEmail],
  );

  return { create, update, remove };
}
