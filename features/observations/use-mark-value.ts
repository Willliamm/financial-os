"use client";

import { useCallback } from "react";
import type { Observation, ObservationSubjectType } from "@/domain/entities";
import type { BaseEntity } from "@/domain/entities/base";
import { useEntityActions } from "@/features/data-studio/use-entity-actions";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { SUBJECT_VALUE_FIELD, isNewestMark } from "./subject-map";

/** Any entity that carries a numeric current-value field a mark can update. */
type ValueBearingEntity = BaseEntity & Record<string, number>;
type ValuePatch = { id: string } & Record<string, number>;

export interface MarkValueInput {
  householdId: string;
  subjectType: ObservationSubjectType;
  subjectId: string;
  /** Calendar day of the mark, "YYYY-MM-DD". */
  observedAt: string;
  valueCents: number;
  note?: string;
}

/**
 * Record a value mark. Writes the Observation, and — only when the mark is the
 * newest one for that subject — also updates the subject's current-value field
 * so every existing engine keeps reading a correct "today".
 *
 * Two commands, one user action: a historical fact and a change to the current
 * value are two distinct things, and both belong in the audit log.
 */
export function useMarkValue() {
  const { create, update } = useEntityActions();
  const { data: context } = useFinancialContext();

  return useCallback(
    async (input: MarkValueInput): Promise<void> => {
      const shouldUpdateCurrent = isNewestMark(
        context.observations,
        input.subjectType,
        input.subjectId,
        input.observedAt,
      );

      await create<Observation>("observation", {
        householdId: input.householdId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        observedAt: input.observedAt,
        valueCents: input.valueCents,
        source: "manual",
        note: input.note ?? "",
      });

      if (shouldUpdateCurrent) {
        // The field name is chosen at runtime, so the patch is typed through a
        // widened entity shape rather than a specific entity interface.
        const patch = {
          id: input.subjectId,
          [SUBJECT_VALUE_FIELD[input.subjectType]]: input.valueCents,
        } as ValuePatch;
        await update<ValueBearingEntity>(input.subjectType, patch, {
          sync: true,
        });
      }
    },
    [context.observations, create, update],
  );
}
