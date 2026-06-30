"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFinancialContext } from "@/lib/queries/financial-data";
import {
  estimateAnnualTaxCents,
  estimateEffectiveTaxRateBps,
  estimateTaxableIncomeCents,
  totalEstimatedTaxSavingsCents,
} from "@/domain/engines";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { KpiCard } from "@/components/shared/kpi-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListScreen } from "@/features/data-studio/list-screen";

export default function TaxPlanningPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();

  const taxableIncomeCents = estimateTaxableIncomeCents(context);
  const annualTaxCents = estimateAnnualTaxCents(context);
  const effectiveRateBps = estimateEffectiveTaxRateBps(context);
  const savingsCents = totalEstimatedTaxSavingsCents(context);

  const header = (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>{t("taxPlanning:disclaimer.title")}</AlertTitle>
        <AlertDescription>
          {t("taxPlanning:disclaimer.body")}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t("taxPlanning:kpi.taxableIncome")}
          value={formatCents(taxableIncomeCents, { compact: true })}
        />
        <KpiCard
          label={t("taxPlanning:kpi.annualTax")}
          value={formatCents(annualTaxCents, { compact: true })}
          tone="negative"
        />
        <KpiCard
          label={t("taxPlanning:kpi.effectiveRate")}
          value={formatBps(effectiveRateBps)}
        />
        <KpiCard
          label={t("taxPlanning:kpi.taxSavings")}
          value={formatCents(savingsCents, { compact: true })}
          tone="positive"
          sub={t("taxPlanning:kpi.taxSavingsSub")}
        />
      </div>
    </div>
  );

  return (
    <ListScreen
      type="tax_strategy"
      title={t("taxPlanning:header.title")}
      description={t("taxPlanning:header.description")}
      header={header}
    />
  );
}
