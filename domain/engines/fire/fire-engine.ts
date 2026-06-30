/**
 * FIRE (Financial Independence / Retire Early) math.
 *
 * Pure functions. Money is integer US cents.
 */

import { bpsToRate, type BasisPoints } from "@/domain/value-objects/basis-points";
import type { FinancialContext } from "@/domain/context";
import type { MoneyCents } from "@/infrastructure/money/money";
import {
  monthlyExpensesCents,
  type ProjectionAssumptions,
} from "@/domain/engines/net-worth/net-worth-engine";

/** Default safe withdrawal rate: 400 bps = 4% (the "multiply by 25" rule). */
const DEFAULT_SWR_BPS = 400;

interface FireOpts {
  safeWithdrawalRateBps?: BasisPoints;
}

/** Annual expenses, in cents. */
export function annualExpensesCents(context: FinancialContext): MoneyCents {
  return monthlyExpensesCents(context) * 12;
}

/** FIRE number = annual expenses / safe withdrawal rate, in cents. */
export function fireNumberCents(
  context: FinancialContext,
  opts: FireOpts = {},
): MoneyCents {
  const swr = bpsToRate(opts.safeWithdrawalRateBps ?? DEFAULT_SWR_BPS);
  if (swr <= 0) return 0;
  return Math.round(annualExpensesCents(context) / swr);
}

/**
 * Liquid net worth: investment-account balances only (excludes the primary
 * residence and other property equity), in cents.
 */
export function liquidNetWorthCents(context: FinancialContext): MoneyCents {
  return context.investmentAccounts
    .filter((a) => !a.deletedAt)
    .reduce((sum, a) => sum + a.currentBalanceCents, 0);
}

/** Progress to FIRE = liquid net worth / FIRE number (decimal, 0..1+). */
export function progressToFire(
  context: FinancialContext,
  opts: FireOpts = {},
): number {
  const target = fireNumberCents(context, opts);
  if (target <= 0) return 0;
  return liquidNetWorthCents(context) / target;
}

/**
 * Years until liquid net worth reaches the FIRE number.
 * Simulates yearly growth (return + contributions). Capped at 100.
 * Returns Infinity if it never reaches the target without growth.
 */
export function yearsToFire(
  context: FinancialContext,
  assumptions: ProjectionAssumptions,
  opts: FireOpts = {},
): number {
  const target = fireNumberCents(context, opts);
  if (target <= 0) return 0;

  let liquid = liquidNetWorthCents(context);
  if (liquid >= target) return 0;

  const returnRate = bpsToRate(assumptions.investmentReturnBps);
  const annualContribution = context.investmentAccounts
    .filter((a) => !a.deletedAt)
    .reduce((sum, a) => sum + a.contributionMonthlyCents * 12, 0);

  if (returnRate <= 0 && annualContribution <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const cap = 100;
  for (let year = 1; year <= cap; year++) {
    liquid = Math.round(liquid * (1 + returnRate)) + annualContribution;
    if (liquid >= target) return year;
  }
  return Number.POSITIVE_INFINITY;
}
