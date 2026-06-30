/**
 * Net-worth, cash-flow, and multi-year projection math.
 *
 * Pure functions. Money is integer US cents. Rates are basis points.
 */

import { bpsToRate, type BasisPoints } from "@/domain/value-objects/basis-points";
import type { FinancialContext } from "@/domain/context";
import { loanForProperty } from "@/domain/context";
import type { IncomeSource } from "@/domain/entities";
import type { MoneyCents } from "@/infrastructure/money/money";
import { monthlyCashFlowCents } from "@/domain/engines/real-estate/real-estate-engine";

/** Default effective tax rate (bps) when no tax assumption is available. */
const DEFAULT_EFFECTIVE_TAX_BPS = 2200; // 22%

const ACTIVE_INCOME_TYPES = new Set(["w2", "llc", "bonus"]);
const PASSIVE_INCOME_TYPES = new Set(["rental", "dividend", "interest"]);

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

/** Total assets: property values plus investment-account balances, in cents. */
export function totalAssetsCents(context: FinancialContext): MoneyCents {
  const properties = context.properties
    .filter(notDeleted)
    .reduce((sum, p) => sum + p.currentValueCents, 0);
  const investments = context.investmentAccounts
    .filter(notDeleted)
    .reduce((sum, a) => sum + a.currentBalanceCents, 0);
  return properties + investments;
}

/** Total liabilities: sum of loan balances, in cents. */
export function totalLiabilitiesCents(context: FinancialContext): MoneyCents {
  return context.loans
    .filter(notDeleted)
    .reduce((sum, l) => sum + l.currentBalanceCents, 0);
}

/** Net worth = assets - liabilities, in cents. */
export function netWorthCents(context: FinancialContext): MoneyCents {
  return totalAssetsCents(context) - totalLiabilitiesCents(context);
}

function sumActiveIncomeAnnual(
  sources: IncomeSource[],
  types: Set<string>,
): MoneyCents {
  return sources
    .filter((s) => notDeleted(s) && s.active && types.has(s.type))
    .reduce((sum, s) => sum + s.annualAmountCents, 0);
}

/** Monthly active income (W-2 / LLC / bonus), in cents. */
export function monthlyActiveIncomeCents(context: FinancialContext): MoneyCents {
  const annual = sumActiveIncomeAnnual(context.incomeSources, ACTIVE_INCOME_TYPES);
  return Math.round(annual / 12);
}

/**
 * Monthly passive income (rental / dividend / interest income sources) plus
 * net cash flow from properties, in cents.
 */
export function monthlyPassiveIncomeCents(context: FinancialContext): MoneyCents {
  const annual = sumActiveIncomeAnnual(
    context.incomeSources,
    PASSIVE_INCOME_TYPES,
  );
  const fromIncome = Math.round(annual / 12);
  const fromProperties = context.properties
    .filter(notDeleted)
    .reduce((sum, p) => {
      const loan = loanForProperty(context, p.id);
      return sum + monthlyCashFlowCents(p, loan);
    }, 0);
  return fromIncome + fromProperties;
}

/** Monthly expenses, in cents. */
export function monthlyExpensesCents(context: FinancialContext): MoneyCents {
  return context.expenses
    .filter(notDeleted)
    .reduce((sum, e) => sum + e.monthlyAmountCents, 0);
}

/** Monthly investable cash flow = income - expenses, in cents (may be negative). */
export function monthlyInvestableCashflowCents(
  context: FinancialContext,
): MoneyCents {
  const income =
    monthlyActiveIncomeCents(context) + monthlyPassiveIncomeCents(context);
  return income - monthlyExpensesCents(context);
}

/** Savings rate = investable / income (decimal). 0 if no income; may be negative. */
export function savingsRate(context: FinancialContext): number {
  const income =
    monthlyActiveIncomeCents(context) + monthlyPassiveIncomeCents(context);
  if (income <= 0) return 0;
  return monthlyInvestableCashflowCents(context) / income;
}

/** Combined effective tax rate (bps) from tax assumptions, or a default. */
function effectiveTaxBps(context: FinancialContext): BasisPoints {
  const assumption = context.taxAssumptions
    .filter(notDeleted)
    .sort((a, b) => b.year - a.year)[0];
  if (!assumption) return DEFAULT_EFFECTIVE_TAX_BPS;
  return (
    assumption.federalEffectiveRateBps +
    assumption.stateEffectiveRateBps +
    assumption.ficaRateBps +
    assumption.selfEmploymentTaxRateBps
  );
}

