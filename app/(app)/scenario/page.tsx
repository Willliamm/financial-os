"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import type { Scenario, ScenarioAssumption } from "@/domain/entities";
import type { FinancialContext } from "@/domain/context";
import { compareScenarios, runScenario } from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EChart } from "@/components/charts/echart";
import { barMoneyOption, lineMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { PercentInput } from "@/components/forms/percent-input";
import { Input } from "@/components/ui/input";
import { formatCents, formatCompactCurrency } from "@/infrastructure/money/money";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { getEntityConfig } from "@/features/data-studio/registry";
import { EntityFormDrawer } from "@/features/data-studio/entity-form-drawer";
import { useEntityActions } from "@/features/data-studio/use-entity-actions";

const ASSUMPTION_FIELDS: Array<{ key: string; labelKey: string; kind: "percent" | "number" }> = [
  { key: "investment_return_bps", labelKey: "scenarios:detail.assumptions.investmentReturn", kind: "percent" },
  { key: "income_growth_bps", labelKey: "scenarios:detail.assumptions.incomeGrowth", kind: "percent" },
  { key: "expense_inflation_bps", labelKey: "scenarios:detail.assumptions.expenseInflation", kind: "percent" },
  { key: "property_appreciation_bps", labelKey: "scenarios:detail.assumptions.propertyAppreciation", kind: "percent" },
  { key: "years", labelKey: "scenarios:detail.assumptions.years", kind: "number" },
];

export default function ScenarioDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ScenarioDetail />
    </Suspense>
  );
}

function ScenarioDetail() {
  const { t } = useTranslation();
  const params = useSearchParams();
  const id = params.get("id");
  const { data: context } = useFinancialContext();
  const [editOpen, setEditOpen] = useState(false);

  const scenario = context.scenarios.find((s) => s.id === id) ?? null;

  if (!scenario) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-muted-foreground">{t("scenarios:detail.notFound")}</p>
      </div>
    );
  }

  const assumptions = context.scenarioAssumptions.filter(
    (a) => a.scenarioId === scenario.id,
  );
  const result = runScenario(context, scenario, assumptions);

  const baseScenario =
    context.scenarios.find((s) => s.id === scenario.baseScenarioId) ??
    context.scenarios.find((s) => s.id !== scenario.id) ??
    null;
  const baseResult = baseScenario
    ? runScenario(
        context,
        baseScenario,
        context.scenarioAssumptions.filter((a) => a.scenarioId === baseScenario.id),
      )
    : null;
  const comparison = baseResult ? compareScenarios(result, baseResult) : [];

  const years = result.rows.map((r) => r.year);
  const netWorthChart = lineMoneyOption(years, [
    { name: t("scenarios:detail.charts.legend.netWorth"), data: result.rows.map((r) => toDollars(r.netWorthCents)), area: true },
    { name: t("scenarios:detail.charts.legend.assets"), data: result.rows.map((r) => toDollars(r.totalAssetsCents)) },
    { name: t("scenarios:detail.charts.legend.liabilities"), data: result.rows.map((r) => toDollars(r.totalLiabilitiesCents)) },
  ]);
  const cashflowChart = barMoneyOption(years, [
    { name: t("scenarios:detail.charts.legend.investableCashflow"), data: result.rows.map((r) => toDollars(r.investableCashflowCents)) },
    { name: t("scenarios:detail.charts.legend.estimatedTax"), data: result.rows.map((r) => toDollars(r.estimatedTaxCents)) },
  ]);

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader title={scenario.name} description={scenario.description || `${scenario.startYear}–${scenario.endYear}`}>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-4" /> {t("common:actions.edit")}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t("scenarios:detail.kpi.finalNetWorth")} value={formatCents(result.finalNetWorthCents)} tone="positive" />
        <KpiCard label={t("scenarios:detail.kpi.finalPassiveIncome")} value={`${formatCents(result.finalPassiveIncomeCents)}/mo`} />
        <KpiCard label={t("scenarios:detail.kpi.totalEstimatedTax")} value={formatCents(result.totalEstimatedTaxCents)} tone="negative" />
        <KpiCard label={t("scenarios:detail.kpi.horizon")} value={t("scenarios:detail.horizonYears", { count: result.rows.length - 1 })} />
      </div>

      <AssumptionsEditor scenario={scenario} assumptions={assumptions} context={context} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("scenarios:detail.charts.netWorthTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={netWorthChart} height={300} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("scenarios:detail.charts.cashflowTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={cashflowChart} height={300} />
          </CardContent>
        </Card>
      </div>

      {baseScenario && comparison.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("scenarios:detail.comparison.title", { name: baseScenario.name })}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("scenarios:detail.comparison.metric")}</TableHead>
                  <TableHead className="text-right">{scenario.name}</TableHead>
                  <TableHead className="text-right">{baseScenario.name}</TableHead>
                  <TableHead className="text-right">{t("scenarios:detail.comparison.difference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((row) => (
                  <TableRow key={row.metric}>
                    <TableCell>{row.metric}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCompactCurrency(row.aCents / 100)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCompactCurrency(row.bCents / 100)}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${row.diffCents >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
                    >
                      {row.diffCents >= 0 ? "+" : ""}
                      {formatCompactCurrency(row.diffCents / 100)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <EntityFormDrawer<Scenario>
        config={getEntityConfig("scenario")}
        open={editOpen}
        onOpenChange={setEditOpen}
        entity={scenario}
        context={context}
      />
    </div>
  );
}

function AssumptionsEditor({
  scenario,
  assumptions,
  context,
}: {
  scenario: Scenario;
  assumptions: ScenarioAssumption[];
  context: FinancialContext;
}) {
  const { t } = useTranslation();
  const actions = useEntityActions();
  const initial: Record<string, number> = {};
  for (const f of ASSUMPTION_FIELDS) {
    const existing = assumptions.find((a) => a.key === f.key);
    initial[f.key] = existing ? Number(existing.value) || 0 : 0;
  }
  const [values, setValues] = useState<Record<string, number>>(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      for (const f of ASSUMPTION_FIELDS) {
        const existing = assumptions.find((a) => a.key === f.key);
        const value = String(values[f.key] ?? 0);
        if (existing) {
          if (existing.value !== value) {
            await actions.update<ScenarioAssumption>("scenario_assumption", {
              id: existing.id,
              value,
            });
          }
        } else {
          await actions.create<ScenarioAssumption>("scenario_assumption", {
            scenarioId: scenario.id,
            key: f.key,
            value,
            valueType: f.kind === "percent" ? "bps" : "number",
          });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("scenarios:detail.assumptions.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {ASSUMPTION_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="mb-1.5 block text-xs">{t(f.labelKey)}</Label>
              {f.kind === "percent" ? (
                <PercentInput
                  value={values[f.key] ?? 0}
                  onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
                />
              ) : (
                <Input
                  type="number"
                  value={values[f.key] ?? 0}
                  onChange={(e) =>
                    setValues((s) => ({ ...s, [f.key]: Number(e.target.value) }))
                  }
                />
              )}
            </div>
          ))}
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? t("scenarios:detail.assumptions.saving") : t("scenarios:detail.assumptions.update")}
        </Button>
      </CardContent>
    </Card>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/scenarios">
        <ArrowLeft className="size-4" /> {t("scenarios:detail.back")}
      </Link>
    </Button>
  );
}
