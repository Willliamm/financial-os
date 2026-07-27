import { describe, it, expect } from "vitest";
import type {
  Holding,
  IncomeSource,
  Lot,
  Observation,
  PriceQuote,
  Property,
} from "@/domain/entities";
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

  it("round-trips an Observation through a sheet row", () => {
    const observation: Observation = {
      id: "obs-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      householdId: "h1",
      subjectType: "investment_account",
      subjectId: "acct-1",
      observedAt: "2026-06-30",
      valueCents: 9_600_000,
      source: "manual",
      note: "Statement, mid-year",
    };

    const row = entityToRow("observation", observation);
    const parsed = rowToEntity(
      "observation",
      headersFor("observation"),
      row,
    ) as Observation | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.subjectType).toBe("investment_account");
    expect(parsed?.subjectId).toBe("acct-1");
    expect(parsed?.observedAt).toBe("2026-06-30");
    expect(parsed?.valueCents).toBe(9_600_000);
    expect(parsed?.source).toBe("manual");
    expect(parsed?.note).toBe("Statement, mid-year");
  });

  it("drops an Observation row with a hand-edited, malformed observedAt cell", () => {
    const observation: Observation = {
      id: "obs-2",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      householdId: "h1",
      subjectType: "investment_account",
      subjectId: "acct-1",
      observedAt: "2026-06-30",
      valueCents: 9_600_000,
      source: "manual",
      note: "",
    };

    const headers = headersFor("observation");
    const row = entityToRow("observation", observation);
    const dateIndex = headers.indexOf("observed_at");
    row[dateIndex] = "06/30/2026"; // a plausible hand-edit that isn't ISO

    const parsed = rowToEntity("observation", headers, row);
    expect(parsed).toBeNull();
  });
});

describe("portfolio entities round-trip", () => {
  it("round-trips a Holding", () => {
    const holding: Holding = {
      id: "hold-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      accountId: "acct-1",
      ticker: "VOO",
      name: "Vanguard S&P 500 ETF",
      assetClass: "us_equity",
      targetAllocationBps: 4000,
    };
    const parsed = rowToEntity(
      "holding",
      headersFor("holding"),
      entityToRow("holding", holding),
    ) as Holding | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.ticker).toBe("VOO");
    expect(parsed?.assetClass).toBe("us_equity");
    expect(parsed?.targetAllocationBps).toBe(4000);
  });

  it("round-trips an open Lot with a null close date", () => {
    const lot: Lot = {
      id: "lot-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      holdingId: "hold-1",
      tradeDate: "2026-03-14",
      sharesMicro: 12_000_000,
      costTotalCents: 614_880,
      feesCents: 0,
      status: "open",
      closeDate: null,
      proceedsCents: 0,
      note: "Initial buy, DCA",
    };
    const parsed = rowToEntity(
      "lot",
      headersFor("lot"),
      entityToRow("lot", lot),
    ) as Lot | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.sharesMicro).toBe(12_000_000);
    expect(parsed?.costTotalCents).toBe(614_880);
    expect(parsed?.tradeDate).toBe("2026-03-14");
    expect(parsed?.status).toBe("open");
    expect(parsed?.closeDate).toBeNull();
    expect(parsed?.note).toBe("Initial buy, DCA");
  });

  it("round-trips a PriceQuote", () => {
    const quote: PriceQuote = {
      id: "q-1",
      version: 0,
      createdAt: TS,
      updatedAt: TS,
      deletedAt: null,
      createdBy: "tester@x",
      updatedBy: "tester@x",
      ticker: "VOO",
      quoteDate: "2026-07-26",
      priceCents: 67_914,
      source: "googlefinance",
    };
    const parsed = rowToEntity(
      "price_quote",
      headersFor("price_quote"),
      entityToRow("price_quote", quote),
    ) as PriceQuote | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.priceCents).toBe(67_914);
    expect(parsed?.source).toBe("googlefinance");
  });

  it("drops a Lot row whose trade date is not a real calendar date", () => {
    const headers = headersFor("lot");
    const cols = headers.map(() => "");
    cols[headers.indexOf("id")] = "lot-bad";
    cols[headers.indexOf("version")] = "0";
    cols[headers.indexOf("created_at")] = TS;
    cols[headers.indexOf("updated_at")] = TS;
    cols[headers.indexOf("holding_id")] = "hold-1";
    cols[headers.indexOf("trade_date")] = "03/14/2026";
    cols[headers.indexOf("shares_micro")] = "12000000";
    cols[headers.indexOf("cost_total_cents")] = "614880";
    expect(rowToEntity("lot", headers, cols)).toBeNull();
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