export interface NetWorthProjectionRow {
  year: number;
  netWorthCents: MoneyCents;
  totalAssetsCents: MoneyCents;
  totalLiabilitiesCents: MoneyCents;
  activeIncomeCents: MoneyCents;
  passiveIncomeCents: MoneyCents;
  estimatedTaxCents: MoneyCents;
  investableCashflowCents: MoneyCents;
}

export interface ProjectionAssumptions {
  years: number;
  investmentReturnBps: BasisPoints;
  incomeGrowthBps: BasisPoints;
  expenseInflationBps: BasisPoints;
  propertyAppreciationBps: BasisPoints;
}

interface InvestmentState {
  balance: MoneyCents;
  annualContribution: MoneyCents;
}

interface LoanState {
  balance: MoneyCents;
  monthlyRate: number;
  monthlyPayment: MoneyCents;
  extra: MoneyCents;
}

function advanceLoanOneYear(state: LoanState): void {
  for (let month = 0; month < 12 && state.balance > 0; month++) {
    const interest = Math.round(state.balance * state.monthlyRate);
    let principal = state.monthlyPayment + state.extra - interest;
    if (principal <= 0) return; // payment cannot amortize; balance holds
    if (principal > state.balance) principal = state.balance;
    state.balance -= principal;
  }
}

/**
 * Multi-year net-worth projection. Row 0 is the current snapshot.
 * Returns `assumptions.years + 1` rows.
 *
 * - Investments grow by the investment return plus their annual contributions.
 * - Properties appreciate at the assumption rate.
 * - Loans amortize using their own payment and rate.
 * - Income and expenses grow by their assumption rates.
 * - Tax is a self-contained effective rate applied to gross income.
 */
export function projectNetWorth(
  context: FinancialContext,
  assumptions: ProjectionAssumptions,
): NetWorthProjectionRow[] {
  const years = Math.max(0, Math.floor(assumptions.years));
  const investReturn = bpsToRate(assumptions.investmentReturnBps);
  const incomeGrowth = bpsToRate(assumptions.incomeGrowthBps);
  const expenseInflation = bpsToRate(assumptions.expenseInflationBps);
  const appreciation = bpsToRate(assumptions.propertyAppreciationBps);
  const taxRate = bpsToRate(effectiveTaxBps(context));

  const investments: InvestmentState[] = context.investmentAccounts
    .filter(notDeleted)
    .map((a) => ({
      balance: a.currentBalanceCents,
      annualContribution: a.contributionMonthlyCents * 12,
    }));

  let propertyValue = context.properties
    .filter(notDeleted)
    .reduce((sum, p) => sum + p.currentValueCents, 0);

  const loans: LoanState[] = context.loans.filter(notDeleted).map((l) => ({
    balance: l.currentBalanceCents,
    monthlyRate: bpsToRate(l.interestRateBps) / 12,
    monthlyPayment: l.monthlyPaymentCents,
    extra: Math.max(0, l.extraPaymentMonthlyCents),
  }));

  let activeIncome = monthlyActiveIncomeCents(context) * 12;
  let passiveIncome = monthlyPassiveIncomeCents(context) * 12;
  let annualExpenses = monthlyExpensesCents(context) * 12;

  const rows: NetWorthProjectionRow[] = [];

  for (let year = 0; year <= years; year++) {
    if (year > 0) {
      // Grow investments: return on balance, then add contributions.
      for (const inv of investments) {
        inv.balance = Math.round(inv.balance * (1 + investReturn)) +
          inv.annualContribution;
      }
      // Appreciate properties.
      propertyValue = Math.round(propertyValue * (1 + appreciation));
      // Amortize loans.
      for (const loan of loans) {
        advanceLoanOneYear(loan);
      }
      // Grow income and expenses.
      activeIncome = Math.round(activeIncome * (1 + incomeGrowth));
      passiveIncome = Math.round(passiveIncome * (1 + incomeGrowth));
      annualExpenses = Math.round(annualExpenses * (1 + expenseInflation));
    }

    const investmentTotal = investments.reduce((s, i) => s + i.balance, 0);
    const assets = investmentTotal + propertyValue;
    const liabilities = loans.reduce((s, l) => s + l.balance, 0);
    const grossIncome = activeIncome + passiveIncome;
    const tax = Math.round(grossIncome * taxRate);
    const investable = grossIncome - annualExpenses - tax;

    rows.push({
      year,
      netWorthCents: assets - liabilities,
      totalAssetsCents: assets,
      totalLiabilitiesCents: liabilities,
      activeIncomeCents: activeIncome,
      passiveIncomeCents: passiveIncome,
      estimatedTaxCents: tax,
      investableCashflowCents: investable,
    });
  }

  return rows;
}
