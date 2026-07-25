import { describe, it, expect } from "vitest";
import {
  SUBJECT_VALUE_FIELD,
  isNewestMark,
} from "@/features/observations/subject-map";
import { makeObservation } from "./engines/fixtures";

describe("SUBJECT_VALUE_FIELD", () => {
  it("maps each subject type to the field a mark writes through to", () => {
    expect(SUBJECT_VALUE_FIELD.investment_account).toBe("currentBalanceCents");
    expect(SUBJECT_VALUE_FIELD.property).toBe("currentValueCents");
    expect(SUBJECT_VALUE_FIELD.loan).toBe("currentBalanceCents");
  });
});

describe("isNewestMark", () => {
  const existing = [
    makeObservation({ subjectId: "acct-1", observedAt: "2026-03-31" }),
    makeObservation({ subjectId: "acct-1", observedAt: "2026-06-30" }),
    makeObservation({ subjectId: "acct-2", observedAt: "2026-12-31" }),
  ];

  it("is true for a mark newer than every mark on that subject", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-07-24"),
    ).toBe(true);
  });

  it("is true for a mark on the same day as the newest one", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-06-30"),
    ).toBe(true);
  });

  it("is false for a backdated mark", () => {
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-05-01"),
    ).toBe(false);
  });

  it("ignores a newer mark that belongs to a different subject", () => {
    // acct-2 carries a 2026-12-31 mark. Without subject filtering it would make
    // this acct-1 mark look backdated, so `true` here proves the filter works.
    expect(
      isNewestMark(existing, "investment_account", "acct-1", "2026-07-01"),
    ).toBe(true);
    // acct-2 judged on its own marks: 2026-12-31 is still ahead of 2026-07-01.
    expect(
      isNewestMark(existing, "investment_account", "acct-2", "2026-07-01"),
    ).toBe(false);
    expect(
      isNewestMark(existing, "investment_account", "acct-2", "2027-01-01"),
    ).toBe(true);
  });

  it("is true when the subject has no marks yet", () => {
    expect(
      isNewestMark(existing, "property", "prop-9", "2020-01-01"),
    ).toBe(true);
  });

  it("ignores soft-deleted marks", () => {
    const withDeleted = [
      ...existing,
      makeObservation({
        subjectId: "acct-1",
        observedAt: "2026-12-31",
        deletedAt: "2027-01-01T00:00:00.000Z",
      }),
    ];
    expect(
      isNewestMark(withDeleted, "investment_account", "acct-1", "2026-07-24"),
    ).toBe(true);
  });
});
