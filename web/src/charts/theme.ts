import { useEffect, useState } from "react";

const TOKENS = [
  "surface-1", "surface-2", "text-primary", "text-secondary", "text-muted", "axis", "grid", "baseline", "accent",
  "series-1", "series-2", "series-3", "series-4", "series-5", "series-6", "series-7", "series-8",
  "seq-100", "seq-200", "seq-300", "seq-400", "seq-500", "seq-600", "seq-700",
  "div-neg", "div-mid", "div-pos", "delta-good", "delta-bad",
  "status-good", "status-warning", "status-serious", "status-critical",
] as const;
export type Token = (typeof TOKENS)[number];
export type Tokens = Record<Token, string> & { dark: boolean };

function read(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const t = Object.fromEntries(TOKENS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) as Record<Token, string>;
  return { ...t, dark: cs.colorScheme === "dark" || document.documentElement.dataset.theme === "dark" };
}

/** Resolved color tokens; re-reads when the theme attribute or OS scheme changes. */
export function useTokens(): Tokens {
  const [tokens, setTokens] = useState<Tokens>(read);
  useEffect(() => {
    const update = () => setTokens(read());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => { mo.disconnect(); mq.removeEventListener("change", update); };
  }, []);
  return tokens;
}

export const seriesColors = (t: Tokens) =>
  [t["series-1"], t["series-2"], t["series-3"], t["series-4"], t["series-5"], t["series-6"], t["series-7"], t["series-8"]];

export const seqRamp = (t: Tokens) =>
  [t["seq-100"], t["seq-200"], t["seq-300"], t["seq-400"], t["seq-500"], t["seq-600"], t["seq-700"]];

/** Base ECharts option: recessive axes, hairline grid, system font, themed tooltip. */
export function baseOption(t: Tokens) {
  const axisCommon = {
    axisLine: { lineStyle: { color: t.baseline } },
    axisTick: { show: false },
    axisLabel: { color: t["text-muted"], fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    nameTextStyle: { color: t["text-muted"], fontSize: 11 },
  };
  return {
    color: seriesColors(t),
    backgroundColor: "transparent",
    textStyle: { fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: t["text-secondary"] },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      backgroundColor: t["surface-1"],
      borderColor: t.baseline,
      borderWidth: 1,
      textStyle: { color: t["text-primary"], fontSize: 12 },
      extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;",
    },
    legend: {
      show: false, top: 0, left: 0, icon: "roundRect", itemWidth: 10, itemHeight: 10,
      textStyle: { color: t["text-secondary"], fontSize: 12 },
    },
    xAxis: axisCommon,
    yAxis: { ...axisCommon, axisLine: { show: false } },
  };
}
