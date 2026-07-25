import { describe, it, expect } from "vitest";
import {
  assessFreshness,
  planConfidenceBps,
} from "@/domain/engines/history/data-freshness";
import {
  makeContext,
  makeInvestment,
  makeLoan,
  makeObservation,
} from "./fixtures";

describe("assessFreshness", () => {
  it("marks a never-observed subject as stale with a null age", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1", name: "Brokerage" })],
    });

    const [row] = assessFreshness(ctx, "2026-07-24");
    expect(row.subjectId).toBe("acct-1");
    expect(row.label).toBe("Brokerage");
    expect(row.lastObservedAt).toBeNull();
    expect(row.ageDays).toBeNull();
    expect(row.level).toBe("stale");
  });

  it("uses the newest mark and honors the threshold boundaries", () => {
    const ctx = makeContext({
      investmentAccounts: [makeInvestment({ id: "acct-1" })],
      observations: [
        makeObservation({ subjectId: "acct-1", observedAt: "2026-01-01" }),
        makeObservation({ subjectId: "acct-1", observedAt: "2026-06-09" }),
      ],
    });

    // 2026-06-09 -> 2026-07-24 is exactly 45 days: still fresh.
    expect(assessFreshness(ctx, "2026-07-24")[0].level).toBe("fresh");
    expect(assessFreshness(ctx, "2026-07-24")[0].ageDays).toBe(45);
    // 46 days: aging.
    expect(assessFreshness(ctx, "2026-07-25")[0].level).toBe("aging");
    // Exactly 180 days: still aging. 181: stale.
    expect(assessFreshness(ctx, "2026-12-06")[0].level).toBe("aging");
    expect(assessFreshness(ctx, "2026-12-07")[0].level).toBe("stale");
  });

  it("labels a loan by its lender", () => {
    const ctx = makeContext({
      loans: [makeLoan({ id: "loan-1", lender: "Chase" })],
    });
    expect(assessFreshness(ctx, "2026-07-24")[0].label).toBe("Chase");
  });

  it("sorts stale subjects before fresh ones", () => {
    const ctx = makeContext({
      investmentAccounts: [
        makeInvestment({ id: "fresh-1", name: "Fresh" }),
        makeInvestment({ id: "never-1", name: "Never" }),
      ],
      observations: [
        makeObservation({ subjectId: "fresh-1", observedAt: "2026-07-20" }),
      ],
    });

    const rows = assessFreshness(ctx, "2026-07-24");
    expect(rows[0].label).toBe("Never");
    expect(rows[1].label).toBe("Fresh");
  });
});

describe("planConfidenceBps", () => {
  it("is 10000 for an empty list", () => {
    expect(planConfidenceBps([])).toBe(10_000);
  });

  it("weights fresh at 1, aging at 0.5 and stale at 0", () => {
    const rows = [
      { level: "fresh" as const },
      { level: "aging" as const },
    ] as Parameters<typeof planConfidenceBps>[0];
    expect(planConfidenceBps(rows)).toBe(7500);
  });

  it("is 0 when every subject is stale", () => {
    const rows = [
      { level: "stale" as const },
      { level: "stale" as const },
    ] as Parameters<typeof planConfidenceBps>[0];
    expect(planConfidenceBps(rows)).toBe(0);
  });
});
