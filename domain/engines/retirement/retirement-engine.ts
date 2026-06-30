/**
 * Retirement-account projection math.
 *
 * Pure functions. Money is integer US cents. Rates are basis points.
 */

import { bpsToRate, type BasisPoints } from "@/domain/value-objects/basis-points";
import type { MoneyCents } from "@/infrastructure/money/money";

export interface RetirementProjectionRow {
  year: number;
  age: number;
  balanceCents: MoneyCents;
  contributionCents: MoneyCents;
}

interface RetirementInput {
  currentBalanceCents: MoneyCents;
  monthlyContributionCents: MoneyCents;
  expectedReturnBps: BasisPoints;
  currentAge: number;
  retirementAge: number;
}

/**
 * Year-by-year retirement projection from the current age to retirement age.
 * Row 0 is the current balance (no contribution yet). Each later year applies
 * the expected return to the balance, then adds a year of contributions.
 */
export function projectRetirement(
  input: RetirementInput,
): RetirementProjectionRow[] {
  const rows: RetirementProjectionRow[] = [];
  const totalYears = Math.max(
    0,
    Math.floor(input.retirementAge - input.currentAge),
  );
  const returnRate = bpsToRate(input.expectedReturnBps);
  const annualContribution = input.monthlyContributionCents * 12;

  let balance = input.currentBalanceCents;
  for (let year = 0; year <= totalYears; year++) {
    let contribution = 0;
    if (year > 0) {
      balance = Math.round(balance * (1 + returnRate)) + annualContribution;
      contribution = annualContribution;
    }
    rows.push({
      year,
      age: input.currentAge + year,
      balanceCents: balance,
      contributionCents: contribution,
    });
  }
  return rows;
}

/** Projected balance at the retirement age, in cents. */
export function projectedRetirementBalanceCents(
  input: RetirementInput,
): MoneyCents {
  const rows = projectRetirement(input);
  return rows.length > 0 ? rows[rows.length - 1].balanceCents : input.currentBalanceCents;
}
