import { EChart } from "../charts/EChart";
import { aed, int, isNum, km, monthLabel, pct, psf, signedPct } from "../data/format";
import type { Community } from "../data/types";
import { Badge } from "./ui";

export function Sparkline({ points }: { points: [string, number | null][] }) {
  if (!points.length) return null;
  return (
    <EChart height={64} ariaLabel="Price per sq ft trend, last 24 months" option={(t) => ({
      grid: { left: 0, right: 0, top: 4, bottom: 0, containLabel: false },
      tooltip: { trigger: "axis", valueFormatter: (v) => psf(v as number) },
      xAxis: { type: "category", data: points.map((p) => monthLabel(p[0])), show: false, boundaryGap: false },
      yAxis: { type: "value", scale: true, show: false },
      series: [{ type: "line", data: points.map((p) => p[1]), showSymbol: false, lineStyle: { width: 2 }, color: t["series-1"],
        areaStyle: { opacity: 0.08 }, connectNulls: true }],
    })} />
  );
}

function Row({ label, value, rank, total }: { label: string; value: string; rank?: number | null; total?: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
      <span className="text-ink-2">{label}</span>
      <span className="tabular text-right font-medium text-ink">
        {value}
        {isNum(rank) && total ? <span className="ml-1.5 text-xs font-normal text-muted">#{rank} of {total}</span> : null}
      </span>
    </div>
  );
}

export function CommunityCard({ c, activeCount, actions }: { c: Community; activeCount: number; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">{c.community_name}</h2>
          {!c.active && <Badge tone="warning">Fewer than 10 sales in 12 months</Badge>}
          {c.limited_data && c.active && <Badge tone="neutral">Limited data</Badge>}
        </div>
        <p className="text-xs text-muted">
          Sector {c.sector} · {c.land_area_km2.toFixed(1)} km² · DM community {c.community_id}
          {c.aliases?.length ? <> · Includes {c.aliases.slice(0, 3).join(", ")}{c.aliases.length > 3 ? "…" : ""}</> : null}
        </p>
      </div>

      {c.sparkline && c.sparkline.some((p) => p[1] !== null) && (
        <div>
          <div className="text-xs text-ink-2">Median price per sq ft, last 24 months</div>
          <Sparkline points={c.sparkline} />
        </div>
      )}

      <div>
        <Row label="Median price / sq ft" value={psf(c.psf_12m)} rank={c.rank_psf_12m} total={activeCount} />
        <Row label="Median sale price" value={aed(c.price_12m)} />
        <Row label="12-month price change" value={signedPct(c.psf_change_12m)} rank={c.rank_psf_change_12m} total={activeCount} />
        <Row label="Sales (12 months)" value={int(c.sales_12m)} rank={c.rank_sales_12m} total={activeCount} />
        <Row label="Off-plan share" value={pct(c.offplan_share_12m)} />
        <Row label="Median annual rent" value={aed(c.rent_median)} rank={c.rank_rent_median} total={activeCount} />
        <Row label="Gross rental yield" value={pct(c.yield_pct, 2)} rank={c.rank_yield_pct} total={activeCount} />
        <Row label="Nearest metro / tram" value={c.nearest_station ? `${c.nearest_station} · ${km(c.metro_dist_m)}` : "—"} />
        <Row label="Units in pipeline" value={int(c.units_pipeline)} />
        <Row label="Location Score" value={isNum(c.location_score) ? `${c.location_score} / 100` : "—"} rank={c.rank_location_score} total={activeCount} />
      </div>
      {c.rent_approx && (
        <p className="text-[11px] text-muted">
          Rent and yield combine several marketing communities ({c.rent_sources?.join(", ")}), weighted by contract count.
        </p>
      )}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
