import { describe, it, expect, beforeEach } from "vitest";
import { parseQuoteCell, readQuoteRows, refreshQuotes } from "@/infrastructure/market/quote-service";
import { getDb, resetDbSingleton } from "@/infrastructure/db/dexie";
import { repositories } from "@/infrastructure/db/repositories";
import type { GoogleClients, SheetValues } from "@/infrastructure/google/google-api-types";

describe("parseQuoteCell", () => {
  it("parses plain numbers and currency text", () => {
    expect(parseQuoteCell("679.14")).toBe(67_914);
    expect(parseQuoteCell("$512.40")).toBe(51_240);
    expect(parseQuoteCell("1,234.56")).toBe(123_456);
  });

  it("rounds to the nearest cent", () => {
    expect(parseQuoteCell("512.4013")).toBe(51_240);
    expect(parseQuoteCell("512.4050")).toBe(51_241);
  });

  it("rejects errors, blanks and nonsense", () => {
    expect(parseQuoteCell("#N/A")).toBeNull();
    expect(parseQuoteCell("#N/A (returned no data.)")).toBeNull();
    expect(parseQuoteCell("#ERROR!")).toBeNull();
    expect(parseQuoteCell("")).toBeNull();
    expect(parseQuoteCell("   ")).toBeNull();
    expect(parseQuoteCell("Loading...")).toBeNull();
    expect(parseQuoteCell("-5")).toBeNull();
  });
});

/** A SheetsClient stub that records writes and replays a fixed read. */
function stubClients(readValues: SheetValues) {
  const writes: Array<{ range: string; values: SheetValues; formulas?: boolean }> = [];
  const clients = {
    sheets: {
      async ensureSheets() {},
      async listSheetTitles() { return []; },
      async getValues() { return readValues; },
      async batchGetValues() { return {}; },
      async appendRows() { return { updatedRange: "", rowsAdded: 0 }; },
      async updateRange(_id: string, range: string, values: SheetValues, options?: { formulas?: boolean }) {
        writes.push({ range, values, formulas: options?.formulas });
      },
    },
  } as unknown as GoogleClients;
  return { clients, writes };
}

describe("readQuoteRows", () => {
  it("maps the sheet block into quote rows", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", "2026-07-26"],
      ["ZZZ", "#N/A", "", "", "2026-07-26"],
    ]);
    const rows = await readQuoteRows(clients, "ss");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ ticker: "VOO", priceCents: 67_914, name: "Vanguard S&P 500 ETF" });
    expect(rows[1]).toMatchObject({ ticker: "ZZZ", priceCents: null });
  });
});

describe("refreshQuotes", () => {
  beforeEach(async () => {
    resetDbSingleton();
    const db = getDb();
    await Promise.all([db.entities, db.commands, db.syncQueue].map((t) => t.clear()));
  });

  it("writes the ticker block as formulas and persists one quote per ticker", async () => {
    const { clients, writes } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", ""],
      ["BND", "72.31", "Vanguard Total Bond", "USD", ""],
    ]);

    const result = await refreshQuotes(clients, "ss", ["VOO", "BND"], "2026-07-26");

    expect(writes[0].formulas).toBe(true);
    expect(String(writes[0].values[0][1])).toMatch(/GOOGLEFINANCE/);
    expect(result).toMatchObject({ requested: 2, written: 2, skippedSameDay: 0, failed: [] });

    const quotes = await repositories.price_quote.list();
    expect(quotes).toHaveLength(2);
    expect(quotes.map((q) => q.ticker).sort()).toEqual(["BND", "VOO"]);
    expect(quotes.every((q) => q.source === "googlefinance")).toBe(true);
  });

  it("skips a ticker that already has a quote for the same day", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "", "USD", ""],
    ]);
    await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26");
    const second = await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26");

    expect(second.skippedSameDay).toBe(1);
    expect(second.written).toBe(0);
    expect(await repositories.price_quote.list()).toHaveLength(1);
  });

  it("reports tickers with no usable price", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["ZZZ", "#N/A", "", "", ""],
    ]);
    const result = await refreshQuotes(clients, "ss", ["ZZZ"], "2026-07-26");
    expect(result.failed).toEqual(["ZZZ"]);
    expect(result.written).toBe(0);
  });

  it("does nothing when no tickers are requested", async () => {
    const { clients, writes } = stubClients([]);
    const result = await refreshQuotes(clients, "ss", [], "2026-07-26");
    expect(result).toMatchObject({ requested: 0, written: 0 });
    expect(writes).toHaveLength(0);
  });
});
