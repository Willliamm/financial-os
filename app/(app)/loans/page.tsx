"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import type { BaseEntity } from "@/domain/entities/base";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import type { RowAction } from "@/features/data-studio/entity-list";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function LoansPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const householdId = context.household?.id ?? null;
  const loans = context.loans.filter((l) => !l.deletedAt);
  const marking = loans.find((l) => l.id === markingId) ?? null;

  const rowActions = useMemo<RowAction<BaseEntity>[] | undefined>(
    () =>
      householdId
        ? [
            {
              key: "mark-balance",
              label: t("observations:markBalance"),
              icon: History,
              onSelect: (entity) => setMarkingId(entity.id),
            },
          ]
        : undefined,
    [householdId, t],
  );

  return (
    <>
      <ListScreen
        type="loan"
        title={t("loans:title")}
        description={t("loans:description")}
        rowActions={rowActions}
      />

      {marking && householdId ? (
        <MarkValueDialog
          open={markingId !== null}
          onOpenChange={(open) => setMarkingId(open ? markingId : null)}
          householdId={householdId}
          subjectType="loan"
          subjectId={marking.id}
          subjectLabel={marking.lender}
          currentValueCents={marking.currentBalanceCents}
        />
      ) : null}
    </>
  );
}
