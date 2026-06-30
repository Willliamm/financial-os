import { describe, it, expect } from "vitest";
import {
  projectRetirement,
  projectedRetirementBalanceCents,
} from "@/domain/engines/retirement/retirement-engine";

describe("retirement-engine", () => {
  const input = {
    currentBalanceCents: 10_000_000, // $100k
    monthlyContributionCents: 200_000, // $2k
    expectedReturnBps: 700,
    currentAge: 40,
    retirementAge: 65,
  };

  it("returns one row per year from current age to retirement age", () => {
    const rows = projectRetirement(input);
    expect(rows.length).toBe(26); // ages 40..65 inclusive
    expect(rows[0].age).toBe(40);
    expect(rows[0].balanceCents).toBe(10_000_000);
    expect(rows[0].contributionCents).toBe(0);
    expect(rows[rows.length - 1].age).toBe(65);
  });

  it("grows the balance every year", () => {
    const rows = projectRetirement(input);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].balanceCents).toBeGreaterThan(rows[i - 1].balanceCents);
      expect(rows[i].contributionCents).toBe(200_000 * 12);
    }
  });

  it("projected balance at retirement is much larger than the start", () => {
    const balance = projectedRetirementBalanceCents(input);
    expect(balance).toBeGreaterThan(input.currentBalanceCents);
    // 25 years of growth + contributions should clearly exceed $1M.
    expect(balance).toBeGreaterThan(100_000_000);
  });
});
