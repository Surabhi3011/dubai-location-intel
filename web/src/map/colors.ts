import type { Tokens } from "../charts/theme";
import { seqRamp } from "../charts/theme";

export type RGBA = [number, number, number, number];

export function hexToRgba(hex: string, alpha = 255): RGBA {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [0, 1, 2, 3].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGBA;
}

export interface Scale {
  kind: "sequential" | "diverging";
  color: (v: number | null | undefined) => RGBA;
  stops: { color: string; label: string }[];
}

/** Sequential quantile scale (one hue, light -> dark) over the observed values. */
export function quantileScale(values: number[], t: Tokens, format: (v: number) => string, reverse = false): Scale {
  const ramp = seqRamp(t);
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = ramp.length;
  const breaks = Array.from({ length: n - 1 }, (_, i) => sorted[Math.floor(((i + 1) / n) * (sorted.length - 1))] ?? 0);
  const colors = (reverse ? [...ramp].reverse() : ramp).map((h) => hexToRgba(h, 215));
  const color = (v: number | null | undefined): RGBA => {
    if (v === null || v === undefined || !Number.isFinite(v)) return [0, 0, 0, 0];
    let i = 0;
    while (i < breaks.length && v > breaks[i]) i++;
    return colors[i];
  };
  const edges = [sorted[0], ...breaks, sorted[sorted.length - 1]];
  const stops = colors.map((c, i) => ({
    color: `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`,
    label: sorted.length ? `${format(edges[i])} – ${format(edges[i + 1])}` : "",
  }));
  return { kind: "sequential", color, stops };
}

/** Diverging scale: red (negative) <- gray midpoint at 0 -> blue (positive), symmetric. */
export function divergingScale(values: number[], t: Tokens, format: (v: number) => string): Scale {
  const finite = values.filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const max = finite[Math.floor(finite.length * 0.95)] || 1;
  const neg = hexToRgba(t["div-neg"], 215);
  const mid = hexToRgba(t["div-mid"], 215);
  const pos = hexToRgba(t["div-pos"], 215);
  const color = (v: number | null | undefined): RGBA => {
    if (v === null || v === undefined || !Number.isFinite(v)) return [0, 0, 0, 0];
    const x = Math.max(-1, Math.min(1, v / max));
    return x < 0 ? mix(mid, neg, -x) : mix(mid, pos, x);
  };
  const steps = [-1, -0.5, 0, 0.5, 1];
  const stops = steps.map((s) => {
    const c = color(s * max);
    return { color: `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`, label: `${s > 0 ? "+" : ""}${format(s * max)}` };
  });
  return { kind: "diverging", color, stops };
}
