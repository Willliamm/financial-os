"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsCoreOption } from "echarts/core";
import type { HistoryPoint } from "@/domain/engines";
import { EChart } from "@/components/charts/echart";
import { CHART_PALETTE, toDollars } from "@/components/charts/chart-helpers";
import { formatCompactCurrency } from "@/infrastructure/money/money";
import { formatDate } from "@/infrastructure/dates/date-utils";

export interface NetWorthHistoryChartProps {
  points: HistoryPoint[];
  height?: number;
}

/**
 * Observed net worth over time. Point opacity encodes coverage: a faint marker
 * means most assets had no mark on that date, so the value understates reality.
 */
export function NetWorthHistoryChart({
  points,
  height = 300,
}: NetWorthHistoryChartProps) {
  const { t } = useTranslation();

  const option = useMemo<EChartsCoreOption>(() => {
    const seriesName = t("observations:history.netWorth");
    return {
      color: [CHART_PALETTE[0]],
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const rows = params as Array<{ dataIndex: number; axisValue: string }>;
          const point = points[rows[0]?.dataIndex ?? 0];
          if (!point) return "";
          const coverage = t("observations:history.coverage", {
            observed: point.observedSubjects,
            total: point.totalSubjects,
          });
          return [
            formatDate(point.date),
            `${seriesName}: ${formatCompactCurrency(toDollars(point.netWorthCents))}`,
            coverage,
          ].join("<br/>");
        },
      },
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: points.map((p) => formatDate(p.date, "MMM yy")),
      },
      yAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => formatCompactCurrency(v) },
        splitLine: { lineStyle: { opacity: 0.3 } },
      },
      series: [
        {
          name: seriesName,
          type: "line",
          smooth: true,
          showSymbol: true,
          symbolSize: 7,
          areaStyle: { opacity: 0.12 },
          data: points.map((p) => ({
            value: toDollars(p.netWorthCents),
            itemStyle: { opacity: 0.35 + 0.65 * (p.coverageBps / 10_000) },
          })),
        },
      ],
    };
  }, [points, t]);

  return <EChart option={option} height={height} />;
}
