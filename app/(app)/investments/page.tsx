"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import type { BaseEntity } from "@/domain/entities/base";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import type { RowAction } from "@/features/data-studio/entity-list";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function InvestmentsPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const householdId = context.household?.id ?? null;
  const accounts = context.investmentAccounts.filter((a) => !a.deletedAt);
  const marking = accounts.find((a) => a.id === markingId) ?? null;

  const rowActions = useMemo<RowAction<BaseEntity>[] | undefined>(
    () =>
      householdId
        ? [
            {
              key: "mark-value",
              label: t("observations:markValue"),
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
        type="investment_account"
        title={t("investments:title")}
        description={t("investments:description")}
        rowActions={rowActions}
      />

      {marking && householdId ? (
        <MarkValueDialog
          open={markingId !== null}
          onOpenChange={(open) => setMarkingId(open ? markingId : null)}
          householdId={householdId}
          subjectType="investment_account"
          subjectId={marking.id}
          subjectLabel={marking.name}
          currentValueCents={marking.currentBalanceCents}
        />
      ) : null}
    </>
  );
}
