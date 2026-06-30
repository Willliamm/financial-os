import type { ProjectionAssumptions } from "@/domain/engines";

/** Default long-term assumptions used when no scenario is selected. */
export const DEFAULT_PROJECTION: ProjectionAssumptions = {
  years: 20,
  investmentReturnBps: 700,
  incomeGrowthBps: 400,
  expenseInflationBps: 300,
  propertyAppreciationBps: 350,
};

export function withYears(
  assumptions: ProjectionAssumptions,
  years: number,
): ProjectionAssumptions {
  return { ...assumptions, years: Math.max(1, Math.floor(years)) };
}
