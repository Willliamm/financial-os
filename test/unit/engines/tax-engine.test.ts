import { describe, it, expect } from "vitest";
import {
  estimateTaxableIncomeCents,
  estimateAnnualTaxCents,
  estimateEffectiveTaxRateBps,
  estimateTaxSavingsCents,
  totalEstimatedTaxSavingsCents,
} from "@/domain/engines/tax/tax-engine";
import {
  makeContext,
  makeIncome,
  makeTaxAssumption,
  makeTaxStrategy,
} from "./fixtures";

describe("tax-engine", () => {
  const ctx = makeContext({
    incomeSources: [makeIncome({ annualAmountCents: 20_000_000 })], // $200k
    taxAssumptions: [makeTaxAssumption()],
    taxStrategies: [makeTaxStrategy({ estimatedDeductionCents: 5_000_000 })],
  });

  it("subtracts the standard deduction for taxable income", () => {
    // $200k gross - $29,200 standard deduction
    expect(estimateTaxableIncomeCents(ctx)).toBe(20_000_000 - 2_920_000);
  });

  it("estimates a positive annual tax", () => {
    expect(estimateAnnualTaxCents(ctx)).toBeGreaterThan(0);
  });

  it("produces a sane effective rate (10%-45%)", () => {
    const bps = estimateEffectiveTaxRateBps(ctx);
    expect(bps).toBeGreaterThan(1000);
    expect(bps).toBeLessThan(4500);
  });

  it("falls back to defaults with no assumption", () => {
    const ctxNoAssumption = makeContext({
      incomeSources: [makeIncome({ annualAmountCents: 20_000_000 })],
    });
    expect(estimateAnnualTaxCents(ctxNoAssumption)).toBeGreaterThan(0);
  });

  it("derives strategy savings from deduction when savings is 0", () => {
    const strategy = makeTaxStrategy({
      estimatedTaxSavingsCents: 0,
      estimatedDeductionCents: 5_000_000,
    });
    // 32% marginal default
    expect(estimateTaxSavingsCents(strategy)).toBe(1_600_000);
  });

  it("uses the stored savings when present", () => {
    const strategy = makeTaxStrategy({ estimatedTaxSavingsCents: 999_000 });
    expect(estimateTaxSavingsCents(strategy)).toBe(999_000);
  });

  it("totals savings across strategies", () => {
    expect(totalEstimatedTaxSavingsCents(ctx)).toBeGreaterThan(0);
  });
});
