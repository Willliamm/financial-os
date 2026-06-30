/**
 * Rule-based financial insight provider.
 *
 * Combines real-estate alerts, data-quality issues, savings-rate observations,
 * FIRE progress, and tax-savings opportunities into a single insight list.
 * Deterministic and offline (no network).
 */

import { formatCents } from "@/infrastructure/money/money";
import type { FinancialContext } from "@/domain/context";
import { loanForProperty } from "@/domain/context";
import {
  realEstateAlerts,
  type Alert,
} from "@/domain/engines/analysis/real-estate-analyzer";
import {
  dataQualityChecks,
  type DataQualityIssue,
} from "@/domain/engines/analysis/data-quality-checker";
import { savingsRate } from "@/domain/engines/net-worth/net-worth-engine";
import { progressToFire } from "@/domain/engines/fire/fire-engine";
import { totalEstimatedTaxSavingsCents } from "@/domain/engines/tax/tax-engine";

export interface FinancialInsightInput {
  context: FinancialContext;
}

export type InsightSeverity = "info" | "success" | "warning" | "critical";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  category: string;
  title: string;
  message: string;
}

export interface InsightProvider {
  generateInsights(input: FinancialInsightInput): Promise<Insight[]>;
}

function alertSeverityToInsight(severity: Alert["severity"]): InsightSeverity {
  return severity; // "info" | "warning" | "critical" are all valid insight severities
}

function issueSeverityToInsight(
  severity: DataQualityIssue["severity"],
): InsightSeverity {
  return severity; // "info" | "warning"
}

/** A deterministic, offline insight provider built from the engine rules. */
export class RuleBasedInsightProvider implements InsightProvider {
  async generateInsights(input: FinancialInsightInput): Promise<Insight[]> {
    const { context } = input;
    const insights: Insight[] = [];

    // Real-estate alerts across all properties.
    for (const property of context.properties.filter((p) => !p.deletedAt)) {
      const loan = loanForProperty(context, property.id);
      for (const alert of realEstateAlerts(property, loan)) {
        insights.push({
          id: `insight-${alert.id}`,
          severity: alertSeverityToInsight(alert.severity),
          category: "real_estate",
          title: alert.title,
          message: alert.message,
        });
      }
    }

    // Data-quality issues.
    for (const issue of dataQualityChecks(context)) {
      insights.push({
        id: `insight-${issue.id}`,
        severity: issueSeverityToInsight(issue.severity),
        category: "data_quality",
        title: "Data needs attention",
        message: issue.message,
      });
    }

    // Savings rate observation.
    const rate = savingsRate(context);
    if (rate < 0) {
      insights.push({
        id: "insight-savings-negative",
        severity: "warning",
        category: "cash_flow",
        title: "Spending more than you earn",
        message: "Your expenses are higher than your income. Look for ways to cut costs or raise income.",
      });
    } else if (rate >= 0.2) {
      insights.push({
        id: "insight-savings-strong",
        severity: "success",
        category: "cash_flow",
        title: "Strong savings rate",
        message: `You save about ${Math.round(rate * 100)}% of your income. Keep it up.`,
      });
    } else {
      insights.push({
        id: "insight-savings-ok",
        severity: "info",
        category: "cash_flow",
        title: "Room to save more",
        message: `You save about ${Math.round(rate * 100)}% of your income. Aim for 20% or more.`,
      });
    }

    // FIRE progress.
    const fireProgress = progressToFire(context);
    if (fireProgress >= 1) {
      insights.push({
        id: "insight-fire-reached",
        severity: "success",
        category: "fire",
        title: "You have reached financial independence",
        message: "Your liquid investments cover your FIRE number. Work is now optional.",
      });
    } else if (fireProgress > 0) {
      insights.push({
        id: "insight-fire-progress",
        severity: "info",
        category: "fire",
        title: "Progress to financial independence",
        message: `You are about ${Math.round(fireProgress * 100)}% of the way to your FIRE number.`,
      });
    }

    // Tax-savings opportunities.
    const taxSavings = totalEstimatedTaxSavingsCents(context);
    if (taxSavings > 0) {
      insights.push({
        id: "insight-tax-savings",
        severity: "info",
        category: "tax",
        title: "Potential tax savings",
        message: `Your tax strategies could save about ${formatCents(taxSavings)} per year.`,
      });
    }

    return insights;
  }
}
