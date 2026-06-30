import { describe, it, expect, beforeEach } from "vitest";
import type { Property } from "@/domain/entities";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { createEntity, updateEntity } from "@/infrastructure/db/command-service";
import { repositories } from "@/infrastructure/db/repositories";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend } from "@/infrastructure/google/mocks/mock-backend";
import { initWorkbook } from "@/infrastructure/sync/workbook-manager";
import {
  importWorkbook,
  pushPending,
  countPending,
} from "@/infrastructure/sync/sync-engine";
import { headersFor } from "@/infrastructure/sync/sheet-schema";

function basePropertyInput(): Partial<Property> {
  return {
    householdId: "h1",
    name: "Test House",
    propertyType: "sfh",
    ownershipType: "personal",
    street: "1 Main St",
    city: "Tampa",
    state: "FL",
    zip: "33601",
    purchaseDate: null,
    purchasePriceCents: 40_000_000,
    currentValueCents: 50_000_000,
    downPaymentCents: 8_000_000,
    closingCostsCents: 500_000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1800,
    yearBuilt: 2005,
    hoaMonthlyCents: 0,
    cddAnnualCents: 0,
    propertyTaxAnnualCents: 600_000,
    insuranceAnnualCents: 200_000,
    maintenanceAnnualCents: 100_000,
    appreciationRateBps: 300,
    rentMonthlyCents: 350_000,
    vacancyRateBps: 500,
    managementFeeBps: 0,
    status: "owned",
    notes: "",
  };
}

/** Data rows (excluding the header) of a worksheet for a given entity id. */
function propertyRowsForId(id: string): string[][] {
  const sheet = getMockBackend().getSheet("properties");
  return sheet.slice(1).filter((row) => row[0] === id);
}

describe("sync flow (Dexie + mock Google)", () => {
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

  it("creates workbook and pushes a local entity to the sheet, then re-imports it", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);

    expect(wb.id).toBeTruthy();
    // __meta has its header row plus seeded rows.
    expect(getMockBackend().getSheet("__meta").length).toBeGreaterThan(1);

    const created = await createEntity<Property>("property", basePropertyInput());
    const id = created.entity.id;
    expect(id).toBeTruthy();

    expect(await countPending()).toBe(1);

    const summary = await pushPending(clients, wb.id);
    expect(summary.pushed).toBe(1);

    // The mock "properties" sheet now holds a data row with our id.
    const rows = propertyRowsForId(id);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe(id);

    // Clear local entities only, then re-import from the sheet.
    await getDb().entities.clear();
    expect(await repositories.property.list()).toHaveLength(0);

    await importWorkbook(clients, wb.id);

    const reimported = await repositories.property.list();
    expect(reimported).toHaveLength(1);
    expect(reimported[0].name).toBe("Test House");
    expect(reimported[0].id).toBe(id);
  });

  it("update then push rewrites the same row (no duplicate)", async () => {
    const clients = getGoogleClients();
    const wb = await initWorkbook(clients);

    const created = await createEntity<Property>("property", basePropertyInput());
    const id = created.entity.id;
    await pushPending(clients, wb.id);

    // One data row exists after the first push.
    expect(propertyRowsForId(id)).toHaveLength(1);

    await updateEntity<Property>("property", { id, currentValueCents: 60_000_000 });
    expect(await countPending()).toBe(1);

    const summary = await pushPending(clients, wb.id);
    expect(summary.pushed).toBe(1);

    // Still exactly one row, and the value column reflects the update.
    const rows = propertyRowsForId(id);
    expect(rows).toHaveLength(1);

    const valueCol = headersFor("property").indexOf("current_value_cents");
    expect(rows[0][valueCol]).toBe("60000000");
  });
});
