import { describe, it, expect } from "vitest";
import {
  calculateMonthlyPayment,
  buildAmortizationSchedule,
  remainingBalance,
  payoffMonths,
  calculateRefinanceImpact,
  PAYOFF_NEVER,
} from "@/domain/engines/loans/mortgage-engine";

describe("calculateMonthlyPayment", () => {
  it("matches the known $300k @ 6% / 360mo example (~$1,798.65)", () => {
    const payment = calculateMonthlyPayment({
      principalCents: 30_000_000,
      annualRateBps: 600,
      termMonths: 360,
    });
    expect(payment).toBeGreaterThanOrEqual(179_863);
    expect(payment).toBeLessThanOrEqual(179_867);
  });

  it("handles 0% interest as principal / term", () => {
    const payment = calculateMonthlyPayment({
      principalCents: 1_200_000,
      annualRateBps: 0,
      termMonths: 12,
    });
    expect(payment).toBe(100_000);
  });

  it("returns 0 for non-positive inputs", () => {
    expect(
      calculateMonthlyPayment({ principalCents: 0, annualRateBps: 600, termMonths: 360 }),
    ).toBe(0);
  });
});

describe("buildAmortizationSchedule", () => {
  it("fully amortizes to a zero balance over the term", () => {
    const rows = buildAmortizationSchedule({
      principalCents: 30_000_000,
      annualRateBps: 600,
      termMonths: 360,
    });
    expect(rows.length).toBe(360);
    expect(rows[rows.length - 1].balanceCents).toBe(0);
    // Interest portion shrinks over time.
    expect(rows[0].interestCents).toBeGreaterThan(rows[100].interestCents);
  });

  it("pays off faster with extra monthly payments", () => {
    const rows = buildAmortizationSchedule({
      principalCents: 30_000_000,
      annualRateBps: 600,
      termMonths: 360,
      extraMonthlyCents: 50_000,
    });
    expect(rows.length).toBeLessThan(360);
    expect(rows[rows.length - 1].balanceCents).toBe(0);
  });
});

describe("remainingBalance", () => {
  it("is lower than the principal after some months and 0 at the end", () => {
    const input = {
      principalCents: 30_000_000,
      annualRateBps: 600,
      termMonths: 360,
    };
    const after60 = remainingBalance({ ...input, monthsElapsed: 60 });
    expect(after60).toBeLessThan(30_000_000);
    expect(after60).toBeGreaterThan(0);
    expect(remainingBalance({ ...input, monthsElapsed: 360 })).toBe(0);
  });
});

describe("payoffMonths", () => {
  it("returns about the term for the standard payment", () => {
    const months = payoffMonths({
      principalCents: 30_000_000,
      annualRateBps: 600,
      monthlyPaymentCents: 179_865,
    });
    expect(months).toBeGreaterThanOrEqual(359);
    expect(months).toBeLessThanOrEqual(361);
  });

  it("returns PAYOFF_NEVER when payment cannot cover interest", () => {
    const months = payoffMonths({
      principalCents: 30_000_000,
      annualRateBps: 600,
      monthlyPaymentCents: 1000,
    });
    expect(months).toBe(PAYOFF_NEVER);
  });
});

describe("calculateRefinanceImpact", () => {
  it("lowers the payment and computes a positive break-even", () => {
    const result = calculateRefinanceImpact({
      currentBalanceCents: 30_000_000,
      currentRateBps: 700,
      remainingTermMonths: 360,
      newRateBps: 500,
      newTermMonths: 360,
      closingCostsCents: 600_000,
    });
    expect(result.monthlySavingsCents).toBeGreaterThan(0);
    expect(result.newMonthlyPaymentCents).toBeGreaterThan(0);
    expect(result.totalInterestSavedCents).toBeGreaterThan(0);
    expect(result.breakEvenMonths).toBeGreaterThan(0);
    expect(Number.isFinite(result.breakEvenMonths)).toBe(true);
  });
});
