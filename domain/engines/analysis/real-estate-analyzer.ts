/**
 * Rule-based alerts for a single real-estate property.
 *
 * Pure functions. Deterministic ids (no randomness).
 */

import { formatCents } from "@/infrastructure/money/money";
import { bpsToPercent } from "@/domain/value-objects/basis-points";
import type { Loan, Property } from "@/domain/entities";
import {
  capRate,
  grossAnnualRentCents,
  monthlyCashFlowCents,
} from "@/domain/engines/real-estate/real-estate-engine";

export type AlertSeverity = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
}

/** HOA fees above this share of gross rent trigger a warning. */
const HOA_RENT_THRESHOLD = 0.12;
/** Cap rate below this (decimal) flags appreciation reliance. */
const LOW_CAP_RATE = 0.04;
/** Vacancy rate (bps) considered unusually high. */
const HIGH_VACANCY_BPS = 1000; // 10%
/** Management fee (bps) considered unusually high. */
const HIGH_MANAGEMENT_BPS = 1200; // 12%

/** Generate alerts for a property and its loan. */
export function realEstateAlerts(
  property: Property,
  loan?: Loan | null,
): Alert[] {
  const alerts: Alert[] = [];
  const grossRent = grossAnnualRentCents(property);
  const hoaAnnual = property.hoaMonthlyCents * 12;

  // HOA above 12% of gross rent.
  if (grossRent > 0 && hoaAnnual > HOA_RENT_THRESHOLD * grossRent) {
    alerts.push({
      id: `re-hoa-${property.id}`,
      severity: "warning",
      title: "High HOA fees",
      message: `HOA fees of ${formatCents(hoaAnnual)} per year are more than 12% of the gross rent (${formatCents(grossRent)}). This eats into your returns.`,
    });
  }

  // Negative cash flow.
  const monthlyCashFlow = monthlyCashFlowCents(property, loan);
  if (monthlyCashFlow < 0) {
    alerts.push({
      id: `re-cashflow-${property.id}`,
      severity: "warning",
      title: "Negative cash flow",
      message: `This property loses ${formatCents(Math.abs(monthlyCashFlow))} per month. It may still make sense if you expect strong appreciation.`,
    });
  }

  // Heavy reliance on appreciation.
  if (capRate(property) < LOW_CAP_RATE && property.appreciationRateBps > 0) {
    alerts.push({
      id: `re-appreciation-${property.id}`,
      severity: "info",
      title: "Relies on appreciation",
      message: `The cap rate is below 4%, so most of the expected return comes from price growth, not rent. Appreciation is not guaranteed.`,
    });
  }

  // Rent is zero on an owned or prospect rental.
  if (
    property.rentMonthlyCents === 0 &&
    (property.status === "owned" || property.status === "prospect")
  ) {
    alerts.push({
      id: `re-norent-${property.id}`,
      severity: "info",
      title: "No rent set",
      message: `This property has no monthly rent set. Add a rent figure to see cash flow and yield.`,
    });
  }

  // Vacancy or management fee unusually high.
  if (property.vacancyRateBps > HIGH_VACANCY_BPS) {
    alerts.push({
      id: `re-vacancy-${property.id}`,
      severity: "info",
      title: "High vacancy assumption",
      message: `A vacancy rate of ${bpsToPercent(property.vacancyRateBps).toFixed(1)}% is high. Check whether this matches your market.`,
    });
  }
  if (property.managementFeeBps > HIGH_MANAGEMENT_BPS) {
    alerts.push({
      id: `re-management-${property.id}`,
      severity: "info",
      title: "High management fee",
      message: `A management fee of ${bpsToPercent(property.managementFeeBps).toFixed(1)}% is high and reduces your net income.`,
    });
  }

  return alerts;
}
