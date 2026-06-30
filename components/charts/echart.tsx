"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { EChartProps } from "./echart-impl";

// Load the ECharts runtime lazily so it lands in its own async chunk instead of
// every chart route's initial JS. The container keeps its height during load to
// avoid layout shift.
const LazyEChart = dynamic(
  () => import("./echart-impl").then((m) => m.EChartImpl),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-md" />,
  },
);

export function EChart({ option, height = 300, className }: EChartProps) {
  return (
    <div className={className} style={{ height }}>
      <LazyEChart option={option} height={height} className="h-full" />
    </div>
  );
}

export type { EChartProps };
