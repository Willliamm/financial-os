import { describe, it, expect, afterEach } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  diffCalendarDays,
  monthEndsBetween,
  setNowProvider,
  todayIsoDate,
} from "@/infrastructure/dates/date-utils";

describe("todayIsoDate", () => {
  afterEach(() => setNowProvider(() => new Date()));

  it("formats the injected clock as a calendar date", () => {
    setNowProvider(() => new Date(2026, 6, 24, 13, 45)); // 24 Jul 2026, local
    expect(todayIsoDate()).toBe("2026-07-24");
  });
});

describe("addDaysIso", () => {
  it("adds days and keeps the date-only format", () => {
    expect(addDaysIso("2026-07-24", 1)).toBe("2026-07-25");
    expect(addDaysIso("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("crosses a leap day correctly", () => {
    expect(addDaysIso("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysIso("2024-02-29", 1)).toBe("2024-03-01");
  });
});

describe("diffCalendarDays", () => {
  it("counts whole days forward and backward", () => {
    expect(diffCalendarDays("2026-07-01", "2026-07-24")).toBe(23);
    expect(diffCalendarDays("2026-07-24", "2026-07-24")).toBe(0);
    expect(diffCalendarDays("2026-07-24", "2026-07-01")).toBe(-23);
  });
});

describe("addMonthsIso", () => {
  it("adds and subtracts whole months", () => {
    expect(addMonthsIso("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsIso("2026-07-24", -5)).toBe("2026-02-24");
    expect(addMonthsIso("2026-07-24", 0)).toBe("2026-07-24");
  });

  it("clamps an overflowing day to the target month's last day", () => {
    expect(addMonthsIso("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("monthEndsBetween", () => {
  it("returns month ends in range plus the end date itself", () => {
    expect(monthEndsBetween("2026-01-15", "2026-04-10")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-10",
    ]);
  });

  it("does not duplicate an end date that is already a month end", () => {
    expect(monthEndsBetween("2026-01-15", "2026-02-28")).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
  });

  it("returns just the single date when from equals to", () => {
    expect(monthEndsBetween("2026-03-10", "2026-03-10")).toEqual(["2026-03-10"]);
  });

  it("returns an empty list when from is after to", () => {
    expect(monthEndsBetween("2026-05-01", "2026-04-01")).toEqual([]);
  });

  it("returns an empty list when either bound is not a real date, instead of throwing", () => {
    const malformed = ["06/30/2026", "1/5/2026", " ", "-", "0"];
    for (const bad of malformed) {
      expect(() => monthEndsBetween(bad, "2026-06-30")).not.toThrow();
      expect(monthEndsBetween(bad, "2026-06-30")).toEqual([]);
      expect(() => monthEndsBetween("2026-01-01", bad)).not.toThrow();
      expect(monthEndsBetween("2026-01-01", bad)).toEqual([]);
    }
  });
});
