/**
 * Data-quality checks across the whole financial context.
 *
 * Pure functions. Deterministic ids (no randomness).
 */

import type { FinancialContext } from "@/domain/context";

export interface DataQualityIssue {
  id: string;
  entityType: string;
  entityId: string;
  severity: "info" | "warning";
  message: string;
}

/** HOA at or above this monthly amount (cents) is flagged as very high. */
const HIGH_HOA_MONTHLY_CENTS = 50_000; // $500/mo

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

/** Run all data-quality checks and return the list of issues found. */
export function dataQualityChecks(
  context: FinancialContext,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  // Missing household.
  if (!context.household) {
    issues.push({
      id: "dq-household-missing",
      entityType: "household",
      entityId: "",
      severity: "warning",
      message: "No household is set up. Add household details to enable tax and projection math.",
    });
  }

  for (const p of context.properties.filter(notDeleted)) {
    // Property without insurance.
    if (p.insuranceAnnualCents === 0) {
      issues.push({
        id: `dq-property-insurance-${p.id}`,
        entityType: "property",
        entityId: p.id,
        severity: "warning",
        message: `Property "${p.name}" has no insurance cost. Add insurance to get accurate expenses.`,
      });
    }
    // Owned property with no rent.
    if (p.rentMonthlyCents === 0 && p.status === "owned") {
      issues.push({
        id: `dq-property-norent-${p.id}`,
        entityType: "property",
        entityId: p.id,
        severity: "info",
        message: `Owned property "${p.name}" has no rent set. Add rent if it is a rental.`,
      });
    }
    // Very high HOA.
    if (p.hoaMonthlyCents >= HIGH_HOA_MONTHLY_CENTS) {
      issues.push({
        id: `dq-property-hoa-${p.id}`,
        entityType: "property",
        entityId: p.id,
        severity: "warning",
        message: `Property "${p.name}" has a very high HOA fee. Double-check the amount.`,
      });
    }
  }

  // Loans without an interest rate.
  for (const l of context.loans.filter(notDeleted)) {
    if (l.interestRateBps === 0) {
      issues.push({
        id: `dq-loan-rate-${l.id}`,
        entityType: "loan",
        entityId: l.id,
        severity: "warning",
        message: `Loan from "${l.lender}" has no interest rate. Add a rate for correct payoff math.`,
      });
    }
  }

  // Income without a growth rate.
  for (const s of context.incomeSources.filter(notDeleted)) {
    if (s.growthRateBps === 0) {
      issues.push({
        id: `dq-income-growth-${s.id}`,
        entityType: "income_source",
        entityId: s.id,
        severity: "info",
        message: `Income "${s.name}" has no growth rate. Projections assume it stays flat.`,
      });
    }
  }

  // Expenses with the catch-all "other" category.
  for (const e of context.expenses.filter(notDeleted)) {
    if (e.category === "other") {
      issues.push({
        id: `dq-expense-category-${e.id}`,
        entityType: "expense",
        entityId: e.id,
        severity: "info",
        message: `Expense "${e.name}" is uncategorized ("other"). Pick a category for better reports.`,
      });
    }
  }

  return issues;
}
