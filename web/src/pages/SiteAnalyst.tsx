import type { PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import * as Dialog from "@radix-ui/react-dialog";
import * as Slider from "@radix-ui/react-slider";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSearchParams } from "react-router-dom";
import { EChart } from "../charts/EChart";
import { seriesColors, useTokens } from "../charts/theme";
import { searchCommunities, matchedAlias } from "../components/CommunityPicker";
import { Badge, ChartCard, DataTable, Info, Note, PageHeader, Select, Skeleton } from "../components/ui";
import { useSql } from "../data/duckdb";
import { aed, dateLabel, int, isNum, km, pct, psf, signedPct } from "../data/format";
import {
  useAmenities, useBoundaries, useBuildInfo, useCity, useCommunities, useMemos, useProjects, useScoreConfig, useStations,
} from "../data/loaders";
import { analyse, median, SCORE_LABELS, SCORE_ORDER, type Site, type SiteAnalysis } from "../data/site";
import type { Community, ScoreComponent } from "../data/types";
import { hexToRgba } from "../map/colors";
import { MapView } from "../map/MapView";

const RADII = [{ value: "1000", label: "1 km radius" }, { value: "2000", label: "2 km radius" }, { value: "3000", label: "3 km radius" }];
const AMENITY_LABELS: Record<string, string> = {
  school: "Schools", healthcare: "Healthcare", retail: "Malls & supermarkets", park: "Parks", beach: "Beaches", restaurant: "Restaurants & cafés", office: "Offices",
};
const SITE_NAMES = ["Site A", "Site B", "Site C"];

