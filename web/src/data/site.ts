import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { CommunityFeatures } from "./loaders";
import { percentileOf } from "./format";
import type { Amenities, Community, Project, ScoreComponent, ScoreConfig } from "./types";

export interface Site { lng: number; lat: number }

const R = 6371008.8;
export function haversine(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function communityAt(site: Site, boundaries: CommunityFeatures): string | null {
  const pt = { type: "Point" as const, coordinates: [site.lng, site.lat] };
  for (const f of boundaries.features) {
    if (booleanPointInPolygon(pt, f)) return f.properties.community_id;
  }
  return null;
}

export const SCORE_LABELS: Record<ScoreComponent, string> = {
  transit: "Transit access",
  amenities: "Amenity density",
  yield: "Gross rental yield",
  momentum: "Price momentum (12m)",
  rental_demand: "Rental demand",
  supply_risk: "Supply risk (lower is better)",
};
export const SCORE_ORDER: ScoreComponent[] = ["transit", "amenities", "yield", "momentum", "rental_demand", "supply_risk"];

export interface SiteAnalysis {
  site: Site;
  community: Community | null;
  nearestStation: { name: string; kind: string; distance: number } | null;
  amenityCounts: Record<string, number>;
  amenityScoreRaw: number;
  components: Record<ScoreComponent, number | null>;
  score: number | null;
  limited: boolean;
  projectsNearby: Project[];
}

export function analyse(
  site: Site,
  radiusM: number,
  ctx: {
    boundaries: CommunityFeatures;
    communities: Map<string, Community>;
    stations: { name: string; kind: string; lng: number; lat: number }[];
    amenities: Amenities;
    score: ScoreConfig;
    projects: Project[];
    weights: Record<ScoreComponent, number>;
  },
): SiteAnalysis {
  const cid = communityAt(site, ctx.boundaries);
  const community = cid ? ctx.communities.get(cid) ?? null : null;

  let nearest: SiteAnalysis["nearestStation"] = null;
  for (const s of ctx.stations) {
    const d = haversine(site.lng, site.lat, s.lng, s.lat);
    if (!nearest || d < nearest.distance) nearest = { name: s.name, kind: s.kind, distance: d };
  }

  const counts: Record<string, number> = Object.fromEntries(ctx.amenities.categories.map((c) => [c, 0]));
  let weighted = 0;
  const scoreRadius = ctx.score.amenity_radius_m;
  for (const [lng, lat, ci] of ctx.amenities.points) {
    // Cheap bounding pre-check (~0.04° ≈ 4 km) before the exact distance.
    if (Math.abs(lng - site.lng) > 0.04 || Math.abs(lat - site.lat) > 0.04) continue;
    const d = haversine(site.lng, site.lat, lng, lat);
    const cat = ctx.amenities.categories[ci];
    if (d <= radiusM) counts[cat] += 1;
    if (d <= scoreRadius) weighted += ctx.score.amenity_weights[cat] ?? 0;
  }

  const projectsNearby = ctx.projects.filter((p) =>
    p.status === "Active" && p.lat !== null && p.lng !== null && haversine(site.lng, site.lat, p.lng, p.lat) <= radiusM,
  );

  // Transit and amenities are measured at the pin and ranked against all active communities;
  // market components come from the community the pin falls in (see About & Data).
  const components: Record<ScoreComponent, number | null> = {
    transit: nearest ? percentileOf(ctx.score.distributions.metro_dist_m, nearest.distance, false) : null,
    amenities: percentileOf(ctx.score.distributions.amenity_score_raw, weighted, true),
    yield: community?.score_yield ?? null,
    momentum: community?.score_momentum ?? null,
    rental_demand: community?.score_rental_demand ?? null,
    supply_risk: community?.score_supply_risk ?? null,
  };
  const totalW = SCORE_ORDER.reduce((a, k) => a + ctx.weights[k], 0) || 1;
  const score = community?.active
    ? Math.round(SCORE_ORDER.reduce((a, k) => a + (components[k] ?? 50) * ctx.weights[k], 0) / totalW)
    : null;
  const limited = SCORE_ORDER.some((k) => components[k] === null);

  return { site, community, nearestStation: nearest, amenityCounts: counts, amenityScoreRaw: weighted, components, score, limited, projectsNearby };
}

export function median(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
