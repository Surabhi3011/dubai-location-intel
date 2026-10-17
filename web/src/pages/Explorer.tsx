import type { PickingInfo } from "@deck.gl/core";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTokens } from "../charts/theme";
import { CommunityCard } from "../components/CommunityCard";
import { searchCommunities } from "../components/CommunityPicker";
import { Select } from "../components/ui";
import { aed, dateLabel, int, isNum, km, pct, psf, signedPct } from "../data/format";
import { useAmenityHexes, useBoundaries, useBuildInfo, useCommunities, useStations } from "../data/loaders";
import type { Community } from "../data/types";
import { divergingScale, hexToRgba, quantileScale, type RGBA } from "../map/colors";
import { MapLegend, MapView } from "../map/MapView";

type MetricKey = "psf_12m" | "rent_median" | "yield_pct" | "psf_change_12m" | "sales_per_km2" | "units_pipeline" | "metro_dist_m" | "location_score";

const METRICS: { key: MetricKey; label: string; fmt: (v: number) => string; diverging?: boolean; lowIsGood?: boolean; note?: string }[] = [
  { key: "psf_12m", label: "Median price per sq ft", fmt: (v) => psf(v) },
  { key: "rent_median", label: "Median annual rent", fmt: (v) => aed(v) },
  { key: "yield_pct", label: "Gross rental yield", fmt: (v) => pct(v) },
  { key: "psf_change_12m", label: "12-month price change", fmt: (v) => signedPct(v), diverging: true },
  { key: "sales_per_km2", label: "Transaction velocity (sales / km²)", fmt: (v) => int(v), note: "Units register unavailable, so velocity is sales per km² rather than per 1,000 units." },
  { key: "units_pipeline", label: "Units in pipeline", fmt: (v) => int(v) },
  { key: "metro_dist_m", label: "Distance to nearest metro / tram", fmt: (v) => km(v), lowIsGood: true },
  { key: "location_score", label: "Location Score", fmt: (v) => `${Math.round(v)}` },
];

