import { describe, it, expect, beforeEach } from "vitest";
import type { Observation } from "@/domain/entities";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { createEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend } from "@/infrastructure/google/mocks/mock-backend";
import { initWorkbook } from "@/infrastructure/sync/workbook-manager";
import { importWorkbook, pushPending } from "@/infrastructure/sync/sync-engine";
import { headersFor } from "@/infrastructure/sync/sheet-schema";

function baseObservation(): Partial<Observation> {
  return {
    householdId: "h1",
    subjectType: "investment_account",
    subjectId: "acct-1",
    observedAt: "2026-06-30",
    valueCents: 9_600_000,
    source: "manual",
    note: "Mid-year statement",
  };
}

describe("observation flow (Dexie + mock Google)", () => {
  beforeEach(async () => {
    resetDbSingleton();
    const db = getDb();
    await Promise.all(
      [
        db.entities,
        db.commands,
        db.syncQueue,
        db.locks,
        db.conflicts,
        db.metadata,
        db.snapshots,
      ].map((t) => t.clear()),
    );
    getMockBackend().resetAll();
  });

  it("writes entity, command and queue item in one transaction", async () => {
    const created = await createEntity<Observation>(
      "observation",
      baseObservation(),
    );
    const id = created.entity.id;
    const db = getDb();

    expect(await db.entities.get(id)).toBeTruthy();
    expect(
      await db.commands.where("entityId").equals(id).count(),
    ).toBe(1);
    expect(await db.syncQueue.where("entityType").equals("observation").count()).toBe(1);
  });

  it("pushes an observation to the sheet and re-imports it", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);

    const created = await createEntity<Observation>(
      "observation",
      baseObservation(),
    );
    const id = created.entity.id;

    const summary = await pushPending(clients, wb.id);
    expect(summary.pushed).toBe(1);

    const rows = getMockBackend()
      .getSheet("observations")
      .slice(1)
      .filter((row) => row[0] === id);
    expect(rows).toHaveLength(1);

    const valueCol = headersFor("observation").indexOf("value_cents");
    expect(rows[0][valueCol]).toBe("9600000");

    await getDb().entities.clear();
    await importWorkbook(clients, wb.id);

    const reimported = await repositories.observation.list();
    expect(reimported).toHaveLength(1);
    expect(reimported[0].observedAt).toBe("2026-06-30");
    expect(reimported[0].subjectType).toBe("investment_account");
  });
});
