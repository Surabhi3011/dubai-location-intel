import type { PickingInfo } from "@deck.gl/core";
import { ScatterplotLayer } from "@deck.gl/layers";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EChart } from "../charts/EChart";
import { seriesColors, useTokens } from "../charts/theme";
import { ChartCard, DataTable, KpiCard, Note, PageHeader, Skeleton } from "../components/ui";
import { aed, dateLabel, int, isNum, pct } from "../data/format";
import { useBuildInfo, useCommunities, useDevelopers, useProjects } from "../data/loaders";
import type { Project } from "../data/types";
import { hexToRgba } from "../map/colors";
import { MapView } from "../map/MapView";

const SRC = "Source: DLD project register via datadubai.ae (CC BY 4.0). Covers ~770 projects with registered sales; the full register is larger, so totals are a lower bound.";

export default function Supply() {
  const t = useTokens();
  const navigate = useNavigate();
  const { data: info } = useBuildInfo();
  const { data: projects } = useProjects();
  const { data: developers } = useDevelopers();
  const { data: communities } = useCommunities();
  const asOf = info?.data_through ?? "2026-10-05";
  const byId = useMemo(() => new Map((communities ?? []).map((c) => [c.community_id, c])), [communities]);

  const active = useMemo(() => (projects ?? []).filter((p) => p.status === "Active"), [projects]);
  const addMonths = (n: number) => { const d = new Date(asOf); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
  const due = (months: number) => active.filter((p) => p.completion_date && p.completion_date >= asOf && p.completion_date <= addMonths(months))
    .reduce((a, p) => a + (p.total_units ?? 0), 0);
  const delayed = active.filter((p) => p.completion_date && p.completion_date < asOf && (p.completion_pct ?? 0) < 100);
  const avgCompletion = active.length ? active.reduce((a, p) => a + (p.completion_pct ?? 0), 0) / active.length : null;

  // Units completing by year, top 5 communities + other (plan §7 page 4).
  const byYear = useMemo(() => {
    const all = (projects ?? []).filter((p) => p.status !== "Cancelled" && p.completion_date && p.total_units);
    const unitsByComm = new Map<string, number>();
    for (const p of active) unitsByComm.set(p.community_id ?? "?", (unitsByComm.get(p.community_id ?? "?") ?? 0) + (p.total_units ?? 0));
    const top = [...unitsByComm.entries()].filter(([id]) => id !== "?").sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    const years = Array.from(new Set(all.map((p) => p.completion_date!.slice(0, 4)))).filter((y) => y >= "2020").sort();
    const groups = [...top, "other"];
    const data = groups.map((g) => years.map((y) => all.filter((p) => p.completion_date!.startsWith(y) && (g === "other" ? !top.includes(p.community_id ?? "?") : p.community_id === g))
      .reduce((a, p) => a + (p.total_units ?? 0), 0)));
    return { years, groups, data, top };
  }, [projects, active]);

  const pressure = useMemo(() => (communities ?? []).filter((c) => c.active && isNum(c.supply_pressure) && c.units_next_24m > 0)
    .sort((a, b) => b.supply_pressure! - a.supply_pressure!).slice(0, 15), [communities]);

  const league = useMemo(() => {
    const per = new Map<string, Project[]>();
    for (const p of projects ?? []) if (p.developer_slug) per.set(p.developer_slug, [...(per.get(p.developer_slug) ?? []), p]);
    return (developers ?? []).map((d) => {
      const ps = per.get(d.slug) ?? [];
      const units = ps.reduce((a, p) => a + (p.total_units ?? 0), 0);
      const delivered = ps.filter((p) => p.status === "Finished").reduce((a, p) => a + (p.total_units ?? 0), 0);
      const act = ps.filter((p) => p.status === "Active");
      return {
        ...d,
        pct_delivered: units ? (delivered / units) * 100 : null,
        avg_completion: act.length ? act.reduce((a, p) => a + (p.completion_pct ?? 0), 0) / act.length : null,
        delayed: act.filter((p) => p.completion_date && p.completion_date < asOf && (p.completion_pct ?? 0) < 100).length,
        sales_value: ps.reduce((a, p) => a + (p.sales_n ?? 0) * (p.price_median ?? 0), 0),
      };
    }).sort((a, b) => b.units - a.units);
  }, [developers, projects, asOf]);

  const absorption = useMemo(() => active.filter((p) => p.total_units && p.total_units >= 50 && p.sales_n)
    .map((p) => ({ ...p, absorption: Math.min(100, ((p.sales_n ?? 0) / p.total_units!) * 100) })), [active]);

  const colors = seriesColors(t);
  const mapped = active.filter((p) => isNum(p.lat) && isNum(p.lng));
  const unmappedByComm = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of active) if (!isNum(p.lat) && p.community_id) m.set(p.community_id, (m.get(p.community_id) ?? 0) + (p.total_units ?? 0));
    return [...m.entries()].map(([id, units]) => ({ id, units, c: byId.get(id) })).filter((x) => x.c);
  }, [active, byId]);
  const maxUnits = Math.max(1, ...unmappedByComm.map((x) => x.units), ...mapped.map((p) => p.total_units ?? 0));
  const layers = [
    new ScatterplotLayer({
      id: "pipeline-communities",
      data: unmappedByComm,
      getPosition: (d) => [d.c!.centroid_lon, d.c!.centroid_lat],
      getRadius: (d) => 4 + Math.sqrt(d.units / maxUnits) * 34,
      radiusUnits: "pixels",
      getFillColor: hexToRgba(t["series-1"], 70),
      getLineColor: hexToRgba(t["series-1"], 220),
      stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.5,
      pickable: true,
      updateTriggers: { getFillColor: [t.dark], getLineColor: [t.dark] },
    }),
    new ScatterplotLayer({
      id: "pipeline-projects",
      data: mapped,
      getPosition: (p: Project) => [p.lng!, p.lat!],
      getRadius: (p: Project) => 4 + Math.sqrt((p.total_units ?? 0) / maxUnits) * 34,
      radiusUnits: "pixels",
      getFillColor: (p: Project) => hexToRgba(p.completion_date && p.completion_date < asOf ? t["status-critical"] : t["series-2"], 210),
      getLineColor: hexToRgba(t["surface-1"]), stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.5,
      pickable: true,
      updateTriggers: { getFillColor: [t.dark], getLineColor: [t.dark] },
    }),
  ];
  const getTooltip = (info: PickingInfo) => {
    const o = info.object as (Project & { units?: number; c?: { community_name: string } }) | undefined;
    if (!o) return null;
    if (info.layer?.id === "pipeline-communities") return `<b>${o.c?.community_name}</b><br/>${int(o.units)} units in active projects without a mapped location`;
    return `<b>${o.name}</b><br/>${o.developer}<br/>${int(o.total_units)} units · ${pct(o.completion_pct, 0)} built<br/>Due ${o.completion_date ? dateLabel(o.completion_date) : "—"}`;
  };

  return (
    <>
      <PageHeader title="Supply Pipeline & Developer Tracker" purpose="What supply is coming, and who delivers?" />
      <div className="mb-3"><Note>{SRC}</Note></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Projects under construction" value={int(active.length)} source={`Projects with status Active. ${SRC}`} />
        <KpiCard label="Units under construction" value={int(active.reduce((a, p) => a + (p.total_units ?? 0), 0))} source={`Sum of units in active projects. ${SRC}`} />
        <KpiCard label="Units due · next 12 months" value={int(due(12))} source="Units in active projects with a stated completion date in the next 12 months." />
        <KpiCard label="Units due · next 24 months" value={int(due(24))} source="Units in active projects with a stated completion date in the next 24 months." />
        <KpiCard label="Average construction progress" value={pct(avgCompletion, 0)} source="Mean construction completion % of active projects (DLD inspection progress)." />
        <KpiCard label="Projects past completion date" value={int(delayed.length)} source="Active projects whose stated completion date has passed with progress below 100%." />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Units completing by year" caption="Stated completion dates, top five pipeline communities and the rest. Past years are delivered; future years are scheduled."
          source={SRC}>
          {byYear.years.length ? (
            <EChart height={300} ariaLabel="Stacked bar chart of units completing by year" option={() => ({
              legend: { show: true, data: byYear.groups.map((g) => (g === "other" ? "Other communities" : byId.get(g)?.community_name ?? g)), itemGap: 12 },
              grid: { top: 56 },
              tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => int(v as number) },
              xAxis: { type: "category", data: byYear.years },
              yAxis: { type: "value" },
              series: byYear.groups.map((g, i) => ({
                type: "bar", stack: "u", name: g === "other" ? "Other communities" : byId.get(g)?.community_name ?? g,
                data: byYear.data[i], itemStyle: { color: colors[i], borderColor: t["surface-1"], borderWidth: 1 }, barWidth: "55%",
              })),
            })} />
          ) : <Skeleton height={300} />}
        </ChartCard>

        <ChartCard title="Where the pipeline is" caption="Orange dots: active projects with a registered location (red if past their completion date). Blue circles: other active units, placed at their community."
          source={SRC}>
          <div className="card overflow-hidden">
            <MapView className="h-[300px]" layers={layers} getTooltip={getTooltip} cooperative />
          </div>
        </ChartCard>

        <ChartCard title="Supply pressure by community" caption="Units due in 24 months ÷ sales in the last 12 months. Above 1 means more homes are coming than currently trade in a year."
          source={`${SRC} Proxy: the DLD units register (existing stock) was not reachable for v1.`}>
          {pressure.length ? (
            <EChart height={380} ariaLabel="Bar chart of supply pressure"
              onEvents={{ click: (p) => { const c = pressure[(p as { dataIndex: number }).dataIndex]; if (c) navigate(`/site?community=${c.community_id}`); } }}
              option={(tk) => ({
                grid: { top: 4, right: 50 },
                tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: unknown) => {
                  const p = (ps as { dataIndex: number }[])[0]; const c = pressure[p.dataIndex];
                  return `<b>${c.community_name}</b><br/>Ratio ${c.supply_pressure?.toFixed(2)}<br/>${int(c.units_next_24m)} units due · ${int(c.sales_12m)} sales (12m)`; } },
                xAxis: { type: "value" },
                yAxis: { type: "category", inverse: true, data: pressure.map((c) => c.community_name) },
                series: [{ type: "bar", data: pressure.map((c) => c.supply_pressure), barWidth: "60%", itemStyle: { color: tk["series-1"], borderRadius: [0, 4, 4, 0] },
                  label: { show: true, position: "right", fontSize: 11, color: tk["text-secondary"], formatter: (p) => (p.value as number).toFixed(2) },
                  markLine: { silent: true, symbol: "none", data: [{ xAxis: 1 }], lineStyle: { color: tk.baseline, type: "dashed" }, label: { formatter: "1.0", color: tk["text-muted"] } } }],
              })} />
          ) : <Skeleton height={380} />}
        </ChartCard>

        <ChartCard title="Off-plan absorption by project" caption="Registered sales ÷ total units, active projects with 50+ units. Low absorption late in construction is a risk signal."
          source={`${SRC} Sales counts include resales, so values are capped at 100%.`}>
          <div className="max-h-[380px] overflow-auto">
            <DataTable rows={absorption} rowKey={(r) => String(r.project_id)} maxRows={200} columns={[
              { key: "n", label: "Project", render: (r) => r.name, sort: (r) => r.name },
              { key: "c", label: "Community", render: (r) => (r.community_id ? byId.get(r.community_id)?.community_name ?? "—" : "—") },
              { key: "u", label: "Units", align: "right", render: (r) => int(r.total_units), sort: (r) => r.total_units },
              { key: "a", label: "Absorbed", align: "right", render: (r) => pct(r.absorption, 0), sort: (r) => r.absorption },
              { key: "b", label: "Built", align: "right", render: (r) => pct(r.completion_pct, 0), sort: (r) => r.completion_pct },
            ]} />
          </div>
        </ChartCard>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Developer league table" caption="Projects and units in the register, share of units delivered, progress of active projects and approximate sales value."
          source={`${SRC} Sales value ≈ registered sales × median price per project.`}>
          <div className="max-h-[420px] overflow-auto">
            <DataTable rows={league} rowKey={(r) => r.slug} maxRows={100} columns={[
              { key: "n", label: "Developer", render: (r) => r.name, sort: (r) => r.name },
              { key: "p", label: "Projects", align: "right", render: (r) => int(r.n_projects), sort: (r) => r.n_projects },
              { key: "u", label: "Units", align: "right", render: (r) => int(r.units), sort: (r) => r.units },
              { key: "d", label: "Delivered", align: "right", render: (r) => pct(r.pct_delivered, 0), sort: (r) => r.pct_delivered },
              { key: "c", label: "Avg progress", align: "right", render: (r) => pct(r.avg_completion, 0), sort: (r) => r.avg_completion },
              { key: "v", label: "Sales value", align: "right", render: (r) => aed(r.sales_value), sort: (r) => r.sales_value },
              { key: "l", label: "Delayed", align: "right", render: (r) => int(r.delayed), sort: (r) => r.delayed },
            ]} />
          </div>
        </ChartCard>

        <ChartCard title="Delayed projects" caption="Active projects past their stated completion date and not yet complete."
          source={`${SRC} Completion dates can be extended by DLD; check the register before relying on this list.`}>
          <div className="max-h-[420px] overflow-auto">
            <DataTable rows={delayed} rowKey={(r) => String(r.project_id)} columns={[
              { key: "n", label: "Project", render: (r) => r.name, sort: (r) => r.name },
              { key: "d", label: "Developer", render: (r) => <span className="text-ink-2">{r.developer}</span> },
              { key: "u", label: "Units", align: "right", render: (r) => int(r.total_units), sort: (r) => r.total_units },
              { key: "b", label: "Built", align: "right", render: (r) => pct(r.completion_pct, 0), sort: (r) => r.completion_pct },
              { key: "c", label: "Was due", align: "right", render: (r) => (r.completion_date ? dateLabel(r.completion_date) : "—"), sort: (r) => r.completion_date },
            ]} />
          </div>
        </ChartCard>
      </div>
    </>
  );
}
