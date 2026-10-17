import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EChart } from "../charts/EChart";
import { Badge, ChartCard, DataTable, Note, PageHeader, Select } from "../components/ui";
import { aed, download, int, isNum, km, pct, signedPct, toCsv } from "../data/format";
import { useBuildInfo, useCommunities } from "../data/loaders";
import type { Community } from "../data/types";

const BUDGETS = [
  { value: "all", label: "Any budget", min: 0, max: Infinity },
  { value: "lt1", label: "Median < AED 1M", min: 0, max: 1e6 },
  { value: "1-2", label: "AED 1–2M", min: 1e6, max: 2e6 },
  { value: "2-3", label: "AED 2–3M", min: 2e6, max: 3e6 },
  { value: "3-5", label: "AED 3–5M", min: 3e6, max: 5e6 },
  { value: "5+", label: "AED 5M+", min: 5e6, max: Infinity },
];
const TYPES = [{ value: "all", label: "Any type" }, { value: "apartment", label: "Apartment market" }, { value: "villa", label: "Villa market" }];
const MARKETS = [{ value: "all", label: "Off-plan or ready" }, { value: "offplan", label: "Mostly off-plan (> 50%)" }, { value: "ready", label: "Mostly ready (≥ 50%)" }];
const YIELDS = ["0", "5", "6", "7", "8"].map((v) => ({ value: v, label: v === "0" ? "Any yield" : `Yield ≥ ${v}%` }));
const PRESSURES = [{ value: "any", label: "Any supply pressure" }, { value: "1", label: "Pressure ≤ 1.0" }, { value: "0.5", label: "Pressure ≤ 0.5" }];
const METRO = [{ value: "any", label: "Any metro distance" }, { value: "1000", label: "Metro ≤ 1 km" }, { value: "2000", label: "Metro ≤ 2 km" }, { value: "5000", label: "Metro ≤ 5 km" }];

function cautions(c: Community): { tone: "warning" | "critical" | "neutral"; label: string }[] {
  const out: { tone: "warning" | "critical" | "neutral"; label: string }[] = [];
  if (c.limited_data || c.sales_12m < 50) out.push({ tone: "neutral", label: "Low data" });
  if (isNum(c.supply_pressure) && c.supply_pressure > 1) out.push({ tone: "warning", label: "High supply pressure" });
  if (isNum(c.psf_change_3m) && c.psf_change_3m < -5) out.push({ tone: "warning", label: "Prices falling (3m)" });
  return out;
}

