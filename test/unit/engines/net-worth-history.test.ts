import { describe, it, expect } from "vitest";
import { buildNetWorthHistory } from "@/domain/engines/history/net-worth-history";
import {
  makeContext,
  makeInvestment,
  makeLoan,
  makeObservation,
  makeProperty,
} from "./fixtures";

describe("net-worth-history", () => {
  it("returns an empty series when there are no observations", () => {
    const ctx = makeContext({ investmentAccounts: [makeInvestment({})] });
    expect(buildNetWorthHistory(ctx, { to: "2026-06-30" })).toEqual([]);
  });

  it("carries the last mark forward across an unmarked month", () => {
    const account = makeInvestment({ id: "acct-1" });
    const ctx = makeContext({
      investmentAccounts: [account],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-20",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-03-10",
          valueCents: 12_000_000,
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-03-31" });

    expect(series.map((p) => p.date)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    // February has no mark of its own: January's value carries forward.
    expect(series[1].netWorthCents).toBe(10_000_000);
    expect(series[2].netWorthCents).toBe(12_000_000);
  });

  it("subtracts loan balances from net worth", () => {
    const ctx = makeContext({
      properties: [makeProperty({ id: "prop-1" })],
      loans: [makeLoan({ id: "loan-1" })],
      observations: [
        makeObservation({
          subjectType: "property",
          subjectId: "prop-1",
          observedAt: "2026-01-31",
          valueCents: 50_000_000,
        }),
        makeObservation({
          subjectType: "loan",
          subjectId: "loan-1",
          observedAt: "2026-01-31",
          valueCents: 30_000_000,
        }),
      ],
    });

    const [point] = buildNetWorthHistory(ctx, { to: "2026-01-31" });
    expect(point.totalAssetsCents).toBe(50_000_000);
    expect(point.totalLiabilitiesCents).toBe(30_000_000);
    expect(point.netWorthCents).toBe(20_000_000);
  });

  it("reports coverage that rises as more subjects get marked", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      properties: [makeProperty({ id: "prop-1" })],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-31",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectType: "property",
          subjectId: "prop-1",
          observedAt: "2026-02-28",
          valueCents: 50_000_000,
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-02-28" });
    expect(series[0].observedSubjects).toBe(1);
    expect(series[0].totalSubjects).toBe(2);
    expect(series[0].coverageBps).toBe(5000);
    expect(series[1].coverageBps).toBe(10000);
  });

  it("ignores soft-deleted observations", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      observations: [
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-01-31",
          valueCents: 10_000_000,
        }),
        makeObservation({
          subjectId: "acct-1",
          observedAt: "2026-02-28",
          valueCents: 99_000_000,
          deletedAt: "2026-03-01T00:00:00.000Z",
        }),
      ],
    });

    const series = buildNetWorthHistory(ctx, { to: "2026-02-28" });
    expect(series[1].netWorthCents).toBe(10_000_000);
  });
});
