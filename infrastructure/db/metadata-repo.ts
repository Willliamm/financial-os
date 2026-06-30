import { getDb } from "./dexie";

/** Small helper for the local key/value metadata table. */
export const metadataRepo = {
  async get(key: string): Promise<string | undefined> {
    const row = await getDb().metadata.get(key);
    return row?.value;
  },
  async set(key: string, value: string): Promise<void> {
    await getDb().metadata.put({ key, value });
  },
  async all(): Promise<Record<string, string>> {
    const rows = await getDb().metadata.toArray();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
};

export const META_KEYS = {
  lastSyncedAt: "last_synced_at",
  schemaVersion: "schema_version",
  workbookId: "workbook_id",
  workbookName: "workbook_name",
  onboardingComplete: "onboarding_complete",
  seeded: "seeded",
} as const;
