"use client";

import { useEffect, useRef } from "react";
import type { EChartsCoreOption, ECharts } from "echarts/core";
import { useTheme } from "next-themes";
import { echarts } from "./echarts-core";
import { cn } from "@/lib/utils";

export interface EChartProps {
  option: EChartsCoreOption;
  height?: number | string;
  className?: string;
}

/**
 * Thin imperative React wrapper around Apache ECharts. Loaded lazily via the
 * `EChart` wrapper in `echart.tsx`, so the ECharts runtime is a separate async
 * chunk and stays out of each route's initial JS.
 */
export function EChartImpl({ option, className }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(
      containerRef.current,
      resolvedTheme === "dark" ? "app-dark" : undefined,
      { renderer: "canvas" },
    );
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // Re-create on theme change so colors update.
  }, [resolvedTheme]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      style={{ background: "transparent" }}
    />
  );
}
