import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EChart } from "../charts/EChart";
import { seqRamp } from "../charts/theme";
import { FilterBar } from "../components/FilterBar";
import { ChartCard, DataTable, Delta, KpiCard, Note, PageHeader, Skeleton } from "../components/ui";
import { filterWhere, inWindow, useSql } from "../data/duckdb";
import { aed, dateLabel, int, isNum, monthLabel, pct, psf } from "../data/format";
import { useBuildInfo, useCity, useCommunityIndex } from "../data/loaders";
import type { Nullable } from "../data/types";
import { isDefault, periodWindows, useFilters } from "../state/filters";

const SRC_SALES = "Source: DLD registered sales (residential), via dubairealestatedata.com, CC BY 4.0.";
const BAND_ORDER = ["<1M", "1-2M", "2-3M", "3-5M", "5M+"];

interface Kpis { sales: number; value_aed: number; psf: Nullable<number>; offplan_share: Nullable<number>; active: number }
interface MonthRow {
  month: string; sales: number; value_aed: number; sales_offplan: number; sales_ready: number;
  psf: Nullable<number>; psf_apartment: Nullable<number>; psf_villa: Nullable<number>; psf_index?: Nullable<number>; partial?: boolean;
}

const change = (a: Nullable<number> | undefined, b: Nullable<number> | undefined) =>
  isNum(a) && isNum(b) && b !== 0 ? (a / b - 1) * 100 : null;

