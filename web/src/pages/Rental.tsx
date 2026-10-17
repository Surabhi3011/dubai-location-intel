import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EChart } from "../charts/EChart";
import { FilterBar } from "../components/FilterBar";
import { ChartCard, DataTable, KpiCard, Note, PageHeader, Skeleton } from "../components/ui";
import { aed, dec1, int, isNum, pct, psf } from "../data/format";
import { useBedroomRents, useCity, useCommunities } from "../data/loaders";
import { median } from "../data/site";
import { useFilters } from "../state/filters";

const SRC_RENT = "Source: Ejari rent contracts (DLD), last 12 months, via datadubai.ae (CC BY 4.0).";
const SRC_YIELD = "Yield = median annual rent ÷ median price within the same property class and bedroom count (datadubai.ae methodology).";
const BED_LABEL: Record<string, string> = { Studio: "Studio", "1 B/R": "1 bed", "2 B/R": "2 beds", "3 B/R": "3 beds", "4 B/R": "4 beds", "5 B/R": "5+ beds" };
const MIN_CONTRACTS = 100;

export default function Rental() {
  const navigate = useNavigate();
  const { filters } = useFilters();
  const { data: city } = useCity();
  const { data: communities } = useCommunities();
  const { data: bedrooms } = useBedroomRents();

  const withRent = useMemo(
    () => (communities ?? []).filter((c) => c.active && isNum(c.rent_median) && c.rent_contracts_12m >= MIN_CONTRACTS),
    [communities],
  );
  const withYield = withRent.filter((c) => isNum(c.yield_pct) && isNum(c.psf_12m));
  const cityBeds = city?.bedrooms ?? [];
  const contracts = cityBeds.reduce((a, b) => a + b.n_rents, 0);
  const bed = (code: string) => cityBeds.find((b) => b.code === code);
  const cityYield = median(withYield.map((c) => c.yield_pct));
  const medPsf = median(withYield.map((c) => c.psf_12m));
  const medYield = cityYield;

  const selected = filters.communities;
  const selectedNames = new Map((communities ?? []).map((c) => [c.community_id, c.community_name]));
  const bedRows = useMemo(
    () => (bedrooms ?? []).filter((b) => b.community_id && selected.includes(b.community_id)),
    [bedrooms, selected],
  );
  const topYield = [...withYield].sort((a, b) => b.yield_pct! - a.yield_pct!).slice(0, 15);

  return (
    <>
      <PageHeader title="Rental & Yield Analyzer" purpose="Where does rent justify the price?" />
      <FilterBar show={["communities"]} />
      <div className="mb-3">
        <Note>
          Rents come from published Ejari aggregates (last 12 months), not row-level contracts. Monthly rent trends, 12-month rent growth and
          new-vs-renewal splits need the row-level Ejari file, which was not reachable for v1. They are planned for the next release.
        </Note>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Rental contracts (12 months)" value={int(contracts)} source={`Residential Ejari contracts across all bedroom counts. ${SRC_RENT}`} />
        <KpiCard label="Median rent · studio" value={aed(bed("Studio")?.rent_median)} deltas={[<span key="s" className="text-muted">≈ {dec1((bed("Studio")?.rent_median ?? 0) / (bed("Studio")?.sqft_median ?? 1))} AED/sqft/yr</span>]} source={`Median annualised rent, studios, Dubai. ${SRC_RENT}`} />
        <KpiCard label="Median rent · 1 bed" value={aed(bed("1 B/R")?.rent_median)} deltas={[<span key="s" className="text-muted">≈ {dec1((bed("1 B/R")?.rent_median ?? 0) / (bed("1 B/R")?.sqft_median ?? 1))} AED/sqft/yr</span>]} source={`Median annualised rent, 1-bedroom homes, Dubai. ${SRC_RENT}`} />
        <KpiCard label="Median rent · 2 beds" value={aed(bed("2 B/R")?.rent_median)} deltas={[<span key="s" className="text-muted">≈ {dec1((bed("2 B/R")?.rent_median ?? 0) / (bed("2 B/R")?.sqft_median ?? 1))} AED/sqft/yr</span>]} source={`Median annualised rent, 2-bedroom homes, Dubai. ${SRC_RENT}`} />
        <KpiCard label="Gross yield · median community" value={pct(cityYield, 2)} deltas={[<span key="n" className="text-muted">across {withYield.length} communities</span>]} source={`Median of community gross yields (communities with ≥ ${MIN_CONTRACTS} contracts). ${SRC_YIELD}`} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Median annual rent by bedrooms" caption={selected.length ? "Dubai vs the selected communities. Bars missing where samples are too small." : "Dubai-wide. Pick communities in the filter to compare."}
          source={SRC_RENT}>
          {cityBeds.length ? (
            <EChart ariaLabel="Bar chart of median rent by bedrooms" option={(t) => {
              const codes = cityBeds.map((b) => b.code);
              const series = [
                { name: "Dubai", data: cityBeds.map((b) => b.rent_median) },
                ...selected.slice(0, 3).map((id) => ({
                  name: selectedNames.get(id) ?? id,
                  data: codes.map((code) => {
                    const rows = bedRows.filter((r) => r.community_id === id && r.bedrooms === code && isNum(r.rent_median) && (r.rent_contracts ?? 0) >= 10);
                    const n = rows.reduce((a, r) => a + (r.rent_contracts ?? 0), 0);
                    return n ? Math.round(rows.reduce((a, r) => a + r.rent_median! * (r.rent_contracts ?? 0), 0) / n) : null;
                  }),
                })),
              ];
              return {
                legend: { show: series.length > 1, data: series.map((s) => s.name) },
                grid: { top: series.length > 1 ? 32 : 12 },
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => aed(v as number) },
                xAxis: { type: "category", data: codes.map((c) => BED_LABEL[c] ?? c) },
                yAxis: { type: "value", axisLabel: { formatter: (v: number) => aed(v, { prefix: false }) } },
                series: series.map((s, i) => ({ type: "bar", name: s.name, data: s.data, itemStyle: { borderRadius: [4, 4, 0, 0], color: [t["series-1"], t["series-2"], t["series-3"], t["series-4"]][i] }, barGap: "10%" })),
              };
            }} />
          ) : <Skeleton height={260} />}
        </ChartCard>

        <ChartCard title="Yield vs price" caption="Each dot is a community. Top-left is the value corner: high yield at a low price per sq ft. Click a dot to analyse it."
          source={`${SRC_YIELD} Price: DLD sales, trailing 12 months. Lines mark the medians.`}
          table={() => <YieldTable rows={withYield} onPick={(id) => navigate(`/site?community=${id}`)} />}>
          {withYield.length ? (
            <EChart height={300} ariaLabel="Scatter of yield vs price per square foot"
              onEvents={{ click: (p) => { const d = (p as { data?: { id?: string } }).data; if (d?.id) navigate(`/site?community=${d.id}`); } }}
              option={(t) => {
                const maxSales = Math.max(...withYield.map((c) => c.sales_12m));
                // Label only the extremes (top yields, priciest) so labels never pile up.
                const labelled = new Set([
                  ...[...withYield].sort((a, b) => b.yield_pct! - a.yield_pct!).slice(0, 3),
                  ...[...withYield].sort((a, b) => b.psf_12m! - a.psf_12m!).slice(0, 2),
                ].map((c) => c.community_name));
                return {
                  grid: { top: 16, right: 24, bottom: 28 },
                  tooltip: { formatter: (p: unknown) => { const d = (p as { data: { name: string; value: number[] } }).data; return `<b>${d.name}</b><br/>${psf(d.value[0])}<br/>Gross yield ${pct(d.value[1], 2)}<br/>${int(d.value[2])} sales (12m)`; } },
                  xAxis: { type: "value", name: "Median AED / sq ft", nameLocation: "middle", nameGap: 24, scale: true },
                  yAxis: { type: "value", name: "Gross yield %", scale: true },
                  series: [{
                    type: "scatter",
                    data: withYield.map((c) => ({ id: c.community_id, name: c.community_name, value: [c.psf_12m, c.yield_pct, c.sales_12m] })),
                    symbolSize: (v: number[]) => 8 + Math.sqrt(v[2] / maxSales) * 22,
                    itemStyle: { color: t["series-1"], opacity: 0.8, borderColor: t["surface-1"], borderWidth: 2 },
                    label: { show: true, formatter: (p) => { const d = p.data as { name: string }; return labelled.has(d.name) ? d.name : ""; }, position: "right", fontSize: 10, color: t["text-secondary"] },
                    markLine: { silent: true, symbol: "none", lineStyle: { color: t.baseline, type: "dashed" }, label: { show: false },
                      data: [{ xAxis: medPsf ?? 0 }, { yAxis: medYield ?? 0 }] },
                  }],
                };
              }} />
          ) : <Skeleton height={300} />}
        </ChartCard>

        <ChartCard title={`Top 15 communities by gross yield`} caption={`Communities with at least ${MIN_CONTRACTS} rent contracts and 10 sales in 12 months.`} source={`${SRC_YIELD} ${SRC_RENT}`}>
          {topYield.length ? (
            <EChart height={380} ariaLabel="Bar chart of top communities by yield"
              onEvents={{ click: (p) => { const c = topYield[(p as { dataIndex: number }).dataIndex]; if (c) navigate(`/site?community=${c.community_id}`); } }}
              option={(t) => ({
                grid: { top: 4, right: 50 },
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => pct(v as number, 2) },
                xAxis: { type: "value", axisLabel: { formatter: "{value}%" } },
                yAxis: { type: "category", inverse: true, data: topYield.map((c) => c.community_name) },
                series: [{ type: "bar", data: topYield.map((c) => c.yield_pct), barWidth: "60%", itemStyle: { color: t["series-1"], borderRadius: [0, 4, 4, 0] },
                  label: { show: true, position: "right", color: t["text-secondary"], fontSize: 11, formatter: (p) => pct(p.value as number, 2) } }],
              })} />
          ) : <Skeleton height={380} />}
        </ChartCard>

        <ChartCard title="Rent-to-price table" caption="Sort any column. Price-to-rent = years of median rent to pay the median price." source={`${SRC_RENT} Prices: DLD sales.`}>
          <div className="max-h-[380px] overflow-auto">
            <YieldTable rows={withRent} onPick={(id) => navigate(`/site?community=${id}`)} />
          </div>
        </ChartCard>
      </div>

      {selected.length > 0 && (
        <div className="mt-3">
          <ChartCard title="Bedroom detail for selected communities" caption="Rents, prices and yields by bedroom count, by marketing community." source={`${SRC_RENT} ${SRC_YIELD}`}>
            <div className="max-h-96 overflow-auto">
              <DataTable rows={bedRows} rowKey={(r) => `${r.marketing_community}-${r.bedrooms}`} columns={[
                { key: "m", label: "Community", render: (r) => r.marketing_community },
                { key: "b", label: "Bedrooms", render: (r) => BED_LABEL[r.bedrooms] ?? r.bedrooms },
                { key: "r", label: "Median rent", align: "right", render: (r) => aed(r.rent_median), sort: (r) => r.rent_median },
                { key: "c", label: "Contracts", align: "right", render: (r) => int(r.rent_contracts), sort: (r) => r.rent_contracts },
                { key: "p", label: "Median price", align: "right", render: (r) => aed(r.price_median), sort: (r) => r.price_median },
                { key: "y", label: "Yield", align: "right", render: (r) => pct(r.yield_pct, 2), sort: (r) => r.yield_pct },
              ]} />
            </div>
          </ChartCard>
        </div>
      )}
    </>
  );
}

