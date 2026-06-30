import { describe, it, expect } from "vitest";
import {
  annualExpensesCents,
  fireNumberCents,
  liquidNetWorthCents,
  progressToFire,
  yearsToFire,
} from "@/domain/engines/fire/fire-engine";
import { makeContext, makeExpense, makeInvestment } from "./fixtures";

describe("fire-engine", () => {
  const ctx = makeContext({
    expenses: [makeExpense({ monthlyAmountCents: 800_000 })], // $8k/mo
    investmentAccounts: [
      makeInvestment({ currentBalanceCents: 50_000_000, contributionMonthlyCents: 300_000 }),
    ],
  });

  it("computes annual expenses and the 25x FIRE number at 4%", () => {
    expect(annualExpensesCents(ctx)).toBe(800_000 * 12); // $96k
    // Default SWR 4% => annual expenses * 25
    expect(fireNumberCents(ctx)).toBe(annualExpensesCents(ctx) * 25);
  });

  it("honors a custom safe withdrawal rate", () => {
    // 5% SWR => annual expenses * 20
    expect(fireNumberCents(ctx, { safeWithdrawalRateBps: 500 })).toBe(
      annualExpensesCents(ctx) * 20,
    );
  });

  it("computes liquid net worth and progress", () => {
    expect(liquidNetWorthCents(ctx)).toBe(50_000_000);
    const progress = progressToFire(ctx);
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });

  it("estimates a finite number of years to FIRE with growth", () => {
    const years = yearsToFire(ctx, {
      years: 50,
      investmentReturnBps: 700,
      incomeGrowthBps: 300,
      expenseInflationBps: 300,
      propertyAppreciationBps: 300,
    });
    expect(years).toBeGreaterThan(0);
    expect(years).toBeLessThanOrEqual(100);
    expect(Number.isFinite(years)).toBe(true);
  });

  it("returns 0 years when already at FIRE", () => {
    const richCtx = makeContext({
      expenses: [makeExpense({ monthlyAmountCents: 100_000 })],
      investmentAccounts: [makeInvestment({ currentBalanceCents: 500_000_000 })],
    });
    expect(yearsToFire(richCtx, {
      years: 50,
      investmentReturnBps: 700,
      incomeGrowthBps: 300,
      expenseInflationBps: 300,
      propertyAppreciationBps: 300,
    })).toBe(0);
  });
});
