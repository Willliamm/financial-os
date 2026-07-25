import type { Observation, ObservationSubjectType } from "@/domain/entities";

/**
 * Which persisted field a mark of this subject type writes through to.
 * Application-layer knowledge: it names storage fields, so it does not belong
 * in the pure domain. The liability flag lives in the domain instead, as
 * OBSERVATION_SUBJECT_IS_LIABILITY.
 */
export const SUBJECT_VALUE_FIELD: Record<ObservationSubjectType, string> = {
  investment_account: "currentBalanceCents",
  property: "currentValueCents",
  loan: "currentBalanceCents",
};

/**
 * True when `observedAt` is at least as recent as every existing mark on the
 * subject, so the mark should also update the entity's current value.
 * A backdated mark is history only and must not overwrite a newer value.
 */
export function isNewestMark(
  observations: Observation[],
  subjectType: ObservationSubjectType,
  subjectId: string,
  observedAt: string,
): boolean {
  return observations
    .filter(
      (o) =>
        !o.deletedAt &&
        o.subjectType === subjectType &&
        o.subjectId === subjectId,
    )
    .every((o) => o.observedAt <= observedAt);
}
