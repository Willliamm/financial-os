"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function LoansPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loans = context.loans.filter((l) => !l.deletedAt);
  const marking = loans.find((l) => l.id === markingId) ?? null;

  return (
    <>
      <ListScreen
        type="loan"
        title={t("loans:title")}
        description={t("loans:description")}
        header={
          loans.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {loans.map((loan) => (
                <Button
                  key={loan.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setMarkingId(loan.id)}
                >
                  {t("observations:markBalance")}: {loan.lender}
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      {marking ? (
        <MarkValueDialog
          open={markingId !== null}
          onOpenChange={(open) => setMarkingId(open ? markingId : null)}
          householdId={context.household?.id ?? ""}
          subjectType="loan"
          subjectId={marking.id}
          subjectLabel={marking.lender}
          currentValueCents={marking.currentBalanceCents}
        />
      ) : null}
    </>
  );
}
