import { describe, it, expect } from "vitest";
import { realEstateAlerts } from "@/domain/engines/analysis/real-estate-analyzer";
import { dataQualityChecks } from "@/domain/engines/analysis/data-quality-checker";
import { RuleBasedInsightProvider } from "@/domain/engines/insights/insight-provider";
import {
  makeContext,
  makeProperty,
  makeLoan,
  makeIncome,
  makeExpense,
} from "./fixtures";

describe("real-estate-analyzer", () => {
  it("flags negative cash flow with a warning", () => {
    const property = makeProperty({ id: "p1", rentMonthlyCents: 100_000 }); // low rent
    const loan = makeLoan({ id: "l1", monthlyPaymentCents: 400_000 });
    const alerts = realEstateAlerts(property, loan);
    const cashflow = alerts.find((a) => a.id === "re-cashflow-p1");
    expect(cashflow).toBeDefined();
    expect(cashflow?.severity).toBe("warning");
  });

  it("flags high HOA with a deterministic id", () => {
    const property = makeProperty({ id: "p2", hoaMonthlyCents: 200_000 });
    const alerts = realEstateAlerts(property);
    expect(alerts.some((a) => a.id === "re-hoa-p2")).toBe(true);
  });

  it("flags an owned rental with no rent", () => {
    const property = makeProperty({ id: "p3", rentMonthlyCents: 0, status: "owned" });
    const alerts = realEstateAlerts(property);
    expect(alerts.some((a) => a.id === "re-norent-p3")).toBe(true);
  });
});

describe("data-quality-checker", () => {
  it("detects missing household and bad entity data", () => {
    const ctx = makeContext({
      household: null,
      properties: [makeProperty({ id: "pq", insuranceAnnualCents: 0 })],
      loans: [makeLoan({ id: "lq", interestRateBps: 0 })],
      incomeSources: [makeIncome({ id: "iq", growthRateBps: 0 })],
      expenses: [makeExpense({ id: "eq", category: "other" })],
    });
    const issues = dataQualityChecks(ctx);
    expect(issues.some((i) => i.id === "dq-household-missing")).toBe(true);
    expect(issues.some((i) => i.id === "dq-property-insurance-pq")).toBe(true);
    expect(issues.some((i) => i.id === "dq-loan-rate-lq")).toBe(true);
    expect(issues.some((i) => i.id === "dq-income-growth-iq")).toBe(true);
    expect(issues.some((i) => i.id === "dq-expense-category-eq")).toBe(true);
  });
});

describe("RuleBasedInsightProvider", () => {
  it("generates a deterministic list of insights", async () => {
    const ctx = makeContext({
      properties: [makeProperty({ id: "pi", hoaMonthlyCents: 200_000 })],
      incomeSources: [makeIncome()],
      expenses: [makeExpense()],
    });
    const provider = new RuleBasedInsightProvider();
    const insights = await provider.generateInsights({ context: ctx });
    expect(insights.length).toBeGreaterThan(0);
    // Every insight has a stable id and a non-empty message.
    for (const insight of insights) {
      expect(insight.id).toBeTruthy();
      expect(insight.message.length).toBeGreaterThan(0);
    }
  });
});
