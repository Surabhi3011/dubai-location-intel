import type { EChartsOption } from "echarts";
import { lazy, Suspense } from "react";
import type { Tokens } from "./theme";

// ECharts (~200 KB gzipped) loads after the first paint so KPI cards appear immediately.
const EChartImpl = lazy(() => import("./EChartImpl"));

export interface EChartProps {
  option: (t: Tokens) => EChartsOption;
  height?: number;
  onEvents?: Record<string, (p: unknown) => void>;
  ariaLabel?: string;
}

export function EChart(props: EChartProps) {
  const height = props.height ?? 260;
  return (
    <Suspense fallback={<div className="animate-pulse rounded-lg bg-surface-2" style={{ height }} />}>
      <EChartImpl {...props} />
    </Suspense>
  );
}
