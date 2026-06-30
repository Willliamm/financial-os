"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  assumptionsToProjection,
  projectNetWorth,
  type ProjectionAssumptions,
} from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EChart } from "@/components/charts/echart";
import { barMoneyOption, lineMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { formatCents } from "@/infrastructure/money/money";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { DEFAULT_PROJECTION, withYears } from "@/features/projections/assumptions";

export default function ProjectionsPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [horizon, setHorizon] = useState("20");
  const [scenarioId, setScenarioId] = useState("default");

  const assumptions = useMemo<ProjectionAssumptions>(() => {
    const years = Number(horizon);
    if (scenarioId === "default") return withYears(DEFAULT_PROJECTION, years);
    const scenario = context.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return withYears(DEFAULT_PROJECTION, years);
    const scenarioAssumptions = context.scenarioAssumptions.filter(
      (a) => a.scenarioId === scenario.id,
    );
    return withYears(assumptionsToProjection(scenario, scenarioAssumptions), years);
  }, [horizon, scenarioId, context]);

  const rows = useMemo(
    () => projectNetWorth(context, assumptions),
    [context, assumptions],
  );
  const last = rows[rows.length - 1];
  const years = rows.map((r) => r.year);

  return (
    <div className="space-y-6">
      <PageHeader title={t("projections:header.title")} description={t("projections:header.description")}>
        <Select value={scenarioId} onValueChange={setScenarioId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{t("projections:scenario.default")}</SelectItem>
            {context.scenarios.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={horizon} onValueChange={setHorizon}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">{t("projections:horizon.years", { n: 10 })}</SelectItem>
            <SelectItem value="20">{t("projections:horizon.years", { n: 20 })}</SelectItem>
            <SelectItem value="30">{t("projections:horizon.years", { n: 30 })}</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t("projections:kpi.netWorthIn", { year: last?.year ?? "" })} value={formatCents(last?.netWorthCents ?? 0)} tone="positive" />
        <KpiCard label={t("projections:kpi.assets")} value={formatCents(last?.totalAssetsCents ?? 0)} />
        <KpiCard label={t("projections:kpi.passiveIncome")} value={`${formatCents(last?.passiveIncomeCents ?? 0)}${t("projections:perMonth")}`} />
        <KpiCard label={t("projections:kpi.investablePerYear")} value={formatCents(last?.investableCashflowCents ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("projections:cards.netWorthAssetsLiabilities")}</CardTitle></CardHeader>
          <CardContent>
            <EChart
              option={lineMoneyOption(years, [
                { name: t("projections:series.netWorth"), data: rows.map((r) => toDollars(r.netWorthCents)), area: true },
                { name: t("projections:series.assets"), data: rows.map((r) => toDollars(r.totalAssetsCents)) },
                { name: t("projections:series.liabilities"), data: rows.map((r) => toDollars(r.totalLiabilitiesCents)) },
              ])}
              height={300}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("projections:cards.activeVsPassive")}</CardTitle></CardHeader>
          <CardContent>
            <EChart
              option={lineMoneyOption(years, [
                { name: t("projections:series.active"), data: rows.map((r) => toDollars(r.activeIncomeCents)) },
                { name: t("projections:series.passive"), data: rows.map((r) => toDollars(r.passiveIncomeCents)), area: true },
              ])}
              height={300}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t("projections:cards.cashFlowTax")}</CardTitle></CardHeader>
          <CardContent>
            <EChart
              option={barMoneyOption(years, [
                { name: t("projections:series.investableCashFlow"), data: rows.map((r) => toDollars(r.investableCashflowCents)) },
                { name: t("projections:series.estimatedTax"), data: rows.map((r) => toDollars(r.estimatedTaxCents)) },
              ])}
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("projections:cards.yearByYear")}</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="h-80">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projections:table.year")}</TableHead>
                  <TableHead className="text-right">{t("projections:table.netWorth")}</TableHead>
                  <TableHead className="text-right">{t("projections:table.assets")}</TableHead>
                  <TableHead className="text-right">{t("projections:table.liabilities")}</TableHead>
                  <TableHead className="text-right">{t("projections:table.passivePerMonth")}</TableHead>
                  <TableHead className="text-right">{t("projections:table.estTax")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.year}>
                    <TableCell>{r.year}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(r.netWorthCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(r.totalAssetsCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(r.totalLiabilitiesCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(r.passiveIncomeCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(r.estimatedTaxCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
