import { describe, it, expect } from "vitest";
import {
  assumptionsToProjection,
  runScenario,
  compareScenarios,
} from "@/domain/engines/scenarios/scenario-engine";
import {
  makeContext,
  makeProperty,
  makeLoan,
  makeInvestment,
  makeIncome,
  makeExpense,
  makeScenario,
  makeScenarioAssumption,
} from "./fixtures";

function buildContext() {
  const property = makeProperty({ id: "prop-sc" });
  const loan = makeLoan({ id: "loan-sc", propertyId: "prop-sc" });
  return makeContext({
    properties: [property],
    loans: [loan],
    investmentAccounts: [makeInvestment()],
    incomeSources: [makeIncome()],
    expenses: [makeExpense()],
  });
}

describe("assumptionsToProjection", () => {
  it("reads keys and falls back to scenario span for years", () => {
    const scenario = makeScenario({ id: "scen-x", startYear: 2025, endYear: 2030 });
    const proj = assumptionsToProjection(scenario, [
      makeScenarioAssumption({ scenarioId: "scen-x", key: "investment_return_bps", value: "850" }),
      makeScenarioAssumption({ scenarioId: "scen-x", key: "income_growth_bps", value: "400" }),
    ]);
    expect(proj.investmentReturnBps).toBe(850);
    expect(proj.incomeGrowthBps).toBe(400);
    // years defaults to endYear - startYear
    expect(proj.years).toBe(5);
  });

  it("uses defaults for missing keys", () => {
    const scenario = makeScenario({ id: "scen-y" });
    const proj = assumptionsToProjection(scenario, []);
    expect(proj.investmentReturnBps).toBe(700);
    expect(proj.expenseInflationBps).toBe(300);
  });
});

describe("runScenario", () => {
  it("returns endYear - startYear + 1 rows", () => {
    const ctx = buildContext();
    const scenario = makeScenario({ id: "scen-z", startYear: 2025, endYear: 2035 });
    const result = runScenario(ctx, scenario, []);
    expect(result.rows.length).toBe(11);
    expect(result.scenarioId).toBe("scen-z");
    expect(result.finalNetWorthCents).toBe(result.rows[10].netWorthCents);
    expect(result.totalEstimatedTaxCents).toBeGreaterThan(0);
  });
});

describe("compareScenarios", () => {
  it("diffs the headline metrics", () => {
    const ctx = buildContext();
    const a = runScenario(ctx, makeScenario({ id: "a" }), [
      makeScenarioAssumption({ scenarioId: "a", key: "investment_return_bps", value: "1000" }),
    ]);
    const b = runScenario(ctx, makeScenario({ id: "b" }), [
      makeScenarioAssumption({ scenarioId: "b", key: "investment_return_bps", value: "300" }),
    ]);
    const comparison = compareScenarios(a, b);
    expect(comparison.length).toBe(3);
    const netWorth = comparison.find((c) => c.metric === "final_net_worth");
    expect(netWorth).toBeDefined();
    // Higher returns -> larger final net worth.
    expect(netWorth?.diffCents).toBeGreaterThan(0);
    expect(netWorth?.diffCents).toBe(
      (netWorth?.aCents ?? 0) - (netWorth?.bCents ?? 0),
    );
  });
});
