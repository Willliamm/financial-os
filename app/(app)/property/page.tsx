"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Pencil, TriangleAlert } from "lucide-react";
import type { Loan, Property } from "@/domain/entities";
import { loanForProperty } from "@/domain/context";
import {
  buildAmortizationSchedule,
  remainingBalance,
} from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { EChart } from "@/components/charts/echart";
import { lineMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { getEntityConfig } from "@/features/data-studio/registry";
import { EntityFormDrawer } from "@/features/data-studio/entity-form-drawer";
import { analyzeProperty } from "@/features/properties/analysis";

export default function PropertyDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <PropertyDetail />
    </Suspense>
  );
}

function PropertyDetail() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const id = params.get("id");
  const { data: context } = useFinancialContext();
  const [editOpen, setEditOpen] = useState(false);
  const [editLoanOpen, setEditLoanOpen] = useState(false);

  const property = context.properties.find((p) => p.id === id) ?? null;
  const loan = property ? loanForProperty(context, property.id) : null;
  const analysis = useMemo(
    () => (property ? analyzeProperty(property, loan) : null),
    [property, loan],
  );

  if (!property || !analysis) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-muted-foreground">{t("properties:detail.notFound")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={property.name}
        description={[property.street, property.city, property.state]
          .filter(Boolean)
          .join(", ")}
      >
        <Badge variant="secondary">
          {t(`properties:status.${property.status}`)}
        </Badge>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" /> {t("common:actions.edit")}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("properties:detail.kpi.currentValue")} value={formatCents(property.currentValueCents)} />
        <KpiCard label={t("properties:detail.kpi.equity")} value={formatCents(analysis.equityCents)} tone="positive" />
        <KpiCard
          label={t("properties:detail.kpi.monthlyCashFlow")}
          value={formatCents(analysis.monthlyCashFlowCents)}
          tone={analysis.monthlyCashFlowCents >= 0 ? "positive" : "negative"}
        />
        <KpiCard label={t("properties:detail.kpi.capRate")} value={`${(analysis.capRate * 100).toFixed(2)}%`} />
      </div>

      {analysis.alerts.length > 0 ? (
        <div className="space-y-2">
          {analysis.alerts.map((alert) => (
            <Alert key={alert.id} variant={alert.severity === "critical" ? "destructive" : "default"}>
              <TriangleAlert className="size-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      <Tabs defaultValue="summary">
        <TabsList className="w-full justify-start overflow-x-auto [&>button]:flex-none">
          <TabsTrigger value="summary">{t("properties:detail.tabs.summary")}</TabsTrigger>
          <TabsTrigger value="rental">{t("properties:detail.tabs.rental")}</TabsTrigger>
          <TabsTrigger value="financing">{t("properties:detail.tabs.financing")}</TabsTrigger>
          <TabsTrigger value="projections">{t("properties:detail.tabs.projections")}</TabsTrigger>
          <TabsTrigger value="notes">{t("properties:detail.tabs.notes")}</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <Stat label={t("properties:detail.summary.grossYield")} value={`${(analysis.grossYield * 100).toFixed(2)}%`} />
              <Stat label={t("properties:detail.summary.cashOnCash")} value={`${(analysis.cashOnCash * 100).toFixed(1)}%`} />
              <Stat label={t("properties:detail.summary.noiAnnual")} value={formatCents(analysis.noiAnnualCents)} />
              <Stat label={t("properties:detail.summary.dscr")} value={analysis.dscr ? analysis.dscr.toFixed(2) : t("common:dash")} />
              <Stat label={t("properties:detail.summary.breakEvenRent")} value={`${formatCents(analysis.breakEvenRentCents)}/mo`} />
              <Stat label={t("properties:detail.summary.cashInvested")} value={formatCents(analysis.cashInvestedCents)} />
              <Stat label={t("properties:detail.summary.annualCashFlow")} value={formatCents(analysis.annualCashFlowCents)} />
              <Stat label={t("properties:detail.summary.purchasePrice")} value={formatCents(property.purchasePriceCents)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rental" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
              <Stat label={t("properties:detail.rental.monthlyRent")} value={formatCents(property.rentMonthlyCents)} />
              <Stat label={t("properties:detail.rental.vacancy")} value={formatBps(property.vacancyRateBps)} />
              <Stat label={t("properties:detail.rental.managementFee")} value={formatBps(property.managementFeeBps)} />
              <Stat label={t("properties:detail.rental.hoaPerMo")} value={formatCents(property.hoaMonthlyCents)} />
              <Stat label={t("properties:detail.rental.propertyTaxPerYr")} value={formatCents(property.propertyTaxAnnualCents)} />
              <Stat label={t("properties:detail.rental.insurancePerYr")} value={formatCents(property.insuranceAnnualCents)} />
              <Stat label={t("properties:detail.rental.maintenancePerYr")} value={formatCents(property.maintenanceAnnualCents)} />
              <Stat label={t("properties:detail.rental.cddPerYr")} value={formatCents(property.cddAnnualCents)} />
              <Stat label={t("properties:detail.rental.appreciation")} value={formatBps(property.appreciationRateBps)} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financing" className="mt-4">
          <FinancingTab property={property} loan={loan} onAddEdit={() => setEditLoanOpen(true)} />
        </TabsContent>

        <TabsContent value="projections" className="mt-4">
          <ProjectionsTab property={property} loan={loan} />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardContent className="p-5">
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {property.notes || t("properties:detail.notes.empty")}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EntityFormDrawer<Property>
        config={getEntityConfig("property")}
        open={editOpen}
        onOpenChange={setEditOpen}
        entity={property}
        context={context}
      />
      <EntityFormDrawer<Loan>
        config={getEntityConfig("loan")}
        open={editLoanOpen}
        onOpenChange={setEditLoanOpen}
        entity={loan}
        context={context}
        injectDefaults={{ propertyId: property.id }}
      />
    </div>
  );
}

function FinancingTab({
  property,
  loan,
  onAddEdit,
}: {
  property: Property;
  loan: Loan | null;
  onAddEdit: () => void;
}) {
  const { t } = useTranslation();
  if (!loan) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between p-5">
          <p className="text-sm text-muted-foreground">
            {t("properties:detail.financing.noLoan")}
          </p>
          <Button variant="outline" onClick={onAddEdit}>
            {t("properties:detail.financing.addLoan")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const schedule = buildAmortizationSchedule({
    principalCents: loan.currentBalanceCents,
    annualRateBps: loan.interestRateBps,
    termMonths: loan.termMonths || 360,
    extraMonthlyCents: loan.extraPaymentMonthlyCents,
  });
  const balanceChart = lineMoneyOption(
    schedule.filter((_, i) => i % 12 === 0).map((r) => Math.round(r.monthIndex / 12)),
    [{ name: t("properties:detail.financing.balance"), data: schedule.filter((_, i) => i % 12 === 0).map((r) => toDollars(r.balanceCents)), area: true }],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{loan.lender || t("properties:detail.financing.loanFallback")}</CardTitle>
        <Button variant="outline" size="sm" onClick={onAddEdit}>
          <Pencil className="size-4" /> {t("properties:detail.financing.editLoan")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("properties:detail.financing.balance")} value={formatCents(loan.currentBalanceCents)} />
          <Stat label={t("properties:detail.financing.rate")} value={formatBps(loan.interestRateBps)} />
          <Stat label={t("properties:detail.financing.payment")} value={formatCents(loan.monthlyPaymentCents)} />
          <Stat label={t("properties:detail.financing.payoff")} value={t("properties:detail.financing.payoffYears", { count: Math.ceil(schedule.length / 12) })} />
        </div>
        <Separator />
        <EChart option={balanceChart} height={240} />
      </CardContent>
    </Card>
  );
}

function ProjectionsTab({ property, loan }: { property: Property; loan: Loan | null }) {
  const { t } = useTranslation();
  const years = 20;
  const appreciation = property.appreciationRateBps / 10000;
  const categories: number[] = [];
  const value: number[] = [];
  const equity: number[] = [];
  for (let y = 0; y <= years; y++) {
    const v = Math.round(property.currentValueCents * Math.pow(1 + appreciation, y));
    const bal = loan
      ? remainingBalance({
          principalCents: loan.currentBalanceCents,
          annualRateBps: loan.interestRateBps,
          termMonths: loan.termMonths || 360,
          monthsElapsed: y * 12,
          extraMonthlyCents: loan.extraPaymentMonthlyCents,
        })
      : 0;
    categories.push(new Date().getFullYear() + y);
    value.push(toDollars(v));
    equity.push(toDollars(v - bal));
  }
  const chart = lineMoneyOption(categories, [
    { name: t("properties:detail.projections.value"), data: value },
    { name: t("properties:detail.projections.equity"), data: equity, area: true },
  ]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("properties:detail.projections.title", { years })}</CardTitle>
      </CardHeader>
      <CardContent>
        <EChart option={chart} height={300} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums break-words">{value}</p>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/properties">
        <ArrowLeft className="size-4" /> {t("properties:detail.back")}
      </Link>
    </Button>
  );
}