export default function MarketPulse() {
  const { filters } = useFilters();
  const { data: info } = useBuildInfo();
  const { data: city } = useCity();
  const { data: index } = useCommunityIndex();
  const navigate = useNavigate();

  const useJson = isDefault(filters);
  const trendsFromJson = isDefault(filters, true);
  const win = info ? periodWindows(filters.period, info.last_full_month, info.data_through) : null;
  const where = filterWhere(filters);
  const and = where ? `${where} and` : "where";

  const kpiSql = !useJson && win
    ? `with t as (
         select *, case when ${inWindow(win.current)} then 'cur' when ${inWindow(win.previous)} then 'prev'
                        when ${inWindow(win.yearAgo)} then 'yoy' end as w
         from sales ${where}),
       k as (
         select w, count(*) sales, sum(price)::double value_aed, median(psf) psf,
                avg(case when market='offplan' then 100.0 else 0 end) offplan_share
         from t where w is not null group by w),
       a as (
         select w, count(*) active from (
           select w, community_id from t where w is not null group by w, community_id having count(*) >= 10
         ) group by w)
       select k.*, coalesce(a.active, 0) active from k left join a using (w)`
    : null;
  const kpiQ = useSql<Kpis & { w: string }>(["kpi"], kpiSql);

  const monthlySql = !trendsFromJson
    ? `select strftime(date_trunc('month', date), '%Y-%m') as month, count(*) sales, sum(price)::double value_aed,
         count(*) filter (where market='offplan') sales_offplan, count(*) filter (where market='ready') sales_ready,
         median(psf) psf, median(psf) filter (where ptype='apartment') psf_apartment, median(psf) filter (where ptype='villa') psf_villa
       from sales ${where} group by 1 order by 1`
    : null;
  const monthlyQ = useSql<MonthRow>(["monthly"], monthlySql);

  const windowSql = !useJson && win
    ? {
        bands: `select price_band, count(*) sales from sales ${and} ${inWindow(win.current)} and price is not null group by 1`,
        top: `select community_id, count(*) sales, sum(price)::double value_aed from sales ${and} ${inWindow(win.current)} group by 1`,
      }
    : null;
  const bandsQ = useSql<{ price_band: string; sales: number }>(["bands"], windowSql?.bands ?? null);
  const topQ = useSql<{ community_id: string; sales: number; value_aed: number }>(["top"], windowSql?.top ?? null);

  const dailySql = !useJson && info
    ? `select strftime(date, '%Y-%m-%d') as date, count(*) sales from sales ${and} date > date '${info.data_through}' - interval 1 year group by 1 order by 1`
    : null;
  const dailyQ = useSql<{ date: string; sales: number }>(["daily"], dailySql);

  // ---------- resolve data for the current view ----------
  const kpis = useMemo(() => {
    if (useJson && city) {
      const k = city.kpis;
      const cur: Kpis = { sales: k.sales.value!, value_aed: k.value_aed.value!, psf: k.psf.value, offplan_share: k.offplan_share.value, active: k.active_communities.value! };
      const prev: Kpis = { sales: k.sales.prev!, value_aed: k.value_aed.prev!, psf: k.psf.prev, offplan_share: k.offplan_share.prev, active: k.active_communities.prev! };
      return { cur, prev, yoy: null as Kpis | null };
    }
    if (!kpiQ.data) return null;
    const by = Object.fromEntries(kpiQ.data.map((r) => [r.w, r]));
    return { cur: by.cur ?? null, prev: by.prev ?? null, yoy: win && win.months === 12 ? null : by.yoy ?? null };
  }, [useJson, city, kpiQ.data, win]);

  const detailStart = info?.detail_start.slice(0, 7) ?? "2021-10";
  const monthly: MonthRow[] = useMemo(() => {
    const rows = trendsFromJson ? city?.monthly ?? [] : monthlyQ.data ?? [];
    return rows.filter((r) => r.month >= detailStart);
  }, [trendsFromJson, city, monthlyQ.data, detailStart]);

  const bands = useMemo(() => {
    const rows = useJson ? city?.price_bands : bandsQ.data;
    const m = new Map((rows ?? []).map((r) => [r.price_band, r.sales]));
    return BAND_ORDER.map((b) => ({ band: b, sales: m.get(b) ?? 0 }));
  }, [useJson, city, bandsQ.data]);

  const top = useMemo(() => {
    const rows = useJson ? city?.top_by_value : topQ.data;
    return (rows ?? []).map((r) => ({ ...r, community_name: index?.get(r.community_id)?.community_name ?? r.community_id }));
  }, [useJson, city, topQ.data, index]);
  const topValue = [...top].sort((a, b) => b.value_aed - a.value_aed).slice(0, 10);
  const topSales = useJson && city
    ? city.top_by_sales.map((r) => ({ ...r, community_name: index?.get(r.community_id)?.community_name ?? r.community_id }))
    : [...top].sort((a, b) => b.sales - a.sales).slice(0, 10);
  const daily = useJson ? city?.daily ?? [] : dailyQ.data ?? [];

  const queryError = kpiQ.error ?? monthlyQ.error ?? bandsQ.error ?? topQ.error ?? dailyQ.error;
  const periodLabel = win?.current.label ?? "";
  const vsPrev = win?.months === 12 ? "vs prior 12 months" : "vs previous period";
  const loadingKpi = !useJson && kpiQ.isFetching;
  const deltaRow = (cur: Nullable<number> | undefined, prev: Nullable<number> | undefined, yoy: Nullable<number> | undefined) => [
    <Delta key="p" value={change(cur, prev)} label={vsPrev} />,
    ...(kpis?.yoy ? [<Delta key="y" value={change(cur, yoy)} label="vs last year" />] : []),
  ];
  const ppRow = (cur: Nullable<number> | undefined, prev: Nullable<number> | undefined, yoy: Nullable<number> | undefined) => [
    <Delta key="p" unit="pp" neutral value={isNum(cur) && isNum(prev) ? cur - prev : null} label={vsPrev} />,
    ...(kpis?.yoy ? [<Delta key="y" unit="pp" neutral value={isNum(cur) && isNum(yoy) ? cur - yoy : null} label="vs last year" />] : []),
  ];
  const k = kpis;

  return (
    <>
      <PageHeader title="Market Pulse" purpose="What is the Dubai residential market doing right now?" />
      <FilterBar />
      {!useJson && kpiQ.isLoading && (
        <div className="mb-3"><Note>Loading 5 years of transactions into your browser for filtered queries (about 7 MB, once)…</Note></div>
      )}
      {queryError && <div className="mb-3"><Note>Could not run a filtered query: {String(queryError)}</Note></div>}

      <p className="mb-2 text-xs text-muted">Period: {periodLabel}</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total sales value" loading={loadingKpi} value={aed(k?.cur?.value_aed)} deltas={deltaRow(k?.cur?.value_aed, k?.prev?.value_aed, k?.yoy?.value_aed)}
          source="Sum of registered residential sale prices in the period. Source: DLD via dubairealestatedata.com." />
        <KpiCard label="Sales transactions" loading={loadingKpi} value={int(k?.cur?.sales)} deltas={deltaRow(k?.cur?.sales, k?.prev?.sales, k?.yoy?.sales)}
          source="Count of registered residential sales (apartments, villas, townhouses). Source: DLD." />
        <KpiCard label="Median price per sq ft" loading={loadingKpi} value={psf(k?.cur?.psf)} deltas={deltaRow(k?.cur?.psf, k?.prev?.psf, k?.yoy?.psf)}
          source="Median of price ÷ area (sq ft), P1–P99 outliers removed per community-year. Source: DLD." />
        <KpiCard label="Off-plan share of sales" loading={loadingKpi} value={pct(k?.cur?.offplan_share)} deltas={ppRow(k?.cur?.offplan_share, k?.prev?.offplan_share, k?.yoy?.offplan_share)}
          source="Off-plan (pre-registration) sales ÷ all sales. Change shown in percentage points. Source: DLD." />
        <KpiCard label="Active communities" loading={loadingKpi} value={int(k?.cur?.active)} deltas={deltaRow(k?.cur?.active, k?.prev?.active, k?.yoy?.active)}
          source="Dubai Municipality communities with at least 10 sales in the period." />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        The mortgage-to-sales ratio is not shown: the open sales file contains sale registrations only. See About & Data.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Monthly sales value" caption="Total AED registered each month — the money flowing through the market."
          source={`${SRC_SALES} Last month is partial.`}
          table={() => <MonthTable rows={monthly} />}>
          {monthly.length ? (
            <EChart ariaLabel="Bar chart of monthly sales value" option={(t) => ({
              grid: { top: 12 },
              tooltip: { trigger: "axis", valueFormatter: (v) => aed(v as number) },
              xAxis: { type: "category", data: monthly.map((m) => monthLabel(m.month)) },
              yAxis: { type: "value", axisLabel: { formatter: (v: number) => aed(v, { prefix: false }) } },
              series: [{ type: "bar", name: "Sales value", data: monthly.map((m) => ({ value: m.value_aed, itemStyle: { opacity: m.partial ? 0.45 : 1 } })),
                itemStyle: { color: t["series-1"], borderRadius: [4, 4, 0, 0] }, barCategoryGap: "20%" }],
            })} />
          ) : <Skeleton height={260} />}
        </ChartCard>

        <ChartCard title="Monthly transactions" caption="Number of registered sales each month — activity independent of price levels."
          source={`${SRC_SALES} Last month is partial.`}>
          {monthly.length ? (
            <EChart ariaLabel="Bar chart of monthly sales count" option={(t) => ({
              grid: { top: 12 },
              tooltip: { trigger: "axis", valueFormatter: (v) => int(v as number) },
              xAxis: { type: "category", data: monthly.map((m) => monthLabel(m.month)) },
              yAxis: { type: "value" },
              series: [{ type: "bar", name: "Transactions", data: monthly.map((m) => ({ value: m.sales, itemStyle: { opacity: m.partial ? 0.45 : 1 } })),
                itemStyle: { color: t["series-1"], borderRadius: [4, 4, 0, 0] }, barCategoryGap: "20%" }],
            })} />
          ) : <Skeleton height={260} />}
        </ChartCard>

        <ChartCard title="Median price per sq ft: apartments vs villas" caption="Villas and apartments price differently; tracking them apart avoids mix effects."
          source={SRC_SALES}>
          {monthly.length ? (
            <EChart ariaLabel="Line chart of median price per square foot" option={(t) => ({
              legend: { show: true, data: ["Apartments", "Villas / townhouses"] },
              tooltip: { trigger: "axis", valueFormatter: (v) => psf(v as number) },
              xAxis: { type: "category", data: monthly.map((m) => monthLabel(m.month)), boundaryGap: false },
              yAxis: { type: "value", scale: true },
              series: [
                { type: "line", name: "Apartments", data: monthly.map((m) => m.psf_apartment), showSymbol: false, lineStyle: { width: 2 }, color: t["series-1"],
                  endLabel: { show: true, formatter: "Apartments", color: t["text-secondary"], fontSize: 11 } },
                { type: "line", name: "Villas / townhouses", data: monthly.map((m) => m.psf_villa), showSymbol: false, lineStyle: { width: 2 }, color: t["series-2"],
                  endLabel: { show: true, formatter: "Villas", color: t["text-secondary"], fontSize: 11 } },
              ],
              grid: { right: 70 },
            })} />
          ) : <Skeleton height={260} />}
        </ChartCard>

        <ChartCard title="Price index (median AED/sqft, 2020 = 100)"
          caption="Our own index of the citywide median price per sq ft. The official DLD index was not reachable for v1."
          source={`${SRC_SALES} Index = monthly median ÷ 2020 average median × 100.`}>
          {trendsFromJson && city ? (
            <EChart ariaLabel="Line chart of price index" option={(t) => {
              const rows = city.monthly;
              return {
                grid: { top: 12 },
                tooltip: { trigger: "axis", valueFormatter: (v) => (isNum(v) ? (v as number).toFixed(1) : "—") },
                xAxis: { type: "category", data: rows.map((m) => monthLabel(m.month)), boundaryGap: false },
                yAxis: { type: "value", scale: true },
                series: [{ type: "line", name: "Index", data: rows.map((m) => m.psf_index), showSymbol: false, lineStyle: { width: 2 }, color: t["series-1"],
                  markLine: { silent: true, symbol: "none", data: [{ yAxis: 100 }], lineStyle: { color: t.baseline, type: "dashed" }, label: { color: t["text-muted"], formatter: "2020 = 100" } } }],
              };
            }} />
          ) : <div className="flex h-[260px] items-center justify-center text-sm text-muted">The index is citywide; clear the type, bedroom, market, price and community filters to see it.</div>}
        </ChartCard>

        <ChartCard title="Off-plan vs ready sales" caption="How much of the market is buying before completion — a gauge of developer-led demand."
          source={SRC_SALES}>
          {monthly.length ? (
            <EChart ariaLabel="Stacked area chart of off-plan and ready sales" option={(t) => ({
              legend: { show: true, data: ["Off-plan", "Ready"] },
              tooltip: { trigger: "axis", valueFormatter: (v) => int(v as number) },
              xAxis: { type: "category", data: monthly.map((m) => monthLabel(m.month)), boundaryGap: false },
              yAxis: { type: "value" },
              series: [
                { type: "line", name: "Off-plan", stack: "s", areaStyle: { opacity: 0.85 }, data: monthly.map((m) => m.sales_offplan), showSymbol: false, lineStyle: { width: 0 }, color: t["series-1"] },
                { type: "line", name: "Ready", stack: "s", areaStyle: { opacity: 0.85 }, data: monthly.map((m) => m.sales_ready), showSymbol: false, lineStyle: { width: 2, color: t["surface-1"] }, color: t["series-2"] },
              ],
            })} />
          ) : <Skeleton height={260} />}
        </ChartCard>

        <ChartCard title="Sales by price band" caption={`Where buyers are transacting, ${periodLabel}.`} source={SRC_SALES}
          table={() => <DataTable rows={bands} rowKey={(r) => r.band} columns={[
            { key: "b", label: "Price band (AED)", render: (r) => r.band },
            { key: "s", label: "Sales", align: "right", render: (r) => int(r.sales) },
          ]} />}>
          <EChart ariaLabel="Bar chart of sales by price band" option={(t) => ({
            grid: { top: 12 },
            tooltip: { trigger: "axis", valueFormatter: (v) => int(v as number) },
            xAxis: { type: "category", data: bands.map((b) => `AED ${b.band}`) },
            yAxis: { type: "value" },
            series: [{ type: "bar", data: bands.map((b) => b.sales), itemStyle: { color: t["series-1"], borderRadius: [4, 4, 0, 0] }, barWidth: "50%",
              label: { show: true, position: "top", color: t["text-secondary"], fontSize: 11, formatter: (p) => int(p.value as number) } }],
          })} />
        </ChartCard>

        <ChartCard title="Top 10 communities by sales value" caption="Click a bar to open the community in the Site Analyst." source={SRC_SALES}>
          <EChart ariaLabel="Bar chart of top communities by sales value" height={300}
            onEvents={{ click: (p) => { const id = topValue[(p as { dataIndex: number }).dataIndex]?.community_id; if (id) navigate(`/site?community=${id}`); } }}
            option={(t) => ({
              grid: { top: 4, right: 70 },
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => aed(v as number) },
              xAxis: { type: "value", axisLabel: { formatter: (v: number) => aed(v, { prefix: false }) } },
              yAxis: { type: "category", inverse: true, data: topValue.map((r) => r.community_name) },
              series: [{ type: "bar", data: topValue.map((r) => r.value_aed), itemStyle: { color: t["series-1"], borderRadius: [0, 4, 4, 0] }, barWidth: "60%",
                label: { show: true, position: "right", color: t["text-secondary"], fontSize: 11, formatter: (p) => aed(p.value as number) } }],
            })} />
        </ChartCard>

        <ChartCard title="Top 10 communities by number of sales" caption="The busiest communities by deal count, regardless of ticket size." source={SRC_SALES}>
          <EChart ariaLabel="Bar chart of top communities by transactions" height={300}
            onEvents={{ click: (p) => { const id = topSales[(p as { dataIndex: number }).dataIndex]?.community_id; if (id) navigate(`/site?community=${id}`); } }}
            option={(t) => ({
              grid: { top: 4, right: 50 },
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => int(v as number) },
              xAxis: { type: "value" },
              yAxis: { type: "category", inverse: true, data: topSales.map((r) => r.community_name) },
              series: [{ type: "bar", data: topSales.map((r) => r.sales), itemStyle: { color: t["series-1"], borderRadius: [0, 4, 4, 0] }, barWidth: "60%",
                label: { show: true, position: "right", color: t["text-secondary"], fontSize: 11, formatter: (p) => int(p.value as number) } }],
            })} />
        </ChartCard>

        <ChartCard className="lg:col-span-2" title="Daily registered sales, last 12 months"
          caption="Each cell is a day. Darker means more sales registered — spot launches, holidays and month-end peaks."
          source={`${SRC_SALES} Data through ${info ? dateLabel(info.data_through) : ""}.`}>
          {daily.length ? (
            <EChart ariaLabel="Calendar heatmap of daily sales" height={190} option={(t) => {
              const max = Math.max(...daily.map((d) => d.sales));
              return {
                tooltip: { formatter: (p: unknown) => { const v = (p as { value: [string, number] }).value; return `${dateLabel(v[0])}<br/><b>${int(v[1])}</b> sales`; } },
                visualMap: { min: 0, max, show: false, inRange: { color: seqRamp(t) } },
                calendar: {
                  top: 24, left: 36, right: 8, cellSize: ["auto", 16],
                  range: [daily[0].date, daily[daily.length - 1].date],
                  itemStyle: { borderWidth: 2, borderColor: t["surface-1"], color: t["surface-2"] },
                  splitLine: { show: false },
                  dayLabel: { color: t["text-muted"], fontSize: 10, firstDay: 1, nameMap: ["S", "M", "T", "W", "T", "F", "S"] },
                  monthLabel: { color: t["text-muted"], fontSize: 10 },
                  yearLabel: { show: false },
                },
                series: [{ type: "heatmap", coordinateSystem: "calendar", data: daily.map((d) => [d.date, d.sales]) }],
              };
            }} />
          ) : <Skeleton height={190} />}
        </ChartCard>
      </div>
    </>
  );
}

function MonthTable({ rows }: { rows: MonthRow[] }) {
  return (
    <DataTable rows={[...rows].reverse()} rowKey={(r) => r.month} columns={[
      { key: "m", label: "Month", render: (r) => monthLabel(r.month) },
      { key: "v", label: "Value", align: "right", render: (r) => aed(r.value_aed) },
      { key: "s", label: "Sales", align: "right", render: (r) => int(r.sales) },
      { key: "p", label: "Median AED/sqft", align: "right", render: (r) => int(r.psf) },
    ]} />
  );
}
