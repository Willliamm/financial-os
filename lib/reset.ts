import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";

/** localStorage key holding the demo mock's simulated "remote" workbook. */
const MOCK_REMOTE_KEY = "financial_os_mock_workbook_v1";

/**
 * Wipe all locally stored financial data: the IndexedDB operational database
 * (entities, commands, sync queue, metadata — including the demo-seed flag) and
 * the demo mock's simulated remote workbook. Keeps the signed-in session and
 * language preference so the user stays logged in.
 *
 * The caller should reload the page afterwards so the app re-bootstraps from a
 * clean state (re-importing from the connected Google workbook, if any).
 */
export async function resetLocalData(): Promise<void> {
  const db = getDb();
  await db.delete();
  resetDbSingleton();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(MOCK_REMOTE_KEY);
    } catch {
      /* storage may be unavailable — non-fatal */
    }
  }
}
