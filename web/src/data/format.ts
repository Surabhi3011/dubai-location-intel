import type { Nullable } from "./types";

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Compact AED: AED 1.2M, AED 298.5B, AED 840K. */
export function aed(v: Nullable<number> | undefined, { prefix = true } = {}): string {
  if (!isNum(v)) return "—";
  const abs = Math.abs(v);
  const [n, s] = abs >= 1e9 ? [v / 1e9, "B"] : abs >= 1e6 ? [v / 1e6, "M"] : abs >= 1e4 ? [v / 1e3, "K"] : [v, ""];
  const body = s ? `${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}${s}` : nf0.format(n);
  return prefix ? `AED ${body}` : body;
}

export const int = (v: Nullable<number> | undefined) => (isNum(v) ? nf0.format(v) : "—");
export const dec1 = (v: Nullable<number> | undefined) => (isNum(v) ? nf1.format(v) : "—");
export const psf = (v: Nullable<number> | undefined) => (isNum(v) ? `${nf0.format(v)} AED/sqft` : "—");
export const pct = (v: Nullable<number> | undefined, digits = 1) => (isNum(v) ? `${v.toFixed(digits)}%` : "—");
export const signedPct = (v: Nullable<number> | undefined, digits = 1) =>
  isNum(v) ? `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%` : "—";
export const km = (m: Nullable<number> | undefined) =>
  !isNum(m) ? "—" : m < 1000 ? `${nf0.format(Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export function percentileOf(sorted: number[], v: number, higherIsBetter: boolean): number {
  if (!sorted.length) return 50;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  const below = lo / Math.max(1, sorted.length - 1);
  const p = Math.min(1, Math.max(0, below)) * 100;
  return higherIsBetter ? p : 100 - p;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string | Blob, type = "text/csv") {
  const blob = typeof content === "string" ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
