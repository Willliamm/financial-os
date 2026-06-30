import type { EChartsCoreOption } from "echarts/core";
import { centsToDollars, formatCents, formatCompactCurrency } from "@/infrastructure/money/money";

export const CHART_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#dc2626",
  "#65a30d",
];

const BASE_GRID = { left: 8, right: 16, top: 32, bottom: 8, containLabel: true };

function moneyAxis() {
  return {
    type: "value" as const,
    axisLabel: {
      formatter: (value: number) => formatCompactCurrency(value),
    },
    splitLine: { lineStyle: { opacity: 0.3 } },
  };
}

interface Series {
  name: string;
  data: number[]; // dollars
  area?: boolean;
}

/** Line chart for time series of money (values supplied in dollars). */
export function lineMoneyOption(
  categories: Array<string | number>,
  series: Series[],
): EChartsCoreOption {
  return {
    color: CHART_PALETTE,
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: unknown) => formatCompactCurrency(Number(v)),
    },
    legend: { top: 0, type: "scroll" },
    grid: BASE_GRID,
    xAxis: { type: "category", boundaryGap: false, data: categories },
    yAxis: moneyAxis(),
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      showSymbol: false,
      areaStyle: s.area ? { opacity: 0.12 } : undefined,
      data: s.data,
    })),
  };
}

/** Grouped/stacked bar chart for money values (in dollars). */
export function barMoneyOption(
  categories: Array<string | number>,
  series: Series[],
  stacked = false,
): EChartsCoreOption {
  return {
    color: CHART_PALETTE,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (v: unknown) => formatCompactCurrency(Number(v)),
    },
    legend: { top: 0, type: "scroll" },
    grid: BASE_GRID,
    xAxis: { type: "category", data: categories },
    yAxis: moneyAxis(),
    series: series.map((s) => ({
      name: s.name,
      type: "bar",
      stack: stacked ? "total" : undefined,
      data: s.data,
    })),
  };
}

/** Donut chart for an allocation breakdown (values in dollars). */
export function donutMoneyOption(
  data: Array<{ name: string; value: number }>,
): EChartsCoreOption {
  return {
    color: CHART_PALETTE,
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number };
        return `${p.name}: ${formatCompactCurrency(p.value)} (${p.percent}%)`;
      },
    },
    legend: { bottom: 0, type: "scroll" },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderWidth: 2 },
        label: { show: false },
        data,
      },
    ],
  };
}

/** Convert cents to a chart-ready dollar number. */
export function toDollars(cents: number): number {
  return Math.round(centsToDollars(cents));
}

export { formatCents };
