import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export type Period = "3m" | "6m" | "12m" | "ytd" | `${number}`;
export type PropType = "all" | "apartment" | "villa";
export type Beds = "all" | "0" | "1" | "2" | "3" | "4";
export type Market = "all" | "offplan" | "ready";
export type Band = "all" | "<1M" | "1-2M" | "2-3M" | "3-5M" | "5M+";

export interface Filters {
  period: Period;
  type: PropType;
  beds: Beds;
  market: Market;
  band: Band;
  communities: string[];
}

export const DEFAULTS: Filters = { period: "12m", type: "all", beds: "all", market: "all", band: "all", communities: [] };

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "ytd", label: "Year to date" },
];
export const TYPE_OPTIONS: { value: PropType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "apartment", label: "Apartment" },
  { value: "villa", label: "Villa / townhouse" },
];
export const BEDS_OPTIONS: { value: Beds; label: string }[] = [
  { value: "all", label: "All bedrooms" },
  { value: "0", label: "Studio" },
  { value: "1", label: "1 bed" },
  { value: "2", label: "2 beds" },
  { value: "3", label: "3 beds" },
  { value: "4", label: "4+ beds" },
];
export const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: "all", label: "Off-plan + ready" },
  { value: "offplan", label: "Off-plan" },
  { value: "ready", label: "Ready" },
];
export const BAND_OPTIONS: { value: Band; label: string }[] = [
  { value: "all", label: "Any price" },
  { value: "<1M", label: "< AED 1M" },
  { value: "1-2M", label: "AED 1–2M" },
  { value: "2-3M", label: "AED 2–3M" },
  { value: "3-5M", label: "AED 3–5M" },
  { value: "5M+", label: "AED 5M+" },
];

/** Global filters live in the URL so every view is shareable (plan §6). */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: Filters = useMemo(
    () => ({
      period: (params.get("period") as Period) ?? DEFAULTS.period,
      type: (params.get("type") as PropType) ?? DEFAULTS.type,
      beds: (params.get("beds") as Beds) ?? DEFAULTS.beds,
      market: (params.get("market") as Market) ?? DEFAULTS.market,
      band: (params.get("band") as Band) ?? DEFAULTS.band,
      communities: params.get("c")?.split(",").filter(Boolean) ?? [],
    }),
    [params],
  );

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const merged = { ...filters, ...patch };
          for (const key of ["period", "type", "beds", "market", "band"] as const) {
            if (merged[key] === DEFAULTS[key]) next.delete(key);
            else next.set(key, merged[key]);
          }
          if (merged.communities.length) next.set("c", merged.communities.join(","));
          else next.delete("c");
          return next;
        },
        { replace: true },
      );
    },
    [filters, setParams],
  );

  const reset = useCallback(() => setFilters(DEFAULTS), [setFilters]);
  return { filters, setFilters, reset };
}

export function isDefault(f: Filters, ignorePeriod = false) {
  return (
    (ignorePeriod || f.period === DEFAULTS.period) &&
    f.type === "all" && f.beds === "all" && f.market === "all" && f.band === "all" && f.communities.length === 0
  );
}

const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export interface Window { start: string; end: string; label: string } // end exclusive

/** Current, previous and year-ago windows for a period, anchored on the last complete month. */
export function periodWindows(period: Period, lastFullMonth: string, dataThrough: string) {
  const end = addMonths(lastFullMonth, 1);
  let start: string;
  let label: string;
  let curEnd = end;
  if (period === "ytd") {
    start = `${lastFullMonth.slice(0, 4)}-01-01`;
    label = `Jan–${monthName(lastFullMonth)} ${lastFullMonth.slice(0, 4)}`;
  } else if (/^\d{4}$/.test(period)) {
    start = `${period}-01-01`;
    curEnd = `${Number(period) + 1}-01-01` < end ? `${Number(period) + 1}-01-01` : end;
    label = curEnd === end && !dataThrough.startsWith(`${Number(period) + 1}`) ? `${period} (to ${monthName(lastFullMonth)})` : period;
  } else {
    const n = Number(period.replace("m", ""));
    start = addMonths(end, -n);
    label = `${monthName(start)} ${start.slice(0, 4)} – ${monthName(lastFullMonth)} ${lastFullMonth.slice(0, 4)}`;
  }
  const months = monthsBetween(start, curEnd);
  const current: Window = { start, end: curEnd, label };
  const previous: Window = { start: addMonths(start, -months), end: start, label: "previous period" };
  const yearAgo: Window = { start: addMonths(start, -12), end: addMonths(curEnd, -12), label: "same period last year" };
  return { current, previous, yearAgo, months };
}

function monthsBetween(a: string, b: string) {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
function monthName(iso: string) {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1];
}
