import { useQuery } from "@tanstack/react-query";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type {
  Amenities, AmenityHex, BedroomRent, BuildInfo, CityData, Community, Developer, Memo, Project, ScoreConfig,
} from "./types";

export const dataUrl = (file: string) => `${import.meta.env.BASE_URL}data/${file}`;

async function getJson<T>(file: string): Promise<T> {
  const r = await fetch(dataUrl(file));
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

const forever = { staleTime: Infinity, gcTime: Infinity } as const;
const q = <T,>(file: string) => () => useQuery({ queryKey: [file], queryFn: () => getJson<T>(file), ...forever });

export const useBuildInfo = q<BuildInfo>("build_info.json");
export const useCity = q<CityData>("city.json");
export const useCommunities = q<Community[]>("community_kpis.json");
export const useProjects = q<Project[]>("projects.json");
export const useDevelopers = q<Developer[]>("developers.json");
export const useBedroomRents = q<BedroomRent[]>("rents_bedrooms.json");
export const useMemos = q<Record<string, Memo>>("memos.json");
export const useScoreConfig = q<ScoreConfig>("score.json");
export const useAmenities = q<Amenities>("amenities.json");
export const useAmenityHexes = q<AmenityHex[]>("amenities_h3.json");

export type CommunityFeatures = FeatureCollection<Polygon | MultiPolygon, {
  community_id: string; community_name: string; sector: number;
}>;
export const useBoundaries = q<CommunityFeatures>("communities.geojson");
export const useStations = q<FeatureCollection<Point, { name: string; kind: "metro" | "tram" }>>("stations.geojson");
export const useParks = q<FeatureCollection<Point, { name: string | null; category: string; area_m2: number }>>(
  "parks.geojson",
);

/** Communities indexed by id, for joins. */
export function useCommunityIndex() {
  const { data } = useCommunities();
  return useQuery({
    queryKey: ["community-index", data?.length],
    enabled: !!data,
    queryFn: () => new Map((data ?? []).map((c) => [c.community_id, c])),
    ...forever,
  });
}
