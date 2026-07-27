import { describe, it, expect } from "vitest";
import { moneyWeightedReturnBps, xirr } from "@/domain/engines/portfolio/return-engine";
import { makeContext, makeHolding, makeLot } from "./fixtures";

describe("xirr", () => {
  it("solves a simple one-year 10% return", () => {
    const r = xirr([
      { date: "2026-01-01", amountCents: -1_000_000 },
      { date: "2027-01-01", amountCents: 1_100_000 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(0.1, 3);
  });

  it("solves a two-contribution series", () => {
    // -1000 at t0, -1000 at 6 months, +2200 at 1 year.
    const r = xirr([
      { date: "2026-01-01", amountCents: -100_000 },
      { date: "2026-07-01", amountCents: -100_000 },
      { date: "2027-01-01", amountCents: 220_000 },
    ]) as number;
    expect(r).toBeGreaterThan(0.1);
    expect(r).toBeLessThan(0.3);
  });

  it("handles a loss", () => {
    const r = xirr([
      { date: "2026-01-01", amountCents: -1_000_000 },
      { date: "2027-01-01", amountCents: 900_000 },
    ]) as number;
    expect(r).toBeCloseTo(-0.1, 3);
  });

  it("returns null with fewer than two flows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: "2026-01-01", amountCents: -100 }])).toBeNull();
  });

  it("returns null when every flow shares a sign", () => {
    expect(
      xirr([
        { date: "2026-01-01", amountCents: -100 },
        { date: "2027-01-01", amountCents: -100 },
      ]),
    ).toBeNull();
  });

  it("is order-independent", () => {
    const a = xirr([
      { date: "2027-01-01", amountCents: 1_100_000 },
      { date: "2026-01-01", amountCents: -1_000_000 },
    ]) as number;
    expect(a).toBeCloseTo(0.1, 3);
  });
});

describe("moneyWeightedReturnBps", () => {
  it("annualises a portfolio's return in bps", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-voo", ticker: "VOO" })],
      lots: [
        makeLot({
          holdingId: "h-voo",
          tradeDate: "2026-01-01",
          sharesMicro: 10_000_000,
          costTotalCents: 500_000,
          feesCents: 0,
        }),
      ],
    });
    // 10 shares now worth $600 each = $6,000 vs $5,000 in, one year on.
    const bps = moneyWeightedReturnBps(ctx, { VOO: 60_000 }, "2027-01-01");
    expect(bps).not.toBeNull();
    expect(bps as number).toBeGreaterThan(1900);
    expect(bps as number).toBeLessThan(2100);
  });

  it("returns null with no open lots", () => {
    const ctx = makeContext({ holdings: [], lots: [] });
    expect(moneyWeightedReturnBps(ctx, {}, "2026-07-26")).toBeNull();
  });

  it("returns null when nothing is priced", () => {
    const ctx = makeContext({
      holdings: [makeHolding({ id: "h-x", ticker: "NOPRICE" })],
      lots: [makeLot({ holdingId: "h-x", tradeDate: "2026-01-01", sharesMicro: 1_000_000, costTotalCents: 10_000 })],
    });
    expect(moneyWeightedReturnBps(ctx, {}, "2027-01-01")).toBeNull();
  });
});
