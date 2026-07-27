import { describe, it, expect, beforeEach } from "vitest";
import { getGoogleClients } from "@/infrastructure/google";
import { getMockBackend, mockPriceFor } from "@/infrastructure/google/mocks/mock-backend";

describe("mockPriceFor", () => {
  it("is deterministic for the same ticker and date", () => {
    expect(mockPriceFor("VOO", "2026-07-26")).toBe(mockPriceFor("VOO", "2026-07-26"));
  });

  it("differs across tickers and moves across days", () => {
    expect(mockPriceFor("VOO", "2026-07-26")).not.toBe(mockPriceFor("BND", "2026-07-26"));
    expect(mockPriceFor("VOO", "2026-07-26")).not.toBe(mockPriceFor("VOO", "2026-07-27"));
  });

  it("stays in a plausible range", () => {
    for (const t of ["VOO", "BND", "AAPL", "VTI"]) {
      const p = mockPriceFor(t, "2026-07-26");
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(2000);
    }
  });
});

describe("mock sheets client formula handling", () => {
  beforeEach(() => getMockBackend().resetAll());

  it("evaluates a GOOGLEFINANCE formula only when written with formulas: true", async () => {
    const clients = getGoogleClients();
    await clients.sheets.ensureSheets("mock-ss", [
      { name: "__quotes", headers: ["ticker", "price", "name", "currency", "updated_at"] },
    ]);

    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A2",
      [["VOO", '=GOOGLEFINANCE(A2,"price")']],
      { formulas: true },
    );
    const evaluated = await clients.sheets.getValues("mock-ss", "__quotes!A2:B2", {
      unformatted: true,
    });
    expect(Number(evaluated[0][1])).toBeGreaterThan(0);

    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A3",
      [["BND", '=GOOGLEFINANCE(A3,"price")']],
      // no options => RAW => stored as literal text
    );
    const raw = await clients.sheets.getValues("mock-ss", "__quotes!A3:B3", {
      unformatted: true,
    });
    expect(raw[0][1]).toBe('=GOOGLEFINANCE(A3,"price")');
  });

  it("returns an #N/A string for an unknown ticker", async () => {
    const clients = getGoogleClients();
    await clients.sheets.ensureSheets("mock-ss", [
      { name: "__quotes", headers: ["ticker", "price", "name", "currency", "updated_at"] },
    ]);
    await clients.sheets.updateRange(
      "mock-ss",
      "__quotes!A2",
      [["ZZZZNOTREAL", '=GOOGLEFINANCE(A2,"price")']],
      { formulas: true },
    );
    const vals = await clients.sheets.getValues("mock-ss", "__quotes!A2:B2", {
      unformatted: true,
    });
    expect(String(vals[0][1])).toMatch(/^#N\/A/);
  });
});
