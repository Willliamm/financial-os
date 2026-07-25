/**
 * How old the data behind the plan is.
 *
 * Pure. Dates are calendar days, "YYYY-MM-DD". The caller supplies `asOf`;
 * the engine never reads a clock.
 */

import type { FinancialContext } from "@/domain/context";
import type { ObservationSubjectType } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { diffCalendarDays } from "@/infrastructure/dates/date-utils";

export type FreshnessLevel = "fresh" | "aging" | "stale";

export interface FreshnessThresholds {
  /** Max age in days that still counts as fresh. */
  freshDays: number;
  /** Max age in days that still counts as aging. Beyond this is stale. */
  agingDays: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  freshDays: 45,
  agingDays: 180,
};

export interface SubjectFreshness {
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Display name of the subject entity. */
  label: string;
  lastObservedAt: string | null;
  /** null when the subject was never observed. */
  ageDays: number | null;
  level: FreshnessLevel;
}

const LEVEL_ORDER: Record<FreshnessLevel, number> = {
  stale: 0,
  aging: 1,
  fresh: 2,
};

const LEVEL_WEIGHT: Record<FreshnessLevel, number> = {
  fresh: 1,
  aging: 0.5,
  stale: 0,
};

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function levelFor(
  ageDays: number | null,
  thresholds: FreshnessThresholds,
): FreshnessLevel {
  if (ageDays === null) return "stale";
  if (ageDays <= thresholds.freshDays) return "fresh";
  if (ageDays <= thresholds.agingDays) return "aging";
  return "stale";
}

export function assessFreshness(
  context: FinancialContext,
  asOf: string,
  thresholds: Partial<FreshnessThresholds> = {},
): SubjectFreshness[] {
  const limits = { ...DEFAULT_FRESHNESS_THRESHOLDS, ...thresholds };

  const newestMark = new Map<string, string>();
  for (const o of context.observations.filter(notDeleted)) {
    const key = `${o.subjectType}:${o.subjectId}`;
    const current = newestMark.get(key);
    if (!current || o.observedAt > current) newestMark.set(key, o.observedAt);
  }

  const subjects: Array<{
    subjectType: ObservationSubjectType;
    subjectId: string;
    label: string;
  }> = [
    ...context.investmentAccounts.filter(notDeleted).map((a) => ({
      subjectType: "investment_account" as const,
      subjectId: a.id,
      label: a.name,
    })),
    ...context.properties.filter(notDeleted).map((p) => ({
      subjectType: "property" as const,
      subjectId: p.id,
      label: p.name,
    })),
    ...context.loans.filter(notDeleted).map((l) => ({
      subjectType: "loan" as const,
      subjectId: l.id,
      label: l.lender,
    })),
  ];

  const rows: SubjectFreshness[] = subjects.map((s) => {
    const lastObservedAt =
      newestMark.get(`${s.subjectType}:${s.subjectId}`) ?? null;
    const ageDays =
      lastObservedAt === null ? null : diffCalendarDays(lastObservedAt, asOf);
    return { ...s, lastObservedAt, ageDays, level: levelFor(ageDays, limits) };
  });

  // Worst first, and within a level the oldest first, so the banner leads with
  // what most needs attention.
  return rows.sort((a, b) => {
    const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
    if (byLevel !== 0) return byLevel;
    return (b.ageDays ?? Number.MAX_SAFE_INTEGER) - (a.ageDays ?? Number.MAX_SAFE_INTEGER);
  });
}

/** Weighted share of fresh data: fresh = 1, aging = 0.5, stale = 0. */
export function planConfidenceBps(
  freshness: Pick<SubjectFreshness, "level">[],
): BasisPoints {
  if (freshness.length === 0) return 10_000;
  const total = freshness.reduce((sum, f) => sum + LEVEL_WEIGHT[f.level], 0);
  return Math.round((total / freshness.length) * 10_000);
}
