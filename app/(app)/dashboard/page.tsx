"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Coins,
  Info,
  Lightbulb,
  Percent,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { FinancialContext } from "@/domain/context";
import {
  estimateEffectiveTaxRateBps,
  monthlyActiveIncomeCents,
  monthlyExpensesCents,
  monthlyInvestableCashflowCents,
  monthlyPassiveIncomeCents,
  netWorthCents,
  progressToFire,
  projectNetWorth,
  savingsRate,
  totalAssetsCents,
  totalLiabilitiesCents,
  type Insight,
  RuleBasedInsightProvider,
} from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { EChart } from "@/components/charts/echart";
import {
  barMoneyOption,
  donutMoneyOption,
  lineMoneyOption,
  toDollars,
} from "@/components/charts/chart-helpers";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { currentYear } from "@/infrastructure/dates/date-utils";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { DEFAULT_PROJECTION } from "@/features/projections/assumptions";
import Link from "next/link";

export default function DashboardPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();

  const m = useMemo(() => computeMetrics(context, t), [context, t]);
  const insights = useInsights(context);

  const isEmpty =
    context.properties.length === 0 &&
    context.investmentAccounts.length === 0 &&
    context.incomeSources.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("dashboard:header.title")} description={t("dashboard:header.description")} />
        <EmptyState
          icon={<Lightbulb className="size-8" />}
          title={t("dashboard:empty.title")}
          description={t("dashboard:empty.description")}
          action={
            <Button asChild>
              <Link href="/data-studio">{t("dashboard:empty.openDataStudio")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard:header.title")}
        description={t("dashboard:header.descriptionYear", { year: currentYear() })}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={t("dashboard:kpi.netWorth")}
          value={formatCents(m.netWorth)}
          tone={m.netWorth >= 0 ? "positive" : "negative"}
          icon={<Wallet className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.totalAssets")}
          value={formatCents(m.assets)}
          icon={<TrendingUp className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.totalLiabilities")}
          value={formatCents(m.liabilities)}
          tone="negative"
          icon={<TrendingDown className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.investableCashFlow")}
          value={`${formatCents(m.investable)}${t("dashboard:perMonth")}`}
          tone={m.investable >= 0 ? "positive" : "negative"}
          icon={<ArrowDownUp className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.monthlyIncome")}
          value={formatCents(m.income)}
          icon={<Coins className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.monthlyExpenses")}
          value={formatCents(m.expenses)}
          icon={<Receipt className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.passiveIncome")}
          value={`${formatCents(m.passive)}${t("dashboard:perMonth")}`}
          icon={<PiggyBank className="size-4" />}
        />
        <KpiCard
          label={t("dashboard:kpi.savingsRate")}
          value={`${(m.savings * 100).toFixed(0)}%`}
          tone={m.savings >= 0.2 ? "positive" : "warning"}
          icon={<Percent className="size-4" />}
          sub={t("dashboard:kpi.savingsTarget")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard:cards.netWorthProjection")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={m.netWorthChart} height={300} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard:cards.financialIndependence")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">{t("dashboard:fire.progress")}</span>
                <span className="text-sm font-medium">
                  {(m.fireProgress * 100).toFixed(0)}%
                </span>
              </div>
              <Progress value={Math.min(100, m.fireProgress * 100)} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{t("dashboard:fire.effectiveTaxRate")}</p>
                <p className="font-medium tabular-nums">{formatBps(m.taxRate)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("dashboard:fire.debtToAsset")}</p>
                <p className="font-medium tabular-nums">
                  {m.assets > 0 ? `${((m.liabilities / m.assets) * 100).toFixed(0)}%` : t("common:dash")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard:cards.assetAllocation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={m.allocationChart} height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard:cards.assetsVsLiabilities")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={m.debtChart} height={280} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard:cards.incomeMix")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={m.incomeChart} height={280} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard:cards.insights")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dashboard:insights.empty")}
            </p>
          ) : (
            insights
              .slice(0, 8)
              .map((insight) => <InsightRow key={insight.id} insight={insight} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const icon = {
    info: <Info className="size-4 text-blue-500" />,
    success: <CheckCircle2 className="size-4 text-emerald-500" />,
    warning: <TriangleAlert className="size-4 text-amber-500" />,
    critical: <AlertTriangle className="size-4 text-red-500" />,
  }[insight.severity];
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <span className="mt-0.5">{icon}</span>
      <div>
        <p className="text-sm font-medium">{insight.title}</p>
        <p className="text-sm text-muted-foreground">{insight.message}</p>
      </div>
    </div>
  );
}

function useInsights(context: FinancialContext): Insight[] {
  const [insights, setInsights] = useState<Insight[]>([]);
  useEffect(() => {
    let active = true;
    const provider = new RuleBasedInsightProvider();
    void provider.generateInsights({ context }).then((result) => {
      if (active) setInsights(result);
    });
    return () => {
      active = false;
    };
  }, [context]);
  return insights;
}

function computeMetrics(context: FinancialContext, t: TFunction) {
  const assets = totalAssetsCents(context);
  const liabilities = totalLiabilitiesCents(context);
  const netWorth = netWorthCents(context);
  const income = monthlyActiveIncomeCents(context) + monthlyPassiveIncomeCents(context);
  const expenses = monthlyExpensesCents(context);
  const passive = monthlyPassiveIncomeCents(context);
  const investable = monthlyInvestableCashflowCents(context);

  const projection = projectNetWorth(context, DEFAULT_PROJECTION);
  const netWorthChart = lineMoneyOption(
    projection.map((r) => r.year),
    [
      { name: t("dashboard:series.netWorth"), data: projection.map((r) => toDollars(r.netWorthCents)), area: true },
      { name: t("dashboard:series.assets"), data: projection.map((r) => toDollars(r.totalAssetsCents)) },
      { name: t("dashboard:series.liabilities"), data: projection.map((r) => toDollars(r.totalLiabilitiesCents)) },
    ],
  );

  const allocationChart = donutMoneyOption(assetAllocation(context, t));

  const debtChart = barMoneyOption(
    [t("dashboard:series.today")],
    [
      { name: t("dashboard:series.assets"), data: [toDollars(assets)] },
      { name: t("dashboard:series.liabilities"), data: [toDollars(liabilities)] },
    ],
  );

  const incomeChart = barMoneyOption(
    [t("dashboard:series.monthly")],
    [
      { name: t("dashboard:series.active"), data: [toDollars(monthlyActiveIncomeCents(context))] },
      { name: t("dashboard:series.passive"), data: [toDollars(passive)] },
      { name: t("dashboard:series.expenses"), data: [toDollars(expenses)] },
    ],
  );

  return {
    assets,
    liabilities,
    netWorth,
    income,
    expenses,
    passive,
    investable,
    savings: savingsRate(context),
    taxRate: estimateEffectiveTaxRateBps(context),
    fireProgress: progressToFire(context),
    netWorthChart,
    allocationChart,
    debtChart,
    incomeChart,
  };
}

function assetAllocation(
  context: FinancialContext,
  t: TFunction,
): Array<{ name: string; value: number }> {
  const propertyValue = context.properties
    .filter((p) => !p.deletedAt)
    .reduce((s, p) => s + p.currentValueCents, 0);

  const buckets: Record<string, number> = {
    realEstate: propertyValue,
    retirement: 0,
    brokerage: 0,
    cash: 0,
    crypto: 0,
    other: 0,
  };
  const RETIREMENT = new Set([
    "401k",
    "solo_401k",
    "ira",
    "roth_ira",
    "hsa",
    "cash_balance_plan",
  ]);
  for (const acc of context.investmentAccounts) {
    if (acc.deletedAt) continue;
    if (RETIREMENT.has(acc.accountType)) buckets.retirement += acc.currentBalanceCents;
    else if (acc.accountType === "brokerage") buckets.brokerage += acc.currentBalanceCents;
    else if (acc.accountType === "cash") buckets.cash += acc.currentBalanceCents;
    else if (acc.accountType === "crypto") buckets.crypto += acc.currentBalanceCents;
    else buckets.other += acc.currentBalanceCents;
  }
  return Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([name, v]) => ({ name: t(`dashboard:allocation.${name}`), value: toDollars(v) }));
}
