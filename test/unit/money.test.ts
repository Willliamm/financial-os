import { describe, it, expect } from "vitest";
import {
  dollarsToCents,
  centsToDollars,
  mulCents,
  divCents,
  formatCents,
  formatCompactCurrency,
  parseDollarsToCents,
} from "@/infrastructure/money/money";
import {
  bpsToRate,
  percentToBps,
  formatBps,
  parsePercentToBps,
} from "@/domain/value-objects/basis-points";

describe("money", () => {
  it("round-trips dollars to cents and back", () => {
    expect(dollarsToCents(2500.5)).toBe(250050);
    expect(centsToDollars(250050)).toBe(2500.5);
    expect(centsToDollars(dollarsToCents(1234.56))).toBe(1234.56);
  });

  it("rounds when multiplying cents", () => {
    // 250050 * 0.10 = 25005 exactly.
    expect(mulCents(250050, 0.1)).toBe(25005);
    // 101 * 0.5 = 50.5 -> rounds to 51 (nearest cent).
    expect(mulCents(101, 0.5)).toBe(51);
  });

  it("rounds when dividing cents and guards divide-by-zero", () => {
    // 100 / 3 = 33.33 -> 33.
    expect(divCents(100, 3)).toBe(33);
    // 101 / 2 = 50.5 -> 51.
    expect(divCents(101, 2)).toBe(51);
    expect(divCents(100, 0)).toBe(0);
  });

  it("parses messy dollar strings into integer cents", () => {
    expect(parseDollarsToCents("$2,500.50")).toBe(250050);
    expect(parseDollarsToCents("1000")).toBe(100000);
    expect(parseDollarsToCents("")).toBe(0);
  });

  it("formats cents as a USD currency string", () => {
    expect(formatCents(250000)).toContain("$2,500.00");
  });

  it("formats compact currency for millions and thousands", () => {
    // Code uses toFixed(2) for millions and toFixed(1) for thousands.
    expect(formatCompactCurrency(3_200_000)).toBe("$3.20M");
    expect(formatCompactCurrency(90_000)).toBe("$90.0k");
  });
});

describe("basis points", () => {
  it("converts percent to basis points", () => {
    expect(percentToBps(3.5)).toBe(350);
  });

  it("converts basis points to a decimal rate", () => {
    expect(bpsToRate(300)).toBe(0.03);
  });

  it("formats basis points as a percent string", () => {
    expect(formatBps(350)).toBe("3.50%");
  });

  it("parses a percent string into basis points", () => {
    expect(parsePercentToBps("3.5%")).toBe(350);
  });
});
