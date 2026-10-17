import type { EChartsOption } from "echarts";
import { BarChart, HeatmapChart, LineChart, RadarChart, ScatterChart } from "echarts/charts";
import {
  CalendarComponent, GridComponent, LegendComponent, MarkLineComponent, RadarComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";
import { baseOption, type Tokens, useTokens } from "./theme";

// Tree-shaken build: only the chart types and components this app uses.
echarts.use([
  BarChart, LineChart, ScatterChart, HeatmapChart, RadarChart,
  GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, VisualMapComponent, CalendarComponent, RadarComponent,
  CanvasRenderer,
]);

function merge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    if (v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b)) {
      out[k] = merge(b as Record<string, unknown>, v as Record<string, unknown>);
    } else if (Array.isArray(v) && b && typeof b === "object" && !Array.isArray(b) && (k === "xAxis" || k === "yAxis")) {
      out[k] = v.map((axis) => merge(b as Record<string, unknown>, axis));
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default function EChartImpl({
  option, height = 260, onEvents, ariaLabel,
}: {
  option: (t: Tokens) => EChartsOption;
  height?: number;
  onEvents?: Record<string, (p: unknown) => void>;
  ariaLabel?: string;
}) {
  const t = useTokens();
  const opt = useMemo(
    () => merge(baseOption(t) as Record<string, unknown>, option(t) as Record<string, unknown>),
    [t, option],
  );
  return (
    <div role="img" aria-label={ariaLabel}>
      <ReactEChartsCore echarts={echarts} option={opt} style={{ height, width: "100%" }} notMerge lazyUpdate onEvents={onEvents} />
    </div>
  );
}