function YieldTable({ rows, onPick }: { rows: NonNullable<ReturnType<typeof useCommunities>["data"]>; onPick: (id: string) => void }) {
  return (
    <DataTable rows={rows} rowKey={(r) => r.community_id} onRowClick={(r) => onPick(r.community_id)} columns={[
      { key: "n", label: "Community", render: (r) => r.community_name, sort: (r) => r.community_name },
      { key: "p", label: "Median price", align: "right", render: (r) => aed(r.price_12m), sort: (r) => r.price_12m },
      { key: "r", label: "Median rent", align: "right", render: (r) => aed(r.rent_median), sort: (r) => r.rent_median },
      { key: "y", label: "Yield", align: "right", render: (r) => pct(r.yield_pct, 2), sort: (r) => r.yield_pct },
      { key: "pr", label: "Price-to-rent", align: "right", render: (r) => (isNum(r.price_12m) && isNum(r.rent_median) ? `${(r.price_12m / r.rent_median).toFixed(1)} yrs` : "—"),
        sort: (r) => (isNum(r.price_12m) && isNum(r.rent_median) ? r.price_12m / r.rent_median : null) },
      { key: "c", label: "Contracts", align: "right", render: (r) => int(r.rent_contracts_12m), sort: (r) => r.rent_contracts_12m },
    ]} />
  );
}
