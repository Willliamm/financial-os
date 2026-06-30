"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Building2, Plus, TriangleAlert } from "lucide-react";
import type { Property } from "@/domain/entities";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/infrastructure/money/money";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { getEntityConfig } from "@/features/data-studio/registry";
import { EntityFormDrawer } from "@/features/data-studio/entity-form-drawer";
import { analyzePropertyInContext } from "@/features/properties/analysis";

export default function PropertiesPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const properties = context.properties;
  const totals = properties.reduce(
    (acc, p) => {
      const a = analyzePropertyInContext(p, context);
      acc.value += p.currentValueCents;
      acc.equity += a.equityCents;
      acc.cashFlow += a.monthlyCashFlowCents;
      return acc;
    },
    { value: 0, equity: 0, cashFlow: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("properties:list.title")}
        description={t("properties:list.description")}
      >
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="size-4" />
          {t("properties:list.addProperty")}
        </Button>
      </PageHeader>

      {properties.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" />}
          title={t("properties:list.empty.title")}
          description={t("properties:list.empty.description")}
          action={
            <Button variant="outline" onClick={() => setDrawerOpen(true)}>
              <Plus className="size-4" /> {t("properties:list.empty.action")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard label={t("properties:list.kpi.portfolioValue")} value={formatCents(totals.value)} />
            <KpiCard label={t("properties:list.kpi.totalEquity")} value={formatCents(totals.equity)} tone="positive" />
            <KpiCard
              label={t("properties:list.kpi.monthlyCashFlow")}
              value={formatCents(totals.cashFlow)}
              tone={totals.cashFlow >= 0 ? "positive" : "negative"}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </>
      )}

      <EntityFormDrawer<Property>
        config={getEntityConfig("property")}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        context={context}
      />
    </div>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const a = analyzePropertyInContext(property, context);
  const cashFlowTone =
    a.monthlyCashFlowCents >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <Link
      href={`/property?id=${property.id}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
    <Card className="cursor-pointer transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{property.name}</p>
            <p className="text-xs text-muted-foreground">
              {[property.city, property.state].filter(Boolean).join(", ")}
            </p>
          </div>
          <Badge variant="secondary">
            {t(`properties:status.${property.status}`)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label={t("properties:list.card.value")} value={formatCents(property.currentValueCents)} />
          <Metric label={t("properties:list.card.capRate")} value={`${(a.capRate * 100).toFixed(2)}%`} />
          <Metric
            label={t("properties:list.card.cashPerMo")}
            value={formatCents(a.monthlyCashFlowCents)}
            className={cashFlowTone}
          />
          <Metric label={t("properties:list.card.cashOnCash")} value={`${(a.cashOnCash * 100).toFixed(1)}%`} />
        </div>

        {a.alerts.length > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <TriangleAlert className="size-3.5" />
            {t("properties:list.alerts", { count: a.alerts.length })}
          </div>
        ) : null}
      </CardContent>
    </Card>
    </Link>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-medium tabular-nums ${className ?? ""}`}>{value}</p>
    </div>
  );
}
