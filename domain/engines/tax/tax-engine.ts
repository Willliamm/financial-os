/**
 * Tax estimation math (effective-rate based, self-contained).
 *
 * Pure functions. Money is integer US cents. Rates are basis points.
 */

import { rateToBps, type BasisPoints } from "@/domain/value-objects/basis-points";
import type { FinancialContext } from "@/domain/context";
import type { TaxAssumption, TaxStrategy } from "@/domain/entities";
import type { MoneyCents } from "@/infrastructure/money/money";

/** Default standard deduction (~$29,200 MFJ), in cents. */
const DEFAULT_STANDARD_DEDUCTION_CENTS = 2_920_000;
/** Default federal effective rate when no assumption (2400 bps = 24%). */
const DEFAULT_FEDERAL_BPS = 2400;
/** Default state effective rate when no assumption (500 bps = 5%). */
const DEFAULT_STATE_BPS = 500;
/** Default marginal rate used to derive strategy savings (3200 bps = 32%). */
const DEFAULT_MARGINAL_BPS = 3200;

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

/** Gross income across all active income sources, in cents. */
function grossIncomeCents(context: FinancialContext): MoneyCents {
  return context.incomeSources
    .filter((s) => notDeleted(s) && s.active)
    .reduce((sum, s) => sum + s.annualAmountCents, 0);
}

/** Find the tax assumption that best matches the requested year. */
function findAssumption(
  context: FinancialContext,
  year?: number,
): TaxAssumption | null {
  const assumptions = context.taxAssumptions.filter(notDeleted);
  if (assumptions.length === 0) return null;
  if (year !== undefined) {
    const exact = assumptions.find((a) => a.year === year);
    if (exact) return exact;
  }
  return [...assumptions].sort((a, b) => b.year - a.year)[0];
}

/**
 * Taxable income: gross income minus the larger of the standard or itemized
 * deduction from the matching assumption (or a sane default), in cents.
 */
export function estimateTaxableIncomeCents(
  context: FinancialContext,
  year?: number,
): MoneyCents {
  const gross = grossIncomeCents(context);
  const assumption = findAssumption(context, year);
  const deduction = assumption
    ? Math.max(
        assumption.standardDeductionCents,
        assumption.itemizedDeductionCents,
      )
    : DEFAULT_STANDARD_DEDUCTION_CENTS;
  return Math.max(0, gross - deduction);
}

/**
 * Estimated annual tax, in cents.
 * Federal + state effective rates apply to taxable income; FICA + SE rates
 * apply to gross income. Falls back to ~24% federal + 5% state if no assumption.
 */
export function estimateAnnualTaxCents(
  context: FinancialContext,
  year?: number,
): MoneyCents {
  const gross = grossIncomeCents(context);
  const taxable = estimateTaxableIncomeCents(context, year);
  const assumption = findAssumption(context, year);

  if (!assumption) {
    const rate = (DEFAULT_FEDERAL_BPS + DEFAULT_STATE_BPS) / 10000;
    return Math.round(taxable * rate);
  }

  const incomeRate =
    (assumption.federalEffectiveRateBps + assumption.stateEffectiveRateBps) /
    10000;
  const payrollRate =
    (assumption.ficaRateBps + assumption.selfEmploymentTaxRateBps) / 10000;
  return Math.round(taxable * incomeRate + gross * payrollRate);
}

/** Effective tax rate = tax / gross income, returned as basis points. */
export function estimateEffectiveTaxRateBps(
  context: FinancialContext,
  year?: number,
): BasisPoints {
  const gross = grossIncomeCents(context);
  if (gross <= 0) return 0;
  return rateToBps(estimateAnnualTaxCents(context, year) / gross);
}

/**
 * Estimated tax savings for a strategy, in cents.
 * Uses the stored savings, or derives it from deduction * marginal rate.
 */
export function estimateTaxSavingsCents(strategy: TaxStrategy): MoneyCents {
  if (strategy.estimatedTaxSavingsCents > 0) {
    return strategy.estimatedTaxSavingsCents;
  }
  const marginal = DEFAULT_MARGINAL_BPS / 10000;
  return Math.round(strategy.estimatedDeductionCents * marginal);
}

/** Total estimated tax savings across all strategies (optionally for a year). */
export function totalEstimatedTaxSavingsCents(
  context: FinancialContext,
  year?: number,
): MoneyCents {
  return context.taxStrategies
    .filter((s) => notDeleted(s) && (year === undefined || s.year === year))
    .reduce((sum, s) => sum + estimateTaxSavingsCents(s), 0);
}