export default function Explorer() {
  const t = useTokens();
  const navigate = useNavigate();
  const { data: info } = useBuildInfo();
  const { data: communities = [] } = useCommunities();
  const { data: boundaries } = useBoundaries();
  const { data: stations } = useStations();
  const { data: hexes } = useAmenityHexes();

  const [metric, setMetric] = useState<MetricKey>("psf_12m");
  const [showStations, setShowStations] = useState(true);
  const [showHex, setShowHex] = useState(false);
  const [threeD, setThreeD] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom?: number } | null>(null);

  const byId = useMemo(() => new Map(communities.map((c) => [c.community_id, c])), [communities]);
  const activeCount = communities.filter((c) => c.active).length;
  const def = METRICS.find((m) => m.key === metric)!;

  // Thin-data rule: price-type metrics only shown for active communities.
  const valueOf = (c: Community | undefined): number | null => {
    if (!c) return null;
    const v = c[metric] as number | null;
    if (!isNum(v)) return null;
    if (["psf_12m", "psf_change_12m", "location_score", "yield_pct", "rent_median"].includes(metric) && !c.active) return null;
    return v;
  };

  const scale = useMemo(() => {
    const vals = communities.map(valueOf).filter(isNum);
    return def.diverging ? divergingScale(vals, t, def.fmt) : quantileScale(vals, t, def.fmt, def.lowIsGood);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communities, metric, t]);

  const maxValue = useMemo(() => Math.max(1, ...communities.map((c) => c.value_12m ?? 0)), [communities]);
  const accent = hexToRgba(t.accent);
  const lineColor: RGBA = t.dark ? [255, 255, 255, 60] : [11, 11, 11, 50];

  const layers = [
    boundaries && new GeoJsonLayer({
      id: "communities",
      data: boundaries,
      pickable: true,
      stroked: true,
      filled: true,
      extruded: threeD,
      wireframe: false,
      getFillColor: (f) => {
        const v = valueOf(byId.get(f.properties.community_id));
        return v === null ? (t.dark ? [255, 255, 255, 12] : [11, 11, 11, 10]) : scale.color(v);
      },
      getElevation: (f) => ((byId.get(f.properties.community_id)?.value_12m ?? 0) / maxValue) * 6000,
      getLineColor: (f) =>
        f.properties.community_id === selected ? accent : f.properties.community_id === hovered ? [accent[0], accent[1], accent[2], 160] : lineColor,
      getLineWidth: (f) => (f.properties.community_id === selected ? 3 : f.properties.community_id === hovered ? 2 : 0.6),
      lineWidthUnits: "pixels",
      material: { ambient: 0.6, diffuse: 0.5, shininess: 16 },
      onHover: (info) => setHovered((info.object as { properties: { community_id: string } } | null)?.properties.community_id ?? null),
      updateTriggers: { getFillColor: [metric, scale, t.dark], getLineColor: [selected, hovered, t.dark], getLineWidth: [selected, hovered], getElevation: [threeD] },
    }),
    showHex && hexes && new H3HexagonLayer({
      id: "amenity-hex",
      data: hexes,
      getHexagon: (d) => d.h3,
      getFillColor: (d) => {
        const ramp = [t["series-2"]];
        const c = hexToRgba(ramp[0], Math.min(230, 40 + d.weighted * 6));
        return c;
      },
      extruded: false,
      stroked: false,
      pickable: true,
      opacity: 0.9,
      updateTriggers: { getFillColor: [t.dark] },
    }),
    showStations && stations && new ScatterplotLayer({
      id: "stations",
      data: stations.features,
      getPosition: (f) => f.geometry.coordinates as [number, number],
      getRadius: 5,
      radiusUnits: "pixels",
      getFillColor: (f) => (f.properties.kind === "metro" ? hexToRgba(t["series-8"]) : hexToRgba(t["series-3"])),
      getLineColor: hexToRgba(t["surface-1"]),
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 2,
      pickable: true,
      updateTriggers: { getFillColor: [t.dark], getLineColor: [t.dark] },
    }),
  ];

  const getTooltip = (info: PickingInfo) => {
    const o = info.object as Record<string, unknown> | undefined;
    if (!o) return null;
    if (info.layer?.id === "stations") {
      const p = (o as { properties: { name: string; kind: string } }).properties;
      return `<b>${p.name}</b><br/>${p.kind === "metro" ? "Metro" : "Tram"} station`;
    }
    if (info.layer?.id === "amenity-hex") {
      const h = o as Record<string, number>;
      return `<b>${h.total} amenities</b> in this hexagon<br/>Schools ${h.school ?? 0} · Healthcare ${h.healthcare ?? 0} · Retail ${h.retail ?? 0}<br/>Parks ${h.park ?? 0} · Restaurants ${h.restaurant ?? 0} · Offices ${h.office ?? 0}`;
    }
    const id = (o as { properties: { community_id: string } }).properties.community_id;
    const c = byId.get(id);
    if (!c) return null;
    const v = valueOf(c);
    return `<b>${c.community_name}</b><br/>${def.label}: <b>${v === null ? "insufficient data" : def.fmt(v)}</b>${threeD ? `<br/>Sales value (12m): ${aed(c.value_12m)}` : ""}`;
  };

  const results = query ? searchCommunities(communities, query, 8) : [];
  const sel = selected ? byId.get(selected) : null;

  const pick = (c: Community) => {
    setSelected(c.community_id);
    setQuery("");
    setFlyTo({ center: [c.centroid_lon, c.centroid_lat], zoom: 12 });
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
      <MapView
        className="min-h-[55vh] flex-1"
        layers={layers}
        pitch={threeD ? 50 : 0}
        flyTo={flyTo}
        cursor={hovered ? "pointer" : undefined}
        getTooltip={getTooltip}
        onClick={(info) => {
          if (info.layer?.id === "communities" && info.object) {
            setSelected((info.object as { properties: { community_id: string } }).properties.community_id);
          }
        }}
      >
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-4rem)] flex-col gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-lg backdrop-blur">
            <Select label="Map metric" value={metric} onChange={setMetric} options={METRICS.map((m) => ({ value: m.key, label: m.label }))} />
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a community…"
                aria-label="Find a community"
                className="focus-ring h-9 w-48 rounded-lg border border-line bg-page px-2.5 text-sm text-ink placeholder:text-muted"
              />
              {results.length > 0 && (
                <ul className="absolute left-0 top-10 z-10 w-64 rounded-xl border border-line bg-surface p-1 shadow-xl">
                  {results.map((c) => (
                    <li key={c.community_id}>
                      <button type="button" onClick={() => pick(c)} className="focus-ring w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2">
                        {c.community_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <fieldset className="pointer-events-auto flex flex-wrap gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-2 shadow-lg backdrop-blur">
            <legend className="sr-only">Map layers</legend>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showStations} onChange={(e) => setShowStations(e.target.checked)} /> Metro & tram</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showHex} onChange={(e) => setShowHex(e.target.checked)} /> Amenity hexagons (H3)</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={threeD} onChange={(e) => setThreeD(e.target.checked)} /> 3D by sales value</label>
          </fieldset>
        </div>
        <div className="pointer-events-none absolute bottom-8 left-3 z-10">
          <MapLegend title={def.label} stops={scale.stops} note={def.note ?? `Trailing 12 months to ${info ? dateLabel(info.last_full_month).replace(/^1 /, "") : ""}.`} />
        </div>
      </MapView>

      <aside className="max-h-[45vh] overflow-y-auto border-t border-line bg-surface p-4 lg:max-h-none lg:w-[380px] lg:border-l lg:border-t-0" aria-label="Community details">
        {sel ? (
          <CommunityCard
            c={sel}
            activeCount={activeCount}
            actions={<>
              <button type="button" onClick={() => navigate(`/site?community=${sel.community_id}`)} className="focus-ring rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">
                Open in Site Analyst
              </button>
              <button type="button" onClick={() => navigate(`/site?compare=${sel.community_id}`)} className="focus-ring rounded-lg border border-line px-3 py-2 text-sm text-ink hover:bg-surface-2">
                Add to compare
              </button>
            </>}
          />
        ) : (
          <div className="text-sm text-ink-2">
            <h2 className="mb-1 text-lg font-semibold text-ink">Community Explorer</h2>
            <p>Where are prices, rents and growth happening? Pick a metric, then click any of Dubai's {communities.length} communities for details.</p>
            <p className="mt-3 text-xs text-muted">
              Boundaries: Dubai Municipality communities. Prices: DLD sales. Rents and yields: Ejari aggregates via datadubai.ae.
              Stations and amenities: OpenStreetMap. Population layers are not available in v1 (source blocked).
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
