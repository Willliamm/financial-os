"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MarkValueDialog } from "@/components/shared/mark-value-dialog";
import { ListScreen } from "@/features/data-studio/list-screen";
import { useFinancialContext } from "@/lib/queries/financial-data";

export default function InvestmentsPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [markingId, setMarkingId] = useState<string | null>(null);

  const householdId = context.household?.id ?? null;
  const accounts = context.investmentAccounts.filter((a) => !a.deletedAt);
  const marking = accounts.find((a) => a.id === markingId) ?? null;

  return (
    <>
      <ListScreen
        type="investment_account"
        title={t("investments:title")}
        description={t("investments:description")}
        header={
          accounts.length > 0 && householdId ? (
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => (
                <Button
                  key={account.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setMarkingId(account.id)}
                >
                  {t("observations:markValue")}: {account.name}
                </Button>
              ))}
            </div>
          ) : null
        }
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
