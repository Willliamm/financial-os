import { describe, it, expect } from "vitest";
import {
  grossAnnualRentCents,
  effectiveGrossIncomeCents,
  operatingExpensesAnnualCents,
  noiAnnualCents,
  grossYield,
  capRate,
  annualDebtServiceCents,
  monthlyCashFlowCents,
  annualCashFlowCents,
  totalCashInvestedCents,
  cashOnCash,
  dscr,
  equityCents,
  breakEvenRentCents,
} from "@/domain/engines/real-estate/real-estate-engine";
import { makeProperty, makeLoan } from "./fixtures";

describe("real-estate-engine", () => {
  const property = makeProperty();
  const loan = makeLoan();

  it("computes gross rent, EGI, and operating expenses", () => {
    expect(grossAnnualRentCents(property)).toBe(4_200_000);
    // 5% vacancy on $42k gross
    expect(effectiveGrossIncomeCents(property)).toBe(3_990_000);
    // tax 6k + ins 2k + maint 3k + 8% mgmt of EGI
    expect(operatingExpensesAnnualCents(property)).toBe(1_419_200);
  });

  it("computes NOI exactly", () => {
    expect(noiAnnualCents(property)).toBe(2_570_800);
  });

  it("computes gross yield and cap rate as decimals", () => {
    expect(grossYield(property)).toBeCloseTo(0.084, 4);
    expect(capRate(property)).toBeCloseTo(0.05142, 4);
  });

  it("computes debt service and cash flow with a loan", () => {
    expect(annualDebtServiceCents(loan)).toBe(179_865 * 12);
    expect(annualDebtServiceCents(null)).toBe(0);
    const monthly = monthlyCashFlowCents(property, loan);
    expect(monthly).toBeGreaterThan(0);
    expect(annualCashFlowCents(property, loan)).toBe(monthly * 12);
  });

  it("computes cash-on-cash and DSCR", () => {
    expect(totalCashInvestedCents(property)).toBe(10_000_000);
    expect(cashOnCash(property, loan)).toBeGreaterThan(0);
    expect(cashOnCash(property, null)).toBeGreaterThan(cashOnCash(property, loan));
    // NOI comfortably exceeds debt service.
    expect(dscr(property, loan)).toBeGreaterThan(1);
    // No debt -> documented 0.
    expect(dscr(property, null)).toBe(0);
  });

  it("computes equity and break-even rent", () => {
    expect(equityCents(property, loan)).toBe(20_000_000);
    expect(equityCents(property, null)).toBe(50_000_000);
    const be = breakEvenRentCents(property, loan);
    expect(be).toBeGreaterThan(0);
    // Property has positive cash flow, so break-even rent is below current rent.
    expect(be).toBeLessThan(property.rentMonthlyCents);
  });

  it("guards divide-by-zero on cash-on-cash", () => {
    const noInvest = makeProperty({ downPaymentCents: 0, closingCostsCents: 0 });
    expect(cashOnCash(noInvest, loan)).toBe(0);
  });
});
