import type { Loan, Property } from "@/domain/entities";
import type { FinancialContext } from "@/domain/context";
import { loanForProperty } from "@/domain/context";
import {
  annualCashFlowCents,
  capRate,
  cashOnCash,
  dscr,
  equityCents,
  grossYield,
  monthlyCashFlowCents,
  noiAnnualCents,
  breakEvenRentCents,
  realEstateAlerts,
  totalCashInvestedCents,
  type Alert,
} from "@/domain/engines";

export interface PropertyAnalysis {
  loan: Loan | null;
  noiAnnualCents: number;
  capRate: number;
  grossYield: number;
  cashOnCash: number;
  monthlyCashFlowCents: number;
  annualCashFlowCents: number;
  equityCents: number;
  cashInvestedCents: number;
  dscr: number;
  breakEvenRentCents: number;
  alerts: Alert[];
}

export function analyzeProperty(
  property: Property,
  loan: Loan | null,
): PropertyAnalysis {
  return {
    loan,
    noiAnnualCents: noiAnnualCents(property),
    capRate: capRate(property),
    grossYield: grossYield(property),
    cashOnCash: cashOnCash(property, loan),
    monthlyCashFlowCents: monthlyCashFlowCents(property, loan),
    annualCashFlowCents: annualCashFlowCents(property, loan),
    equityCents: equityCents(property, loan),
    cashInvestedCents: totalCashInvestedCents(property),
    dscr: dscr(property, loan),
    breakEvenRentCents: breakEvenRentCents(property, loan),
    alerts: realEstateAlerts(property, loan),
  };
}

export function analyzePropertyInContext(
  property: Property,
  context: FinancialContext,
): PropertyAnalysis {
  return analyzeProperty(property, loanForProperty(context, property.id));
}