const parsePins = (s: string | null): Site[] =>
  (s ?? "").split("|").map((p) => p.split(",").map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map(([lng, lat]) => ({ lng, lat })).slice(0, 3);
const fmtPins = (pins: Site[]) => pins.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join("|");

export default function SiteAnalyst() {
  const t = useTokens();
  const [params, setParams] = useSearchParams();
  const { data: info } = useBuildInfo();
  const { data: city } = useCity();
  const { data: communities } = useCommunities();
  const { data: boundaries } = useBoundaries();
  const { data: stations } = useStations();
  const { data: amenities } = useAmenities();
  const { data: scoreCfg } = useScoreConfig();
  const { data: projects } = useProjects();
  const { data: memos } = useMemos();

  const byId = useMemo(() => new Map((communities ?? []).map((c) => [c.community_id, c])), [communities]);
  const pins = parsePins(params.get("pins"));
  const active = Math.min(Number(params.get("active") ?? 0), Math.max(0, pins.length - 1));
  const radius = Number(params.get("r") ?? 2000);
  const [weights, setWeights] = useState<Record<ScoreComponent, number> | null>(null);
  const [query, setQuery] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom?: number } | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const update = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) if (v === null) next.delete(k); else next.set(k, v);
      return next;
    }, { replace: true });

  // ?community=ID or ?compare=ID (from other pages) -> a pin at the community's representative point.
  useEffect(() => {
    const ids = [params.get("community"), params.get("compare")].filter(Boolean) as string[];
    if (!ids.length || !communities) return;
    const add = ids.map((id) => byId.get(id)).filter(Boolean).map((c) => ({ lng: c!.centroid_lon, lat: c!.centroid_lat }));
    const existing = params.get("compare") ? pins : [];
    const next = [...existing, ...add].slice(-3);
    update({ community: null, compare: null, pins: fmtPins(next), active: String(next.length - 1) });
    if (add[0]) setFlyTo({ center: [add[0].lng, add[0].lat], zoom: 12.5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communities]);

  useEffect(() => { if (scoreCfg && !weights) setWeights(scoreCfg.weights); }, [scoreCfg, weights]);

  const ready = boundaries && communities && stations && amenities && scoreCfg && projects && weights;
  const analyses: SiteAnalysis[] = useMemo(() => {
    if (!ready) return [];
    const st = stations!.features.map((f) => ({ name: f.properties.name, kind: f.properties.kind, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
    return pins.map((p) => analyse(p, radius, { boundaries: boundaries!, communities: byId, stations: st, amenities: amenities!, score: scoreCfg!, projects: projects!, weights: weights! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, params.get("pins"), radius, weights]);

  const current = analyses[active];
  const c = current?.community ?? null;
  const activeCommunities = (communities ?? []).filter((x) => x.active);
  const refs = {
    psf: city?.kpis.psf.value ?? null,
    rent: median(activeCommunities.map((x) => x.rent_median)),
    yield: median(activeCommunities.map((x) => x.yield_pct)),
  };

  const compsQ = useSql<{ date: string; ptype: string; rooms: number | null; size_sqft: number; price: number; psf: number | null; place: string | null; market: string }>(
    ["comps", c?.community_id],
    c && info
      ? `select strftime(date, '%Y-%m-%d') as date, ptype, rooms, size_sqft, price, psf, coalesce(building_name, project_name) as place, market
         from sales where community_id = '${c.community_id}' and date > date '${info.data_through}' - interval 6 month
         order by date desc, price desc limit 25`
      : null,
  );

  const addPin = (lng: number, lat: number) => {
    const next = pins.length >= 3 ? [...pins.slice(0, active), { lng, lat }, ...pins.slice(active + 1)] : [...pins, { lng, lat }];
    const idx = pins.length >= 3 ? active : next.length - 1;
    update({ pins: fmtPins(next), active: String(idx) });
  };
  const movePin = (lng: number, lat: number) => {
    if (!pins.length) return addPin(lng, lat);
    const next = pins.map((p, i) => (i === active ? { lng, lat } : p));
    update({ pins: fmtPins(next) });
  };
  const removePin = (i: number) => {
    const next = pins.filter((_, j) => j !== i);
    update({ pins: next.length ? fmtPins(next) : null, active: String(Math.max(0, Math.min(active, next.length - 1))) });
  };
  const pickCommunity = (x: Community) => {
    setQuery("");
    movePin(x.centroid_lon, x.centroid_lat);
    setFlyTo({ center: [x.centroid_lon, x.centroid_lat], zoom: 12.5 });
  };

  const colors = seriesColors(t);
  const layers = [
    boundaries && new GeoJsonLayer({
      id: "site-communities",
      data: boundaries,
      stroked: true, filled: true,
      getFillColor: (f) => (analyses.some((a) => a.community?.community_id === f.properties.community_id) ? hexToRgba(t.accent, 28) : [0, 0, 0, 0]),
      getLineColor: t.dark ? [255, 255, 255, 50] : [11, 11, 11, 45],
      getLineWidth: 0.7, lineWidthUnits: "pixels",
      pickable: true,
      updateTriggers: { getFillColor: [params.get("pins")], getLineColor: [t.dark] },
    }),
    stations && new ScatterplotLayer({
      id: "site-stations",
      data: stations.features,
      getPosition: (f) => f.geometry.coordinates as [number, number],
      getRadius: 4, radiusUnits: "pixels",
      getFillColor: (f) => hexToRgba(f.properties.kind === "metro" ? t["series-8"] : t["series-3"]),
      pickable: true,
      updateTriggers: { getFillColor: [t.dark] },
    }),
    new ScatterplotLayer({
      id: "site-radius",
      data: pins.map((p, i) => ({ ...p, i })),
      getPosition: (d) => [d.lng, d.lat],
      getRadius: radius, radiusUnits: "meters",
      filled: true, stroked: true,
      getFillColor: (d) => hexToRgba(colors[d.i], d.i === active ? 30 : 14),
      getLineColor: (d) => hexToRgba(colors[d.i], 200),
      getLineWidth: (d) => (d.i === active ? 2 : 1), lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: [active, t.dark], getLineColor: [t.dark], getLineWidth: [active] },
    }),
    new ScatterplotLayer({
      id: "site-pins",
      data: pins.map((p, i) => ({ ...p, i })),
      getPosition: (d) => [d.lng, d.lat],
      getRadius: 8, radiusUnits: "pixels",
      getFillColor: (d) => hexToRgba(colors[d.i]),
      getLineColor: hexToRgba(t["surface-1"]), stroked: true, getLineWidth: 2.5, lineWidthUnits: "pixels",
      updateTriggers: { getFillColor: [t.dark], getLineColor: [t.dark] },
    }),
  ];

  const getTooltip = (info: PickingInfo) => {
    const o = info.object as { properties?: { name?: string; community_name?: string; community_id?: string; kind?: string } } | undefined;
    if (!o?.properties) return null;
    if (info.layer?.id === "site-stations") return `<b>${o.properties.name}</b><br/>${o.properties.kind === "metro" ? "Metro" : "Tram"} station`;
    return `<b>${o.properties.community_name}</b><br/>Click to analyse this spot`;
  };

  const results = query ? searchCommunities(communities ?? [], query, 8) : [];
  const memo = c ? memos?.[c.community_id] : undefined;

  const exportImage = async (kind: "png" | "pdf") => {
    if (!summaryRef.current) return;
    const { toPng } = await import("html-to-image");
    const bg = getComputedStyle(document.body).backgroundColor;
    const dataUrl = await toPng(summaryRef.current, { pixelRatio: 2, backgroundColor: bg });
    const name = `site-summary-${(c?.community_name ?? "dubai").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    if (kind === "png") {
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `${name}.png`; a.click();
      return;
    }
    const { jsPDF } = await import("jspdf");
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const pdf = new jsPDF({ orientation: img.width > img.height ? "l" : "p", unit: "px", format: [img.width / 2, img.height / 2] });
    pdf.addImage(dataUrl, "PNG", 0, 0, img.width / 2, img.height / 2);
    pdf.save(`${name}.pdf`);
  };

  return (
    <>
      <PageHeader title="Site Analyst" purpose="Tell me about this location in two minutes. Drop a pin, search a community, or compare up to three sites." />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a community, e.g. JVC, Arjan, Palm Jumeirah"
                aria-label="Search a community"
                className="focus-ring h-9 w-72 max-w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink placeholder:text-muted"
              />
              {results.length > 0 && (
                <ul className="absolute left-0 top-10 z-20 w-72 rounded-xl border border-line bg-surface p-1 shadow-xl">
                  {results.map((x) => {
                    const alias = matchedAlias(x, query);
                    return (
                      <li key={x.community_id}>
                        <button type="button" onClick={() => pickCommunity(x)} className="focus-ring w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-surface-2">
                          {x.community_name}{alias && <span className="text-muted"> · {alias}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <Select label="Radius" value={String(radius)} onChange={(v) => update({ r: v })} options={RADII} />
            {pins.length < 3 && pins.length > 0 && (
              <button type="button" onClick={() => setAddMode((m) => !m)} aria-pressed={addMode}
                className={`focus-ring h-9 rounded-lg border px-3 text-sm ${addMode ? "border-accent bg-[var(--accent-wash)] text-accent-ink" : "border-line text-ink hover:bg-surface-2"}`}>
                {addMode ? `Click the map to place ${SITE_NAMES[pins.length]}` : "+ Add site to compare"}
              </button>
            )}
          </div>

          {pins.length > 0 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Sites">
              {analyses.map((a, i) => (
                <div key={i} className={`flex items-center gap-1 rounded-full border px-1 py-0.5 text-sm ${i === active ? "border-accent bg-[var(--accent-wash)]" : "border-line bg-surface"}`}>
                  <button type="button" role="tab" aria-selected={i === active} onClick={() => update({ active: String(i) })} className="focus-ring flex items-center gap-1.5 rounded-full px-2 py-0.5 text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} aria-hidden />
                    {SITE_NAMES[i]} · {a.community?.community_name ?? "Outside communities"}
                  </button>
                  <button type="button" onClick={() => removePin(i)} aria-label={`Remove ${SITE_NAMES[i]}`} className="focus-ring rounded-full px-1.5 text-muted hover:text-ink">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="card overflow-hidden">
            <MapView
              className="h-[420px] xl:h-[560px]"
              cooperative
              layers={layers}
              flyTo={flyTo}
              cursor="crosshair"
              getTooltip={getTooltip}
              onClick={(_, lngLat) => {
                if (addMode) { addPin(lngLat[0], lngLat[1]); setAddMode(false); } else movePin(lngLat[0], lngLat[1]);
              }}
            >
              {!pins.length && (
                <div className="pointer-events-none absolute inset-x-0 top-3 z-10 mx-auto w-fit rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink shadow-lg">
                  Click anywhere on the map to drop a pin
                </div>
              )}
            </MapView>
          </div>
          {pins.length > 1 && <CompareView analyses={analyses} />}
        </div>

        <div ref={summaryRef} className="flex min-w-0 flex-col gap-3">
          {!current ? (
            <div className="card p-6 text-sm text-ink-2">
              <h2 className="mb-2 text-base font-semibold text-ink">Pick a location to start</h2>
              <p>Drop a pin on the map or search for a community. You'll get a Location Score, pricing and rent against the Dubai median, momentum, transit, amenities, nearby supply, recent comparable sales and a one-page site summary.</p>
            </div>
          ) : !ready ? <Skeleton height={500} /> : (
            <>
              <div className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted">{SITE_NAMES[active]} · {current.site.lat.toFixed(4)}, {current.site.lng.toFixed(4)}</div>
                    <h2 className="text-lg font-semibold text-ink">{c?.community_name ?? "Outside any community"}</h2>
                    {c?.aliases?.length ? <p className="text-xs text-muted">Includes {c.aliases.slice(0, 4).join(", ")}</p> : null}
                  </div>
                  <div className="flex gap-1.5">
                    <MemoDialog communityName={c?.community_name} memo={memo} />
                    <button type="button" onClick={() => exportImage("png")} className="focus-ring rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2">PNG</button>
                    <button type="button" onClick={() => exportImage("pdf")} className="focus-ring rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2">PDF</button>
                  </div>
                </div>
                {c && !c.active && <div className="mt-2"><Badge tone="warning">Fewer than 10 sales in 12 months — market metrics suppressed</Badge></div>}
              </div>

              <ScoreCard a={current} weights={weights!} setWeights={setWeights} defaults={scoreCfg!.weights} />

              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard title="Pricing" info="Median price per sq ft in the community (trailing 12 months) indexed to the Dubai median (100 = Dubai).">
                  <Big value={psf(c?.psf_12m)} />
                  <Indexed value={c?.psf_12m} ref_={refs.psf} />
                  <Sub>Median sale price {aed(c?.price_12m)}</Sub>
                </MetricCard>
                <MetricCard title="Rent & yield" info="Median annual rent and gross yield from Ejari contracts (last 12 months, via datadubai.ae). Dubai reference = median across active communities.">
                  <Big value={aed(c?.rent_median)} suffix="/ yr" />
                  <Indexed value={c?.rent_median} ref_={refs.rent} />
                  <Sub>Gross yield {pct(c?.yield_pct, 2)} (Dubai median {pct(refs.yield, 2)})</Sub>
                </MetricCard>
                <MetricCard title="Momentum" info="Change in median price per sq ft: last 3 months vs the 3 before, and last 12 months vs the 12 before.">
                  <div className="flex gap-6">
                    <div><div className="text-xs text-muted">3 months</div><Big value={signedPct(c?.psf_change_3m)} /></div>
                    <div><div className="text-xs text-muted">12 months</div><Big value={signedPct(c?.psf_change_12m)} /></div>
                  </div>
                  <Sub>{int(c?.sales_12m)} sales in 12 months · {pct(c?.offplan_share_12m)} off-plan</Sub>
                </MetricCard>
                <MetricCard title="Transit" info="Straight-line distance from the pin to the nearest Dubai Metro or tram station (OpenStreetMap).">
                  <Big value={km(current.nearestStation?.distance)} />
                  <Sub>{current.nearestStation ? `${current.nearestStation.name} (${current.nearestStation.kind})` : "—"}</Sub>
                </MetricCard>
                <MetricCard title={`Amenities within ${radius / 1000} km`} info="Counts of OpenStreetMap features within the selected radius of the pin.">
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {Object.entries(AMENITY_LABELS).map(([k, label]) => (
                      <li key={k} className="flex justify-between gap-2"><span className="text-ink-2">{label}</span><span className="tabular font-medium text-ink">{int(current.amenityCounts[k])}</span></li>
                    ))}
                  </ul>
                </MetricCard>
                <MetricCard title="Supply nearby" info="Active DLD-registered projects: units in the community pipeline, and projects with registered coordinates within the radius.">
                  <Big value={int(c?.units_pipeline)} suffix="units in pipeline" />
                  <Sub>{int(c?.units_next_24m)} completing in 24 months · {int(c?.projects_active)} active projects
                    {current.projectsNearby.length ? ` · ${current.projectsNearby.length} mapped within ${radius / 1000} km` : ""}</Sub>
                </MetricCard>
                <MetricCard title="Population" info="Dubai Statistics Center population by community was not reachable for v1.">
                  <Sub>Not available in v1 — the official population file is geo-blocked from where this dashboard is built.</Sub>
                </MetricCard>
              </div>

              <ChartCard title="Recent comparable sales" caption="Latest registered sales in this community over the last 6 months. No unit numbers are published."
                source={`Source: DLD registered sales via dubairealestatedata.com. Data through ${info ? dateLabel(info.data_through) : ""}.`}>
                {!c ? <p className="text-sm text-muted">Drop the pin inside a community to see comparables.</p>
                  : compsQ.isLoading ? <Skeleton height={200} />
                  : compsQ.error ? <Note>Could not load comparables: {String(compsQ.error)}</Note>
                  : (
                    <div className="max-h-80 overflow-auto">
                      <DataTable rows={compsQ.data ?? []} rowKey={(r) => `${r.date}-${r.price}-${r.size_sqft}-${r.place}`} columns={[
                        { key: "d", label: "Date", render: (r) => dateLabel(r.date) },
                        { key: "t", label: "Type", render: (r) => `${r.ptype === "villa" ? "Villa" : "Apt"}${isNum(r.rooms) ? ` · ${r.rooms === 0 ? "Studio" : `${r.rooms}${r.rooms >= 5 ? "+" : ""} bd`}` : ""}` },
                        { key: "s", label: "Size", align: "right", render: (r) => `${int(r.size_sqft)} sqft` },
                        { key: "p", label: "Price", align: "right", render: (r) => aed(r.price) },
                        { key: "f", label: "AED/sqft", align: "right", render: (r) => int(r.psf) },
                        { key: "b", label: "Building / project", render: (r) => <span className="text-ink-2">{r.place ?? "—"}{r.market === "offplan" ? " · off-plan" : ""}</span> },
                      ]} />
                    </div>
                  )}
              </ChartCard>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Big({ value, suffix }: { value: string; suffix?: string }) {
  return <div className="text-2xl font-semibold tracking-tight text-ink">{value}{suffix && <span className="ml-1 text-sm font-normal text-muted">{suffix}</span>}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 text-xs text-ink-2">{children}</div>;
}
function Indexed({ value, ref_ }: { value: number | null | undefined; ref_: number | null }) {
  if (!isNum(value) || !isNum(ref_)) return <Sub>Index vs Dubai: —</Sub>;
  const idx = Math.round((value / ref_) * 100);
  return <Sub>Index <b className="text-ink">{idx}</b> vs Dubai = 100 ({idx >= 100 ? `${idx - 100}% above` : `${100 - idx}% below`})</Sub>;
}
function MetricCard({ title, info, children }: { title: string; info: string; children: React.ReactNode }) {
  return (
    <section className="card p-4" aria-label={title}>
      <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink-2">{title}<Info>{info}</Info></div>
      {children}
    </section>
  );
}

function ScoreCard({ a, weights, setWeights, defaults }: {
  a: SiteAnalysis;
  weights: Record<ScoreComponent, number>;
  setWeights: (w: Record<ScoreComponent, number>) => void;
  defaults: Record<ScoreComponent, number>;
}) {
  const [open, setOpen] = useState(false);
  const total = SCORE_ORDER.reduce((s, k) => s + weights[k], 0) || 1;
  return (
    <section className="card p-4" aria-label="Location Score">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-xs font-medium text-ink-2">
            Location Score
            <Info>Each component is a 0–100 percentile rank across Dubai's active communities, then weighted. Transit and amenities are measured at the pin; market components use the pin's community. Missing components count as 50.</Info>
          </div>
          <div className="text-4xl font-semibold tracking-tight text-ink">{a.score ?? "—"}<span className="text-base font-normal text-muted"> / 100</span></div>
          {a.limited && a.score !== null && <Badge tone="neutral">Limited data — some components neutral</Badge>}
          {a.score === null && <p className="text-xs text-muted">Score needs a community with at least 10 sales in 12 months.</p>}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="focus-ring rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink hover:bg-surface-2">
          {open ? "Done" : "Customize weights"}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {SCORE_ORDER.map((k) => {
          const v = a.components[k];
          return (
            <li key={k} className="text-xs">
              <div className="flex justify-between text-ink-2">
                <span>{SCORE_LABELS[k]} <span className="text-muted">· {Math.round((weights[k] / total) * 100)}%</span></span>
                <span className="tabular font-medium text-ink">{isNum(v) ? Math.round(v) : "n/a"}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${isNum(v) ? v : 0}%` }} />
              </div>
              {open && (
                <Slider.Root className="relative mt-2 flex h-4 w-full touch-none select-none items-center" value={[weights[k] * 100]} min={0} max={50} step={1}
                  onValueChange={([x]) => setWeights({ ...weights, [k]: x / 100 })} aria-label={`Weight for ${SCORE_LABELS[k]}`}>
                  <Slider.Track className="relative h-1 grow rounded-full bg-surface-2"><Slider.Range className="absolute h-full rounded-full bg-[var(--seq-300)]" /></Slider.Track>
                  <Slider.Thumb className="focus-ring block h-4 w-4 rounded-full border-2 border-accent bg-surface" />
                </Slider.Root>
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <button type="button" onClick={() => setWeights(defaults)} className="focus-ring mt-3 text-xs text-accent-ink underline">Reset to default weights</button>
      )}
    </section>
  );
}

function CompareView({ analyses }: { analyses: SiteAnalysis[] }) {
  const t = useTokens();
  const colors = seriesColors(t);
  const rows: { label: string; get: (a: SiteAnalysis) => string }[] = [
    { label: "Community", get: (a) => a.community?.community_name ?? "—" },
    { label: "Location Score", get: (a) => (a.score === null ? "—" : String(a.score)) },
    { label: "Median AED/sqft", get: (a) => int(a.community?.psf_12m) },
    { label: "12m price change", get: (a) => signedPct(a.community?.psf_change_12m) },
    { label: "Median rent", get: (a) => aed(a.community?.rent_median) },
    { label: "Gross yield", get: (a) => pct(a.community?.yield_pct, 2) },
    { label: "Nearest station", get: (a) => km(a.nearestStation?.distance) },
    { label: "Units in pipeline", get: (a) => int(a.community?.units_pipeline) },
  ];
  return (
    <ChartCard title="Compare sites" caption="Score components side by side. Further out on each axis is better." source="Location Score components: percentile ranks across active communities.">
      <EChart height={300} ariaLabel="Radar chart comparing sites" option={() => ({
        legend: { show: true, data: analyses.map((_, i) => SITE_NAMES[i]) },
        tooltip: {},
        radar: {
          indicator: SCORE_ORDER.map((k) => ({ name: SCORE_LABELS[k].replace(" (lower is better)", ""), max: 100 })),
          radius: "62%", center: ["50%", "56%"],
          axisName: { color: t["text-secondary"], fontSize: 11 },
          splitLine: { lineStyle: { color: t.grid } }, splitArea: { show: false }, axisLine: { lineStyle: { color: t.grid } },
        },
        series: [{
          type: "radar",
          data: analyses.map((a, i) => ({
            name: SITE_NAMES[i], value: SCORE_ORDER.map((k) => Math.round(a.components[k] ?? 50)),
            lineStyle: { width: 2, color: colors[i] }, itemStyle: { color: colors[i] }, areaStyle: { opacity: 0.08, color: colors[i] }, symbolSize: 8,
          })),
        }],
      })} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-ink-2"><th className="py-1.5 font-medium" scope="col">Metric</th>
            {analyses.map((_, i) => <th key={i} className="py-1.5 text-right font-medium" scope="col"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colors[i] }} aria-hidden />{SITE_NAMES[i]}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.label} className="border-b border-line/50"><td className="py-1.5 text-ink-2">{r.label}</td>
              {analyses.map((a, i) => <td key={i} className="tabular py-1.5 text-right text-ink">{r.get(a)}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function MemoDialog({ communityName, memo }: { communityName?: string; memo?: { memo: string; source: string; data_through: string; disclaimer: string; model: string | null } }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" disabled={!memo} className="focus-ring rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
          Read the summary
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-6 shadow-2xl">
          <Dialog.Title className="text-lg font-semibold text-ink">{memo?.source === "ai" ? "Site memo" : "Site summary"}: {communityName}</Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-muted">
            {memo?.source === "ai" ? `Written by ${memo.model} from computed facts only; every number is checked against the data.` : "Generated by rules from the computed figures — strengths, risks and peers, each tied to a number."}
          </Dialog.Description>
          <div className="prose-sm mt-4 space-y-2 text-sm leading-relaxed text-ink [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-ink [&_ul]:space-y-1">
            {memo && <ReactMarkdown>{memo.memo}</ReactMarkdown>}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Data through {memo?.data_through}. {memo?.disclaimer}</p>
          <Dialog.Close asChild>
            <button type="button" className="focus-ring absolute right-4 top-4 rounded-lg px-2 py-1 text-muted hover:text-ink" aria-label="Close">✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
