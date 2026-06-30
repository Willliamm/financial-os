"use client";

import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { EntityType } from "@/domain/entities/base";
import type { FinancialContext } from "@/domain/context";
import { emptyContext } from "@/domain/context";
import { loadFinancialContext } from "@/infrastructure/db/repositories";

export const queryKeys = {
  context: ["financial-context"] as const,
  entity: (type: EntityType) => ["entity", type] as const,
};

/** Load the full financial context (all entities) from IndexedDB. */
export function useFinancialContext() {
  return useQuery<FinancialContext>({
    queryKey: queryKeys.context,
    queryFn: loadFinancialContext,
    // `initialData` keeps `data` always defined for an instant first render.
    // A short staleTime avoids re-reading IndexedDB (and re-initializing every
    // chart) on each navigation, while still picking up changes: mutations and
    // the workbook bootstrap explicitly invalidate this query.
    initialData: emptyContext,
    staleTime: 30_000,
  });
}

/** Invalidate cached reads after a command mutates the local database. */
export async function invalidateFinancialData(
  client: QueryClient,
): Promise<void> {
  await client.invalidateQueries({ queryKey: queryKeys.context });
  await client.invalidateQueries({ queryKey: ["entity"] });
}

/** Hook returning a function that refreshes all financial reads. */
export function useInvalidateFinancialData() {
  const client = useQueryClient();
  return () => invalidateFinancialData(client);
}
