/**
 * Net-worth history from observed marks.
 *
 * Pure. Money is integer US cents. Dates are calendar days, "YYYY-MM-DD".
 *
 * The engine never invents a value for a subject that has no mark on or before
 * a sample date. It carries the last known mark forward and reports how much of
 * the portfolio each point actually covers, so a sparse history reads as sparse
 * rather than as a confident line.
 */

import type { FinancialContext } from "@/domain/context";
import type { Observation, ObservationSubjectType } from "@/domain/entities";
import { OBSERVATION_SUBJECT_IS_LIABILITY } from "@/domain/entities";
import type { BasisPoints } from "@/domain/value-objects/basis-points";
import { monthEndsBetween } from "@/infrastructure/dates/date-utils";
import type { MoneyCents } from "@/infrastructure/money/money";

export interface HistoryPoint {
  /** Sample date, "YYYY-MM-DD". */
  date: string;
  totalAssetsCents: MoneyCents;
  totalLiabilitiesCents: MoneyCents;
  netWorthCents: MoneyCents;
  /** Tracked subjects that had a mark on or before this date. */
  observedSubjects: number;
  totalSubjects: number;
  /** observedSubjects / totalSubjects in bps. 10000 = fully covered. */
  coverageBps: BasisPoints;
}

export interface HistoryOptions {
  /** Defaults to the earliest observation date. */
  from?: string;
  /** Required. The engine takes no clock, so the caller supplies "today". */
  to: string;
  /** Defaults to "month". Only monthly sampling exists today. */
  granularity?: "month";
}

interface TrackedSubject {
  subjectType: ObservationSubjectType;
  subjectId: string;
  isLiability: boolean;
}

function notDeleted<T extends { deletedAt?: string | null }>(e: T): boolean {
  return !e.deletedAt;
}

function subjectKey(type: ObservationSubjectType, id: string): string {
  return `${type}:${id}`;
}

/** Every entity whose value belongs on the net-worth curve. */
function trackedSubjects(context: FinancialContext): TrackedSubject[] {
  const make = (
    subjectType: ObservationSubjectType,
    subjectId: string,
  ): TrackedSubject => ({
    subjectType,
    subjectId,
    isLiability: OBSERVATION_SUBJECT_IS_LIABILITY[subjectType],
  });

  return [
    ...context.investmentAccounts
      .filter(notDeleted)
      .map((a) => make("investment_account", a.id)),
    ...context.properties.filter(notDeleted).map((p) => make("property", p.id)),
    ...context.loans.filter(notDeleted).map((l) => make("loan", l.id)),
  ];
}

/** Latest observation on or before `date`, or undefined. `list` is ascending. */
function markOnOrBefore(
  list: Observation[] | undefined,
  date: string,
): Observation | undefined {
  if (!list) return undefined;
  let found: Observation | undefined;
  for (const o of list) {
    if (o.observedAt > date) break;
    found = o;
  }
  return found;
}

export function buildNetWorthHistory(
  context: FinancialContext,
  options: HistoryOptions,
): HistoryPoint[] {
  const observations = context.observations
    .filter(notDeleted)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (observations.length === 0) return [];

  const subjects = trackedSubjects(context);
  if (subjects.length === 0) return [];

  const from = options.from ?? observations[0].observedAt;
  const dates = monthEndsBetween(from, options.to);
  if (dates.length === 0) return [];

  const bySubject = new Map<string, Observation[]>();
  for (const o of observations) {
    const key = subjectKey(o.subjectType, o.subjectId);
    const list = bySubject.get(key);
    if (list) list.push(o);
    else bySubject.set(key, [o]);
  }

  return dates.map((date) => {
    let totalAssetsCents = 0;
    let totalLiabilitiesCents = 0;
    let observedSubjects = 0;

    for (const subject of subjects) {
      const mark = markOnOrBefore(
        bySubject.get(subjectKey(subject.subjectType, subject.subjectId)),
        date,
      );
      if (!mark) continue;
      observedSubjects += 1;
      if (subject.isLiability) totalLiabilitiesCents += mark.valueCents;
      else totalAssetsCents += mark.valueCents;
    }

    return {
      date,
      totalAssetsCents,
      totalLiabilitiesCents,
      netWorthCents: totalAssetsCents - totalLiabilitiesCents,
      observedSubjects,
      totalSubjects: subjects.length,
      coverageBps: Math.round((observedSubjects / subjects.length) * 10_000),
    };
  });
}
