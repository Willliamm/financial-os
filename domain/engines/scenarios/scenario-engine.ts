/**
 * Scenario engine: turn stored scenario assumptions into a projection and run it.
 *
 * Pure functions. Money is integer US cents.
 */

import type { FinancialContext } from "@/domain/context";
import type { Scenario, ScenarioAssumption } from "@/domain/entities";
import type { MoneyCents } from "@/infrastructure/money/money";
import {
  projectNetWorth,
  type NetWorthProjectionRow,
  type ProjectionAssumptions,
} from "@/domain/engines/net-worth/net-worth-engine";

export interface ScenarioAssumptionMap {
  [key: string]: string;
}

/** Default projection rates (bps) used when a scenario omits a key. */
const DEFAULTS = {
  investmentReturnBps: 700,
  incomeGrowthBps: 300,
  expenseInflationBps: 300,
  propertyAppreciationBps: 300,
  years: 10,
};

function toMap(assumptions: ScenarioAssumption[]): ScenarioAssumptionMap {
  const map: ScenarioAssumptionMap = {};
  for (const a of assumptions) {
    if (a.deletedAt) continue;
    map[a.key] = a.value;
  }
  return map;
}

function readNumber(
  map: ScenarioAssumptionMap,
  key: string,
  fallback: number,
): number {
  const raw = map[key];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Build projection assumptions from a scenario's stored assumptions.
 * Reads `investment_return_bps`, `income_growth_bps`, `expense_inflation_bps`,
 * `property_appreciation_bps`, and `years`. `years` defaults to the scenario's
 * year span when not overridden.
 */
export function assumptionsToProjection(
  scenario: Scenario,
  assumptions: ScenarioAssumption[],
): ProjectionAssumptions {
  const map = toMap(
    assumptions.filter((a) => a.scenarioId === scenario.id),
  );

  const spanYears = Math.max(
    0,
    (scenario.endYear ?? 0) - (scenario.startYear ?? 0),
  );
  const defaultYears = spanYears > 0 ? spanYears : DEFAULTS.years;

  return {
    investmentReturnBps: readNumber(
      map,
      "investment_return_bps",
      DEFAULTS.investmentReturnBps,
    ),
    incomeGrowthBps: readNumber(
      map,
      "income_growth_bps",
      DEFAULTS.incomeGrowthBps,
    ),
    expenseInflationBps: readNumber(
      map,
      "expense_inflation_bps",
      DEFAULTS.expenseInflationBps,
    ),
    propertyAppreciationBps: readNumber(
      map,
      "property_appreciation_bps",
      DEFAULTS.propertyAppreciationBps,
    ),
    years: Math.round(readNumber(map, "years", defaultYears)),
  };
}

export interface ScenarioResult {
  scenarioId: string;
  rows: NetWorthProjectionRow[];
  finalNetWorthCents: MoneyCents;
  finalPassiveIncomeCents: MoneyCents;
  totalEstimatedTaxCents: MoneyCents;
}

/** Run a scenario end to end and summarize it. */
export function runScenario(
  context: FinancialContext,
  scenario: Scenario,
  assumptions: ScenarioAssumption[],
): ScenarioResult {
  const projection = assumptionsToProjection(scenario, assumptions);
  const rows = projectNetWorth(context, projection);
  const last = rows[rows.length - 1];
  const totalTax = rows.reduce((sum, r) => sum + r.estimatedTaxCents, 0);

  return {
    scenarioId: scenario.id,
    rows,
    finalNetWorthCents: last ? last.netWorthCents : 0,
    finalPassiveIncomeCents: last ? last.passiveIncomeCents : 0,
    totalEstimatedTaxCents: totalTax,
  };
}

export interface ScenarioComparison {
  metric: string;
  aCents: MoneyCents;
  bCents: MoneyCents;
  diffCents: MoneyCents;
}

/** Compare two scenario results across the headline metrics. */
export function compareScenarios(
  a: ScenarioResult,
  b: ScenarioResult,
): ScenarioComparison[] {
  return [
    {
      metric: "final_net_worth",
      aCents: a.finalNetWorthCents,
      bCents: b.finalNetWorthCents,
      diffCents: a.finalNetWorthCents - b.finalNetWorthCents,
    },
    {
      metric: "final_passive_income",
      aCents: a.finalPassiveIncomeCents,
      bCents: b.finalPassiveIncomeCents,
      diffCents: a.finalPassiveIncomeCents - b.finalPassiveIncomeCents,
    },
    {
      metric: "total_estimated_tax",
      aCents: a.totalEstimatedTaxCents,
      bCents: b.totalEstimatedTaxCents,
      diffCents: a.totalEstimatedTaxCents - b.totalEstimatedTaxCents,
    },
  ];
}
