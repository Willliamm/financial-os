import { describe, it, expect } from "vitest";
import {
  totalAssetsCents,
  totalLiabilitiesCents,
  netWorthCents,
  monthlyActiveIncomeCents,
  monthlyExpensesCents,
  savingsRate,
  projectNetWorth,
} from "@/domain/engines/net-worth/net-worth-engine";
import {
  makeContext,
  makeProperty,
  makeLoan,
  makeInvestment,
  makeIncome,
  makeExpense,
  makeHolding,
  makeLot,
} from "./fixtures";

function buildContext() {
  const property = makeProperty({ id: "prop-nw" });
  const loan = makeLoan({ id: "loan-nw", propertyId: "prop-nw" });
  return makeContext({
    properties: [property],
    loans: [loan],
    investmentAccounts: [makeInvestment()],
    incomeSources: [makeIncome()],
    expenses: [makeExpense()],
  });
}

describe("net-worth-engine totals", () => {
  const ctx = buildContext();

  it("sums assets, liabilities, and net worth", () => {
    expect(totalAssetsCents(ctx)).toBe(60_000_000); // $500k property + $100k invest
    expect(totalLiabilitiesCents(ctx)).toBe(30_000_000); // $300k loan
    expect(netWorthCents(ctx)).toBe(30_000_000);
  });

  it("computes monthly income, expenses, and savings rate", () => {
    expect(monthlyActiveIncomeCents(ctx)).toBe(Math.round(20_000_000 / 12));
    expect(monthlyExpensesCents(ctx)).toBe(500_000);
    const rate = savingsRate(ctx);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });
});

describe("projectNetWorth", () => {
  const ctx = buildContext();

  it("returns years + 1 rows with year 0 as current", () => {
    const rows = projectNetWorth(ctx, {
      years: 10,
      investmentReturnBps: 700,
      incomeGrowthBps: 300,
      expenseInflationBps: 300,
      propertyAppreciationBps: 300,
    });
    expect(rows.length).toBe(11);
    expect(rows[0].year).toBe(0);
    expect(rows[0].netWorthCents).toBe(netWorthCents(ctx));
  });

  it("grows net worth over time (assets up, debt down)", () => {
    const rows = projectNetWorth(ctx, {
      years: 10,
      investmentReturnBps: 700,
      incomeGrowthBps: 300,
      expenseInflationBps: 300,
      propertyAppreciationBps: 300,
    });
    const first = rows[0];
    const last = rows[rows.length - 1];
    expect(last.netWorthCents).toBeGreaterThan(first.netWorthCents);
    expect(last.totalLiabilitiesCents).toBeLessThan(first.totalLiabilitiesCents);
    expect(last.totalAssetsCents).toBeGreaterThan(first.totalAssetsCents);
    expect(last.estimatedTaxCents).toBeGreaterThan(0);
  });

  it("returns a single row when years is 0", () => {
    const rows = projectNetWorth(ctx, {
      years: 0,
      investmentReturnBps: 700,
      incomeGrowthBps: 300,
      expenseInflationBps: 300,
      propertyAppreciationBps: 300,
    });
    expect(rows.length).toBe(1);
  });
});

describe("net worth with portfolio holdings", () => {
  it("is unchanged when no holdings exist", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ currentBalanceCents: 1_000_000 })],
    });
    expect(totalAssetsCents(ctx)).toBe(1_000_000);
    expect(totalAssetsCents(ctx, { VOO: 60_000 })).toBe(1_000_000);
  });

  it("values an account from its positions once it has holdings", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", currentBalanceCents: 1 })],
      holdings: [makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    // 10 shares x $600 = $6,000, replacing the $0.01 typed balance.
    expect(totalAssetsCents(ctx, { VOO: 60_000 })).toBe(600_000);
  });

  it("falls back to cost basis when the price is missing", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", currentBalanceCents: 1 })],
      holdings: [makeHolding({ id: "h-voo", accountId: "acct-1", ticker: "VOO" })],
      lots: [makeLot({ holdingId: "h-voo", sharesMicro: 10_000_000, costTotalCents: 500_000, feesCents: 0 })],
    });
    expect(totalAssetsCents(ctx)).toBe(500_000);
  });
});