export default function Screener() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: info } = useBuildInfo();
  const { data: communities } = useCommunities();
  const get = (k: string, d: string) => params.get(k) ?? d;
  const set = (k: string, v: string, d: string) => setParams((p) => { const n = new URLSearchParams(p); if (v === d) n.delete(k); else n.set(k, v); return n; }, { replace: true });

  const budget = get("budget", "all");
  const type = get("ptype", "all");
  const market = get("mkt", "all");
  const minYield = get("yield", "0");
  const maxPressure = get("pressure", "any");
  const maxMetro = get("metro", "any");

  const results = useMemo(() => {
    const b = BUDGETS.find((x) => x.value === budget)!;
    return (communities ?? [])
      .filter((c) => c.active && isNum(c.price_12m))
      .filter((c) => c.price_12m! >= b.min && c.price_12m! < b.max)
      .filter((c) => type === "all" || (type === "apartment" ? isNum(c.psf_apartment_12m) : isNum(c.psf_villa_12m)))
      .filter((c) => market === "all" || (market === "offplan" ? (c.offplan_share_12m ?? 0) > 50 : (c.offplan_share_12m ?? 100) <= 50))
      .filter((c) => minYield === "0" || (isNum(c.yield_pct) && c.yield_pct >= Number(minYield)))
      .filter((c) => maxPressure === "any" || (isNum(c.supply_pressure) && c.supply_pressure <= Number(maxPressure)))
      .filter((c) => maxMetro === "any" || (isNum(c.metro_dist_m) && c.metro_dist_m <= Number(maxMetro)))
      .sort((a, b) => (b.location_score ?? 0) - (a.location_score ?? 0));
  }, [communities, budget, type, market, minYield, maxPressure, maxMetro]);

  const exportCsv = () => download(`dubai-shortlist-${info?.data_through ?? "latest"}.csv`, toCsv(results.map((c, i) => ({
    rank: i + 1, community: c.community_name, community_id: c.community_id, location_score: c.location_score,
    median_price_aed: c.price_12m, median_psf_aed: c.psf_12m, median_rent_aed: c.rent_median, gross_yield_pct: c.yield_pct,
    price_change_12m_pct: c.psf_change_12m, supply_pressure: c.supply_pressure, metro_distance_m: c.metro_dist_m,
    sales_12m: c.sales_12m, cautions: cautions(c).map((x) => x.label).join("; "), data_through: info?.data_through,
  }))));

  const quad = results.filter((c) => isNum(c.yield_pct) && isNum(c.psf_change_12m));

  return (
    <>
      <PageHeader title="Investment Screener" purpose="Shortlist communities that match your criteria.">
        <button type="button" onClick={exportCsv} disabled={!results.length} className="focus-ring rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
          Export shortlist (CSV)
        </button>
      </PageHeader>

      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line bg-page px-4 py-2 sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Screening criteria">
          <Select label="Budget" value={budget} onChange={(v) => set("budget", v, "all")} options={BUDGETS} />
          <Select label="Property type" value={type} onChange={(v) => set("ptype", v, "all")} options={TYPES} />
          <Select label="Market" value={market} onChange={(v) => set("mkt", v, "all")} options={MARKETS} />
          <Select label="Minimum yield" value={minYield} onChange={(v) => set("yield", v, "0")} options={YIELDS} />
          <Select label="Maximum supply pressure" value={maxPressure} onChange={(v) => set("pressure", v, "any")} options={PRESSURES} />
          <Select label="Maximum metro distance" value={maxMetro} onChange={(v) => set("metro", v, "any")} options={METRO} />
        </div>
      </div>

      <p className="mb-3 text-sm text-ink-2"><b className="text-ink">{results.length}</b> of {(communities ?? []).filter((c) => c.active).length} active communities match. Ranked by Location Score.</p>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard title="Ranked results" caption="Click a row to open it in the Site Analyst. Bedroom-level screening uses the Rental page's bedroom table."
          source="Prices and momentum: DLD sales (12 months). Rent and yield: Ejari aggregates via datadubai.ae. Supply: DLD project register. Metro: OpenStreetMap.">
          {results.length ? (
            <div className="max-h-[560px] overflow-auto">
              <DataTable rows={results} rowKey={(r) => r.community_id} onRowClick={(r) => navigate(`/site?community=${r.community_id}`)} columns={[
                { key: "n", label: "Community", render: (r) => (
                  <div><div className="text-ink">{r.community_name}</div><div className="mt-0.5 flex flex-wrap gap-1">{cautions(r).map((x) => <Badge key={x.label} tone={x.tone}>{x.label}</Badge>)}</div></div>
                ), sort: (r) => r.community_name },
                { key: "s", label: "Score", align: "right", render: (r) => int(r.location_score), sort: (r) => r.location_score },
                { key: "p", label: "Median price", align: "right", render: (r) => aed(r.price_12m), sort: (r) => r.price_12m },
                { key: "r", label: "Rent", align: "right", render: (r) => aed(r.rent_median), sort: (r) => r.rent_median },
                { key: "y", label: "Yield", align: "right", render: (r) => pct(r.yield_pct, 2), sort: (r) => r.yield_pct },
                { key: "c", label: "12m change", align: "right", render: (r) => signedPct(r.psf_change_12m), sort: (r) => r.psf_change_12m },
                { key: "sp", label: "Supply", align: "right", render: (r) => (isNum(r.supply_pressure) ? r.supply_pressure.toFixed(2) : "—"), sort: (r) => r.supply_pressure },
                { key: "m", label: "Metro", align: "right", render: (r) => km(r.metro_dist_m), sort: (r) => r.metro_dist_m },
              ]} />
            </div>
          ) : <Note>No communities match all criteria. Loosen a filter.</Note>}
        </ChartCard>

        <ChartCard title="Value–momentum quadrant" caption="Right = higher yield; up = stronger 12-month price growth. Bubble size = sales volume. Top-right combines income and growth."
          source="Yield: Ejari aggregates via datadubai.ae. Price change: DLD sales, 12 months vs prior 12.">
          {quad.length ? (
            <EChart height={420} ariaLabel="Scatter of yield vs 12-month price change"
              onEvents={{ click: (p) => { const d = (p as { data?: { id?: string } }).data; if (d?.id) navigate(`/site?community=${d.id}`); } }}
              option={(t) => {
                const maxSales = Math.max(...quad.map((c) => c.sales_12m));
                return {
                  grid: { top: 16, right: 24, bottom: 28 },
                  tooltip: { formatter: (p: unknown) => { const d = (p as { data: { name: string; value: number[] } }).data; return `<b>${d.name}</b><br/>Yield ${pct(d.value[0], 2)}<br/>12m change ${signedPct(d.value[1])}<br/>${int(d.value[2])} sales`; } },
                  xAxis: { type: "value", name: "Gross yield %", nameLocation: "middle", nameGap: 24, scale: true },
                  yAxis: { type: "value", name: "12m price change %", scale: true },
                  series: [{
                    type: "scatter",
                    data: quad.map((c) => ({ id: c.community_id, name: c.community_name, value: [c.yield_pct, c.psf_change_12m, c.sales_12m] })),
                    symbolSize: (v: number[]) => 8 + Math.sqrt(v[2] / maxSales) * 26,
                    itemStyle: { color: t["series-1"], opacity: 0.8, borderColor: t["surface-1"], borderWidth: 2 },
                    label: { show: quad.length <= 25, position: "right", fontSize: 10, color: t["text-secondary"], formatter: (p) => (p.data as { name: string }).name },
                    markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: t.baseline, type: "dashed" }, data: [{ yAxis: 0 }] },
                  }],
                };
              }} />
          ) : <Note>No matching communities have both yield and price-change data.</Note>}
        </ChartCard>
      </div>
      <p className="mt-3 text-xs text-muted">
        Caution flags: <b>Low data</b> = fewer than 50 sales or a missing score component; <b>High supply pressure</b> = more units due in 24 months than sold in the last 12;
        <b> Prices falling</b> = median price per sq ft down more than 5% over 3 months. A falling-rents flag needs a rent time series (planned).
        Informational only — not investment advice.
      </p>
    </>
  );
}
