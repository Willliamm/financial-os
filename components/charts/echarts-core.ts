// Modular, tree-shakeable ECharts setup. Only the pieces the app uses are
// registered here, so the full library is not pulled into the bundle.
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

// The modular build does NOT ship the built-in "dark" theme, so passing the
// string "dark" to init() would silently do nothing and leave axis/legend text
// dark-on-dark. Register a minimal dark theme instead. The custom color palette
// from chart-helpers.ts is passed via the option's `color` array, which wins
// over the theme, so the palette still applies on top of this theme.
echarts.registerTheme("app-dark", {
  textStyle: { color: "#d4d4d8" },
  title: { textStyle: { color: "#e4e4e7" } },
  legend: { textStyle: { color: "#d4d4d8" } },
  categoryAxis: {
    axisLabel: { color: "#a1a1aa" },
    axisLine: { lineStyle: { color: "#3f3f46" } },
    splitLine: { lineStyle: { color: "#27272a" } },
  },
  valueAxis: {
    axisLabel: { color: "#a1a1aa" },
    splitLine: { lineStyle: { color: "#27272a" } },
  },
});

export { echarts };
