import { describe, it, expect } from "vitest";
import { selectLatestPrices } from "@/lib/queries/market-data";
import { buildPositions } from "@/domain/engines/portfolio/portfolio-engine";
import { makeContext, makeHolding, makeQuote } from "./engines/fixtures";

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

  it("lets a later-created same-day quote win over an earlier one (a correction sticks)", () => {
    // context.priceQuotes arrives in EntityRepository.list() order, which is
    // ascending by createdAt — so the second entry here is the one created
    // more recently, e.g. the user noticing a mistake and re-entering it.
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 1 }), // wrong, saved first
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 67_914 }), // corrected
      ],
    });
    expect(selectLatestPrices(ctx).prices.VOO).toBe(67_914);
  });

  it("normalizes ticker case so a same-day tie is decided correctly", () => {
    const ctx = makeContext({
      priceQuotes: [
        makeQuote({ ticker: "voo", quoteDate: "2026-07-26", priceCents: 60_000 }),
        makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 67_914 }),
      ],
    });
    expect(selectLatestPrices(ctx).prices.VOO).toBe(67_914);
  });

  it("lets a hand-typed lowercase ticker resolve against a quote stored uppercase", () => {
    // A holding entered as "voo" must still find the price Google/the sheet
    // stored under "VOO" — the two sides of the lookup must never disagree.
    const ctx = makeContext({
      holdings: [makeHolding({ ticker: "voo" })],
      priceQuotes: [makeQuote({ ticker: "VOO", quoteDate: "2026-07-26", priceCents: 67_914 })],
    });
    const { prices } = selectLatestPrices(ctx);
    const [position] = buildPositions(ctx, prices);
    expect(position.hasPrice).toBe(true);
  });
});
