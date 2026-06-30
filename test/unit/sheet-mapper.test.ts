import { describe, it, expect } from "vitest";
import type { IncomeSource, Property } from "@/domain/entities";
import { headersFor } from "@/infrastructure/sync/sheet-schema";
import {
  entityToRow,
  rowToEntity,
  findRowNumberById,
} from "@/infrastructure/sync/sheet-mapper";

const TS = "2026-01-01T00:00:00.000Z";

function buildProperty(): Property {
  return {
    id: "prop-1",
    version: 0,
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    createdBy: "tester@x",
    updatedBy: "tester@x",
    householdId: "h1",
    name: "Lake House",
    propertyType: "sfh",
    ownershipType: "personal",
    street: "1 Main St",
    city: "Tampa",
    state: "FL",
    zip: "33601",
    purchaseDate: null,
    purchasePriceCents: 60_000_000,
    currentValueCents: 75_000_000,
    downPaymentCents: 12_000_000,
    closingCostsCents: 500_000,
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2400,
    yearBuilt: 2008,
    hoaMonthlyCents: 0,
    cddAnnualCents: 0,
    propertyTaxAnnualCents: 700_000,
    insuranceAnnualCents: 250_000,
    maintenanceAnnualCents: 120_000,
    appreciationRateBps: 350,
    rentMonthlyCents: 420_000,
    vacancyRateBps: 500,
    managementFeeBps: 800,
    status: "owned",
    notes: "Primary rental",
  };
}

describe("sheet-mapper round-trip", () => {
  it("round-trips a Property through a sheet row", () => {
    const property = buildProperty();
    const row = entityToRow("property", property);
    const parsed = rowToEntity("property", headersFor("property"), row);

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      id: "prop-1",
      name: "Lake House",
      currentValueCents: 75_000_000,
      rentMonthlyCents: 420_000,
      appreciationRateBps: 350,
      status: "owned",
      propertyType: "sfh",
      ownershipType: "personal",
    });
  });

  it("round-trips an IncomeSource keeping a real boolean and a null personId", () => {
    const income: IncomeSource = {
      id: "inc-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      householdId: "h1",
      personId: null,
      name: "Consulting LLC",
      type: "llc",
      annualAmountCents: 18_000_000,
      growthRateBps: 300,
      startDate: null,
      endDate: null,
      taxTreatment: "ordinary",
      active: false,
    };

    const row = entityToRow("income_source", income);
    const parsed = rowToEntity(
      "income_source",
      headersFor("income_source"),
      row,
    ) as IncomeSource | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.active).toBe(false);
    expect(typeof parsed?.active).toBe("boolean");
    expect(parsed?.personId).toBeNull();
    expect(parsed?.annualAmountCents).toBe(18_000_000);
  });

  it("drops one invalid row (missing required fields) by returning null", () => {
    const headers = headersFor("property");
    // All cells blank: no id, no name, no currentValueCents -> Zod fails.
    const badRow = headers.map(() => "");
    const parsed = rowToEntity("property", headers, badRow);
    expect(parsed).toBeNull();
  });
});

describe("findRowNumberById", () => {
  const values = [
    ["id", "name"],
    ["a", "Foo"],
    ["b", "Bar"],
    ["c", "Baz"],
  ];

  it("returns the 1-based row number for a present id", () => {
    expect(findRowNumberById(values, "b")).toBe(3);
    expect(findRowNumberById(values, "a")).toBe(2);
  });

  it("returns null when the id is absent", () => {
    expect(findRowNumberById(values, "zzz")).toBeNull();
  });
});
