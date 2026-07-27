import { describe, it, expect } from "vitest";
import { selectLatestPrices } from "@/lib/queries/market-data";
import { makeContext, makeQuote } from "./engines/fixtures";

describe("selectLatestPrices", () => {
  it("picks the newest quote per ticker", () => {
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-20", priceCents: 60_000 }),
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 67_914 }),
        makeQuote({ ticker: "BND", quoteDate: "2026-07-26", priceCents: 7_231 }),
      ],
    });
    const { prices, asOf } = selectLatestPrices(ctx);
    expect(prices.VOO).toBe(67_914);
    expect(prices.BND).toBe(7_231);
    expect(asOf.VOO).toBe("2026-07-26");
  });

  it("ignores soft-deleted quotes", () => {
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-20", priceCents: 60_000 }),
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 99_999, deletedAt: "2026-07-27T00:00:00.000Z" }),
      ],
    });
    expect(selectLatestPrices(ctx).prices.VOO).toBe(60_000);
  });

  it("returns empty maps with no quotes", () => {
    expect(selectLatestPrices(makeContext({}))).toEqual({ prices: {}, asOf: {} });
  });
});
