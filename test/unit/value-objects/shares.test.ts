import { describe, it, expect } from "vitest";
import {
  SHARE_SCALE,
  costPerShareCents,
  formatShares,
  microsToShares,
  parseSharesToMicros,
  sharesToMicros,
  sharesValueCents,
} from "@/domain/value-objects/shares";

describe("shares conversion", () => {
  it("round-trips whole and fractional shares", () => {
    expect(sharesToMicros(12)).toBe(12_000_000);
    expect(sharesToMicros(12.5)).toBe(12_500_000);
    expect(sharesToMicros(0.000001)).toBe(1);
    expect(microsToShares(12_500_000)).toBe(12.5);
    expect(SHARE_SCALE).toBe(1_000_000);
  });

  it("rounds beyond six decimals rather than truncating", () => {
    expect(sharesToMicros(1.00000049)).toBe(1_000_000);
    expect(sharesToMicros(1.00000051)).toBe(1_000_001);
  });

  it("treats non-finite input as zero", () => {
    expect(sharesToMicros(Number.NaN)).toBe(0);
    expect(sharesToMicros(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatShares", () => {
  it("trims trailing zeros", () => {
    expect(formatShares(12_000_000)).toBe("12");
    expect(formatShares(12_500_000)).toBe("12.5");
    expect(formatShares(12_345_600)).toBe("12.3456");
  });

  it("honors maxDecimals", () => {
    expect(formatShares(12_345_600, { maxDecimals: 2 })).toBe("12.35");
    expect(formatShares(0)).toBe("0");
  });
});

describe("sharesValueCents", () => {
  it("multiplies shares by a per-share cent price and rounds to the cent", () => {
    // 12 shares at $512.40
    expect(sharesValueCents(12_000_000, 51_240)).toBe(614_880);
    // 0.5 share at $10.01 => 500.5 cents => rounds to 501
    expect(sharesValueCents(500_000, 1_001)).toBe(501);
  });

  it("is zero when either side is zero", () => {
    expect(sharesValueCents(0, 51_240)).toBe(0);
    expect(sharesValueCents(12_000_000, 0)).toBe(0);
  });
});

describe("costPerShareCents", () => {
  it("derives a per-share cost", () => {
    expect(costPerShareCents(614_880, 12_000_000)).toBe(51_240);
  });

  it("guards against division by zero", () => {
    expect(costPerShareCents(614_880, 0)).toBe(0);
  });
});

describe("parseSharesToMicros", () => {
  it("parses user text", () => {
    expect(parseSharesToMicros("12.5")).toBe(12_500_000);
    expect(parseSharesToMicros("1,000.25")).toBe(1_000_250_000);
    expect(parseSharesToMicros("")).toBe(0);
    expect(parseSharesToMicros("abc")).toBe(0);
  });
});
