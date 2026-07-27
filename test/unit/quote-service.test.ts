import { describe, it, expect, beforeEach } from "vitest";
import { parseQuoteCell, readQuoteRows, refreshQuotes, writeQuoteTickers } from "@/infrastructure/market/quote-service";
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
  return stubClientsWithReads([readValues]);
}

/**
 * A SheetsClient stub that replays a sequence of reads, one per call to
 * `getValues` — useful for simulating GOOGLEFINANCE settling over several
 * reads. The last entry repeats once the sequence is exhausted.
 */
function stubClientsWithReads(readSequence: SheetValues[]) {
  const writes: Array<{ range: string; values: SheetValues; formulas?: boolean }> = [];
  let readCount = 0;
  const clients = {
    sheets: {
      async ensureSheets() {},
      async listSheetTitles() { return []; },
      async getValues() {
        const values = readSequence[Math.min(readCount, readSequence.length - 1)];
        readCount += 1;
        return values;
      },
      async batchGetValues() { return {}; },
      async appendRows() { return { updatedRange: "", rowsAdded: 0 }; },
      async updateRange(_id: string, range: string, values: SheetValues, options?: { formulas?: boolean }) {
        writes.push({ range, values, formulas: options?.formulas });
      },
    },
  } as unknown as GoogleClients;
  return { clients, writes, readCount: () => readCount };
}

describe("writeQuoteTickers", () => {
  it("pads a shrinking block so stale formulas are overwritten with blanks", async () => {
    const { clients, writes } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["AAA", "1.00", "", "USD", ""],
      ["BBB", "2.00", "", "USD", ""],
      ["CCC", "3.00", "", "USD", ""],
      ["DDD", "4.00", "", "USD", ""],
      ["EEE", "5.00", "", "USD", ""],
    ]);

    await writeQuoteTickers(clients, "ss", ["VOO", "BND"], "2026-07-27");

    expect(writes).toHaveLength(1);
    const values = writes[0].values;
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values[0][0]).toBe("VOO");
    expect(values[1][0]).toBe("BND");
    for (let i = 2; i < values.length; i++) {
      expect(values[i][0]).toBe("");
    }
  });

  it("writes exactly N rows for a growing block, no stray blanks", async () => {
    const { clients, writes } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["AAA", "1.00", "", "USD", ""],
    ]);

    await writeQuoteTickers(clients, "ss", ["VOO", "BND", "SCHD"], "2026-07-27");

    expect(writes).toHaveLength(1);
    const values = writes[0].values;
    expect(values).toHaveLength(3);
    expect(values.map((r) => r[0])).toEqual(["VOO", "BND", "SCHD"]);
  });
});

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

    const result = await refreshQuotes(clients, "ss", ["VOO", "BND"], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });

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
    await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26", { settleMs: 0, maxReads: 1 });
    const second = await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });

    expect(second.skippedSameDay).toBe(1);
    expect(second.written).toBe(0);
    expect(await repositories.price_quote.list()).toHaveLength(1);
  });

  it("reports tickers with no usable price", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["ZZZ", "#N/A", "", "", ""],
    ]);
    const result = await refreshQuotes(clients, "ss", ["ZZZ"], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });
    expect(result.failed).toEqual(["ZZZ"]);
    expect(result.written).toBe(0);
  });

  it("does nothing when no tickers are requested", async () => {
    const { clients, writes } = stubClients([]);
    const result = await refreshQuotes(clients, "ss", [], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });
    expect(result).toMatchObject({ requested: 0, written: 0 });
    expect(writes).toHaveLength(0);
  });

  it("resolves a lowercase ticker against a quote stored uppercase", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", ""],
    ]);
    const result = await refreshQuotes(clients, "ss", [" voo "], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });
    expect(result.written).toBe(1);
    const quotes = await repositories.price_quote.list();
    expect(quotes[0].ticker).toBe("VOO");
  });

  it("retries while GOOGLEFINANCE is still loading and succeeds once it settles", async () => {
    const { clients } = stubClientsWithReads([
      [["ticker", "price", "name", "currency", "updated_at"]],
      [
        ["ticker", "price", "name", "currency", "updated_at"],
        ["VOO", "Loading...", "", "", ""],
      ],
      [
        ["ticker", "price", "name", "currency", "updated_at"],
        ["VOO", "679.14", "Vanguard S&P 500 ETF", "USD", ""],
      ],
    ]);

    const result = await refreshQuotes(clients, "ss", ["VOO"], "2026-07-26", {
      settleMs: 0,
      maxReads: 3,
    });

    expect(result.written).toBe(1);
    expect(result.failed).toEqual([]);
    const quotes = await repositories.price_quote.list();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].priceCents).toBe(67_914);
  });

  it("does not store a non-USD price and reports the ticker as failed", async () => {
    const { clients } = stubClients([
      ["ticker", "price", "name", "currency", "updated_at"],
      ["VOD", "512.40", "Vodafone Group Plc", "GBP", ""],
    ]);
    const result = await refreshQuotes(clients, "ss", ["VOD"], "2026-07-26", {
      settleMs: 0,
      maxReads: 1,
    });
    expect(result.failed).toEqual(["VOD"]);
    expect(result.written).toBe(0);
    expect(await repositories.price_quote.list()).toHaveLength(0);
  });
});
