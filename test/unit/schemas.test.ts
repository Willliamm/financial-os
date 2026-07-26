import { describe, it, expect } from "vitest";
import { observationSchema } from "@/domain/schemas";

const TS = "2026-01-01T00:00:00.000Z";

function baseRaw(): Record<string, unknown> {
  return {
    id: "obs-1",
    version: 0,
    createdAt: TS,
    updatedAt: TS,
    householdId: "h1",
    subjectType: "investment_account",
    subjectId: "acct-1",
    observedAt: "2026-06-30",
    valueCents: 9_600_000,
    source: "manual",
    note: "",
  };
}

describe("observationSchema", () => {
  it("accepts a well-formed calendar date", () => {
    const result = observationSchema.safeParse(baseRaw());
    expect(result.success).toBe(true);
  });

  it("accepts a negative valueCents (e.g. a margin account marked honestly)", () => {
    const result = observationSchema.safeParse({
      ...baseRaw(),
      valueCents: -5_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed observedAt values instead of letting them through", () => {
    const malformed = [
      "06/30/2026",
      "1/5/2026",
      " ",
      "-",
      "0",
      "2026-13-45",
      "2026-02-30",
      "not-a-date",
      "",
    ];
    for (const observedAt of malformed) {
      const result = observationSchema.safeParse({ ...baseRaw(), observedAt });
      expect(result.success, `expected "${observedAt}" to be rejected`).toBe(
        false,
      );
    }
  });
});
