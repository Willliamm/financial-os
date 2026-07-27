"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import {
  allocationByAssetClass,
  allocationDrift,
  buildLotViews,
  buildPositions,
  moneyWeightedReturnBps,
  portfolioCostBasisCents,
  portfolioUnrealizedGainCents,
  portfolioValueCents,
} from "@/domain/engines";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EChart } from "@/components/charts/echart";
import { donutMoneyOption, toDollars } from "@/components/charts/chart-helpers";
import { formatCents } from "@/infrastructure/money/money";
import { formatBps } from "@/domain/value-objects/basis-points";
import { todayIsoDate } from "@/infrastructure/dates/date-utils";
import { useFinancialContext } from "@/lib/queries/financial-data";
import { useLatestPrices } from "@/lib/queries/market-data";
import { PositionsTable } from "@/features/portfolio/positions-table";
import { LotsTable } from "@/features/portfolio/lots-table";
import { useRefreshQuotes } from "@/features/portfolio/use-refresh-quotes";
import { SetPriceDialog } from "@/features/portfolio/set-price-dialog";
import { EntityFormDrawer } from "@/features/data-studio/entity-form-drawer";
import { getEntityConfig } from "@/features/data-studio/registry";

export default function PortfolioPage() {
  const { t } = useTranslation();
  const { data: context } = useFinancialContext();
  const { prices, asOf } = useLatestPrices();
  const { refresh, running } = useRefreshQuotes();
  const [priceDialog, setPriceDialog] = useState<{ ticker: string; currentPriceCents: number } | null>(
    null,
  );
  const [addingHolding, setAddingHolding] = useState(false);
  const [addingLotFor, setAddingLotFor] = useState<string | null>(null);

  const model = useMemo(() => {
    const today = todayIsoDate();
    const positions = buildPositions(context, prices);
    return {
      positions,
      lotViews: buildLotViews(context, prices, today),
      valueCents: portfolioValueCents(positions),
      basisCents: portfolioCostBasisCents(positions),
      gainCents: portfolioUnrealizedGainCents(positions),
      returnBps: moneyWeightedReturnBps(context, prices, today),
      allocation: allocationByAssetClass(positions),
      drift: allocationDrift(context, positions),
      missingPrices: positions.filter((p) => !p.hasPrice).length,
    };
  }, [context, prices]);

  const accountNameById = useMemo(
    () =>
      Object.fromEntries(
        context.investmentAccounts.filter((a) => !a.deletedAt).map((a) => [a.id, a.name]),
      ),
    [context.investmentAccounts],
  );

  const isEmpty = model.positions.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t("portfolio:title")} description={t("portfolio:description")}>
        {isEmpty ? null : (
          <>
            <Button variant="outline" onClick={() => setAddingHolding(true)}>
              <Plus className="size-4" />
              {t("portfolio:addHolding")}
            </Button>
            <Button variant="outline" onClick={() => void refresh()} disabled={running}>
              {running ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {running ? t("portfolio:refresh.running") : t("portfolio:refresh.button")}
            </Button>
          </>
        )}
      </PageHeader>

      {isEmpty ? (
        <EmptyState
          title={t("portfolio:positions.title")}
          description={t("portfolio:positions.empty")}
          action={
            <Button variant="outline" size="sm" onClick={() => setAddingHolding(true)}>
              <Plus className="size-4" />
              {t("portfolio:addHolding")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label={t("portfolio:summary.marketValue")}
              value={formatCents(model.valueCents)}
            />
            <KpiCard
              label={t("portfolio:summary.costBasis")}
              value={formatCents(model.basisCents)}
            />
            <KpiCard
              label={t("portfolio:summary.unrealizedGain")}
              value={formatCents(model.gainCents)}
              tone={model.gainCents >= 0 ? "positive" : "negative"}
              sub={
                model.basisCents > 0
                  ? formatBps(Math.round((model.gainCents / model.basisCents) * 10_000))
                  : undefined
              }
            />
            <KpiCard
              label={t("portfolio:summary.moneyWeightedReturn")}
              value={model.returnBps === null ? "—" : formatBps(model.returnBps)}
              tone={model.missingPrices > 0 ? "warning" : "default"}
              sub={
                model.missingPrices > 0
                  ? t("portfolio:summary.missingPrices", { count: model.missingPrices })
                  : undefined
              }
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("portfolio:positions.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PositionsTable
                positions={model.positions}
                prices={prices}
                asOf={asOf}
                accountNameById={accountNameById}
                onSetPrice={(ticker, currentPriceCents) => setPriceDialog({ ticker, currentPriceCents })}
                onAddLot={setAddingLotFor}
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("portfolio:allocation.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <EChart
                  option={donutMoneyOption(
                    model.allocation.map((slice) => ({
                      name: t(`entities:assetClass.${slice.assetClass}`),
                      value: toDollars(slice.valueCents),
                    })),
                  )}
                  height={280}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("portfolio:allocation.drift")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {model.drift.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("portfolio:allocation.noTargets")}
                  </p>
                ) : (
                  model.drift.map((d) => (
                    <div key={d.holdingId} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{d.ticker}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatBps(d.actualBps)} / {formatBps(d.targetBps)}
                      </span>
                      <span className="tabular-nums">
                        {t(
                          d.driftBps >= 0
                            ? "portfolio:allocation.overweight"
                            : "portfolio:allocation.underweight",
                          { amount: formatBps(Math.abs(d.driftBps)) },
                        )}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("portfolio:lots.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <LotsTable views={model.lotViews} />
            </CardContent>
          </Card>

          <SetPriceDialog
            open={priceDialog !== null}
            onOpenChange={(open) => {
              if (!open) setPriceDialog(null);
            }}
            ticker={priceDialog?.ticker ?? ""}
            currentPriceCents={priceDialog?.currentPriceCents ?? 0}
          />
        </>
      )}

      <EntityFormDrawer
        config={getEntityConfig("holding")}
        open={addingHolding}
        onOpenChange={setAddingHolding}
        entity={null}
        context={context}
      />

      <EntityFormDrawer
        config={getEntityConfig("lot")}
        open={addingLotFor !== null}
        onOpenChange={(open) => setAddingLotFor(open ? addingLotFor : null)}
        entity={null}
        context={context}
        injectDefaults={addingLotFor ? { holdingId: addingLotFor } : undefined}
      />
    </div>
  );
}
