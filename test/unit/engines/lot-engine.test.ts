import { describe, it, expect } from "vitest";
import {
  buildLotViews,
  lotsAtALoss,
  lotsNearingLongTerm,
} from "@/domain/engines/portfolio/lot-engine";
import { makeContext, makeHolding, makeLot } from "./fixtures";

const PRICES = { VOO: 60_000 };

function ctxWith(lots: ReturnType<typeof makeLot>[]) {
  return makeContext({
    holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
    lots,
  });
}

describe("holding period", () => {
  const ctx = ctxWith([
    makeLot({ id: "l1", holdingId: "h-voo", tradeDate: "2025-03-14", sharesMicro: 1_000_000, costTotalCents: 50_000 }),
  ]);

  it("is not long-term exactly one year after the trade date", () => {
    const [v] = buildLotViews(ctx, PRICES, "2026-03-14");
    expect(v.longTermOn).toBe("2026-03-15");
    expect(v.isLongTerm).toBe(false);
    expect(v.daysToLongTerm).toBe(1);
  });

  it("becomes long-term one day later", () => {
    const [v] = buildLotViews(ctx, PRICES, "2026-03-15");
    expect(v.isLongTerm).toBe(true);
    expect(v.daysToLongTerm).toBe(0);
  });

  it("handles a leap-day purchase", () => {
    const leap = ctxWith([
      makeLot({ holdingId: "h-voo", tradeDate: "2024-02-29", sharesMicro: 1_000_000, costTotalCents: 50_000 }),
    ]);
    const [v] = buildLotViews(leap, PRICES, "2025-03-01");
    // 2024-02-29 + 1y clamps to 2025-02-28, so long-term begins 2025-03-01.
    expect(v.longTermOn).toBe("2025-03-01");
    expect(v.isLongTerm).toBe(true);
  });

  it("counts days held from the trade date", () => {
    const [v] = buildLotViews(ctx, PRICES, "2025-04-14");
    expect(v.daysHeld).toBe(31);
  });
});

describe("lot valuation", () => {
  it("values a lot and derives its per-share cost", () => {
    const ctx = ctxWith([
      makeLot({ holdingId: "h-voo", tradeDate: "2026-01-15", sharesMicro: 12_000_000, costTotalCents: 614_880, feesCents: 120 }),
    ]);
    const [v] = buildLotViews(ctx, PRICES, "2026-07-26");
    expect(v.costBasisCents).toBe(615_000);
    expect(v.costPerShareCents).toBe(51_250);
    expect(v.marketValueCents).toBe(720_000);
    expect(v.unrealizedGainCents).toBe(105_000);
    expect(v.hasPrice).toBe(true);
  });

  it("zeroes market value when there is no price", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    const [v] = buildLotViews(ctx, PRICES, "2026-07-26");
    expect(v.hasPrice).toBe(false);
    expect(v.marketValueCents).toBe(0);
    expect(v.unrealizedGainCents).toBe(0);
  });

  it("excludes closed and deleted lots", () => {
    const ctx = ctxWith([
      makeLot({ holdingId: "h-voo", status: "closed" }),
      makeLot({ holdingId: "h-voo", deletedAt: "2026-01-01T00:00:00.000Z" }),
    ]);
    expect(buildLotViews(ctx, PRICES, "2026-07-26")).toEqual([]);
  });
});

describe("lot selection helpers", () => {
  const ctx = ctxWith([
    makeLot({ id: "win", holdingId: "h-voo", tradeDate: "2026-01-01", sharesMicro: 1_000_000, costTotalCents: 40_000, feesCents: 0 }),
    makeLot({ id: "small-loss", holdingId: "h-voo", tradeDate: "2026-02-01", sharesMicro: 1_000_000, costTotalCents: 62_000, feesCents: 0 }),
    makeLot({ id: "big-loss", holdingId: "h-voo", tradeDate: "2026-03-01", sharesMicro: 1_000_000, costTotalCents: 90_000, feesCents: 0 }),
  ]);
  const views = buildLotViews(ctx, PRICES, "2026-07-26");

  it("lists losing lots, biggest paper loss first", () => {
    const losers = lotsAtALoss(views);
    expect(losers.map((v) => v.lotId)).toEqual(["big-loss", "small-loss"]);
  });

  it("lists lots approaching long-term, soonest first", () => {
    const soon = lotsNearingLongTerm(views, 200);
    expect(soon[0].lotId).toBe("win");
    expect(soon.every((v) => !v.isLongTerm)).toBe(true);
  });

  it("returns nothing when the window is zero", () => {
    expect(lotsNearingLongTerm(views, 0)).toEqual([]);
  });
});
