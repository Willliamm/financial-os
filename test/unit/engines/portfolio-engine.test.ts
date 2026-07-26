import { describe, it, expect } from "vitest";
import {
  accountValueCents,
  allocationByAssetClass,
  allocationDrift,
  buildPositions,
  portfolioCostBasisCents,
  portfolioUnrealizedGainCents,
  portfolioValueCents,
} from "@/domain/engines/portfolio/portfolio-engine";
import { makeContext, makeHolding, makeInvestment, makeLot } from "./fixtures";

const PRICES = { VOO: 60_000, BND: 7_000 };

function twoLotContext() {
  const account = makeInvestment({ id: "acct-1", currentBalanceCents: 1 });
  const holding = makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" });
  return makeContext({
    investmentAccounts: [account],
    holdings: [holding],
    lots: [
      makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 500 }),
      makeLot({ holdingId: "h-voo", sharesMicro: 5_000_000, costTotalCents: 275_000, feesCents: 0 }),
    ],
  });
}

describe("buildPositions", () => {
  it("aggregates open lots into one position", () => {
    const [p] = buildPositions(twoLotContext(), PRICES);
    expect(p.sharesMicro).toBe(15_000_000);
    expect(p.costBasisCents).toBe(500_000 + 500 + 275_000); // fees included
    expect(p.marketValueCents).toBe(900_000); // 15 shares x $600
    expect(p.unrealizedGainCents).toBe(900_000 - 775_500);
    expect(p.hasPrice).toBe(true);
    expect(p.lotCount).toBe(2);
  });

  it("excludes closed and soft-deleted lots", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [
        makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000 }),
        makeLot({ holdingId: "h-voo", sharesMicro: 99_000_000, costTotalCents: 999_000, status: "closed" }),
        makeLot({ holdingId: "h-voo", sharesMicro: 77_000_000, costTotalCents: 777_000, deletedAt: "2026-01-01T00:00:00.000Z" }),
      ],
    });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.sharesMicro).toBe(10_000_000);
    expect(p.lotCount).toBe(1);
  });

  it("keeps a holding with no lots visible, at zero", () => {
    const ctx = makeContext({ holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })], lots: [] });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.sharesMicro).toBe(0);
    expect(p.costBasisCents).toBe(0);
    expect(p.marketValueCents).toBe(0);
    expect(p.lotCount).toBe(0);
  });

  it("reports a missing price rather than guessing", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 100_000 })],
    });
    const [p] = buildPositions(ctx, PRICES);
    expect(p.hasPrice).toBe(false);
    expect(p.marketValueCents).toBe(0);
    expect(p.unrealizedGainCents).toBe(0);
    expect(p.simpleReturnBps).toBe(0);
  });

  it("computes simple return in bps", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    // 10 shares at $600 = $6,000 vs $5,000 basis => +20% => 2000 bps
    expect(buildPositions(ctx, PRICES)[0].simpleReturnBps).toBe(2000);
  });
});

describe("portfolio totals and allocation", () => {
  const ctx = makeContext({
    holdings: [
      makeHolding({ id: "h-voo", ticker: "VOO", assetClass: "us_equity", targetAllocationBps: 6000 }),
      makeHolding({ id: "h-bnd", ticker: "BND", assetClass: "bond", targetAllocationBps: 4000 }),
    ],
    lots: [
      makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 }),
      makeLot({ holdingId: "h-bnd", sharesMicro: 10_000_000, costTotalCents: 60_000, feesCents: 0 }),
    ],
  });
  const positions = buildPositions(ctx, PRICES);

  it("sums value, basis and gain", () => {
    expect(portfolioValueCents(positions)).toBe(600_000 + 70_000);
    expect(portfolioCostBasisCents(positions)).toBe(560_000);
    expect(portfolioUnrealizedGainCents(positions)).toBe(110_000);
  });

  it("weights allocation by asset class to 10000 bps", () => {
    const slices = allocationByAssetClass(positions);
    const total = slices.reduce((s, x) => s + x.weightBps, 0);
    expect(total).toBe(10_000);
    expect(slices.find((s) => s.assetClass === "us_equity")?.valueCents).toBe(600_000);
  });

  it("gives each position its share of the portfolio in bps", () => {
    // 600000 and 70000 of 670000 => 8955 and 1045
    expect(positions.find((p) => p.ticker === "VOO")?.weightBps).toBe(8955);
    expect(positions.find((p) => p.ticker === "BND")?.weightBps).toBe(1045);
  });

  it("leaves weight at zero when nothing is priced", () => {
    const unpriced = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(buildPositions(unpriced, {})[0].weightBps).toBe(0);
  });

  it("reports drift only for holdings with a target", () => {
    const drift = allocationDrift(ctx, positions);
    expect(drift).toHaveLength(2);
    const voo = drift.find((d) => d.ticker === "VOO")!;
    // 600000 / 670000 = 8955 bps actual vs 6000 target
    expect(voo.actualBps).toBe(8955);
    expect(voo.driftBps).toBe(2955);
  });

  it("returns an empty drift list when no target is set", () => {
    const noTarget = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO", targetAllocationBps: 0 })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(allocationDrift(noTarget, buildPositions(noTarget, PRICES))).toEqual([]);
  });
});

describe("accountValueCents", () => {
  it("uses the account balance when it has no holdings", () => {
    const account = makeInvestment({ id: "acct-none", currentBalanceCents: 4_200_000 });
    const ctx = makeContext({ investmentAccounts: [account] });
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(4_200_000);
  });

  it("uses summed positions when the account has holdings", () => {
    const ctx = twoLotContext();
    const account = ctx.investmentAccounts[0];
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(900_000);
  });

  it("falls back to cost basis for a position with no price", () => {
    const account = makeInvestment({ id: "acct-1", currentBalanceCents: 1 });
    const ctx = makeContext({
      investmentAccounts: [account],
      holdings: [makeHolding({ id: "h-x", accountId: "acct-1", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", sharesMicro: 1_000_000, costTotalCents: 123_000, feesCents: 0 })],
    });
    expect(accountValueCents(account, buildPositions(ctx, PRICES))).toBe(123_000);
  });
});
