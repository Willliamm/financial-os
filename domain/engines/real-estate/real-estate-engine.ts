/**
 * Real-estate investment math for a single property (plus its loan, if any).
 *
 * Pure functions. Money is integer US cents. Rates returned as decimals.
 */

import { bpsToRate } from "@/domain/value-objects/basis-points";
import type { Loan, Property } from "@/domain/entities";
import type { MoneyCents } from "@/infrastructure/money/money";

/** Gross potential rent for a full year, in cents. */
export function grossAnnualRentCents(property: Property): MoneyCents {
  return Math.round(property.rentMonthlyCents * 12);
}

/** Effective gross income: gross rent minus vacancy loss, in cents. */
export function effectiveGrossIncomeCents(property: Property): MoneyCents {
  const gross = grossAnnualRentCents(property);
  const vacancy = bpsToRate(property.vacancyRateBps);
  return Math.round(gross * (1 - vacancy));
}

/**
 * Annual operating expenses: HOA*12 + CDD + property tax + insurance +
 * maintenance + management fee (a percentage of effective gross income).
 */
export function operatingExpensesAnnualCents(property: Property): MoneyCents {
  const egi = effectiveGrossIncomeCents(property);
  const managementFee = Math.round(egi * bpsToRate(property.managementFeeBps));
  return (
    property.hoaMonthlyCents * 12 +
    property.cddAnnualCents +
    property.propertyTaxAnnualCents +
    property.insuranceAnnualCents +
    property.maintenanceAnnualCents +
    managementFee
  );
}

/** Net operating income (EGI minus operating expenses), in cents. */
export function noiAnnualCents(property: Property): MoneyCents {
  return effectiveGrossIncomeCents(property) - operatingExpensesAnnualCents(property);
}

/** Gross yield = gross annual rent / current value (decimal). 0 if no value. */
export function grossYield(property: Property): number {
  if (property.currentValueCents <= 0) return 0;
  return grossAnnualRentCents(property) / property.currentValueCents;
}

/** Cap rate = NOI / current value (decimal). 0 if no value. */
export function capRate(property: Property): number {
  if (property.currentValueCents <= 0) return 0;
  return noiAnnualCents(property) / property.currentValueCents;
}

/** Annual debt service (P&I) for the loan, in cents. 0 if no loan. */
export function annualDebtServiceCents(loan?: Loan | null): MoneyCents {
  if (!loan) return 0;
  return loan.monthlyPaymentCents * 12;
}

/** Monthly cash flow: NOI/12 minus loan P&I and escrow, in cents. */
export function monthlyCashFlowCents(
  property: Property,
  loan?: Loan | null,
): MoneyCents {
  const monthlyNoi = Math.round(noiAnnualCents(property) / 12);
  const debt = loan ? loan.monthlyPaymentCents + loan.escrowMonthlyCents : 0;
  return monthlyNoi - debt;
}

/** Annual cash flow, in cents. */
export function annualCashFlowCents(
  property: Property,
  loan?: Loan | null,
): MoneyCents {
  return monthlyCashFlowCents(property, loan) * 12;
}

/** Total cash invested: down payment + closing costs, in cents. */
export function totalCashInvestedCents(property: Property): MoneyCents {
  return property.downPaymentCents + property.closingCostsCents;
}

/** Cash-on-cash return = annual cash flow / total cash invested (decimal). */
export function cashOnCash(property: Property, loan?: Loan | null): number {
  const invested = totalCashInvestedCents(property);
  if (invested <= 0) return 0;
  return annualCashFlowCents(property, loan) / invested;
}

/**
 * Debt-service coverage ratio = NOI / annual debt service.
 * Returns 0 when there is no debt (no meaningful ratio).
 */
export function dscr(property: Property, loan?: Loan | null): number {
  const debt = annualDebtServiceCents(loan);
  if (debt <= 0) return 0;
  return noiAnnualCents(property) / debt;
}

/** Equity = current value minus loan balance, in cents. */
export function equityCents(property: Property, loan?: Loan | null): MoneyCents {
  const balance = loan ? loan.currentBalanceCents : 0;
  return property.currentValueCents - balance;
}

/**
 * Monthly rent required for zero cash flow, in cents.
 * Solves the NOI/cash-flow equations backwards for rent.
 */
export function breakEvenRentCents(
  property: Property,
  loan?: Loan | null,
): MoneyCents {
  const vacancy = bpsToRate(property.vacancyRateBps);
  const mgmt = bpsToRate(property.managementFeeBps);
  if (1 - vacancy <= 0 || 1 - mgmt <= 0) return 0;

  const fixedOpex =
    property.hoaMonthlyCents * 12 +
    property.cddAnnualCents +
    property.propertyTaxAnnualCents +
    property.insuranceAnnualCents +
    property.maintenanceAnnualCents;

  const monthlyDebt = loan
    ? loan.monthlyPaymentCents + loan.escrowMonthlyCents
    : 0;

  // Zero cash flow: NOI = 12 * monthlyDebt.
  // NOI = EGI*(1 - mgmt) - fixedOpex; EGI = 12 * rent * (1 - vacancy).
  const requiredNoi = 12 * monthlyDebt;
  const requiredEgi = (requiredNoi + fixedOpex) / (1 - mgmt);
  const rent = requiredEgi / (12 * (1 - vacancy));
  return Math.round(rent);
}
