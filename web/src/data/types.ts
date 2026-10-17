export type Nullable<T> = T | null;

export interface BuildInfo {
  data_through: string;
  last_full_month: string;
  window_12m: [string, string];
  window_prev_12m: [string, string];
  detail_start: string;
  built_at: string;
  min_records: number;
  sources: Record<string, { url: string; licence: string; attribution: string }>;
}

export interface KpiValue {
  value: Nullable<number>;
  prev: Nullable<number>;
  change_pct: Nullable<number>;
  change_pp?: number;
}

export interface CityMonth {
  month: string;
  sales: number;
  value_aed: number;
  sales_offplan: number;
  sales_ready: number;
  psf: Nullable<number>;
  psf_apartment: Nullable<number>;
  psf_villa: Nullable<number>;
  psf_offplan: Nullable<number>;
  psf_ready: Nullable<number>;
  psf_index: Nullable<number>;
  partial: boolean;
}

export interface CityData {
  kpis: Record<"sales" | "value_aed" | "psf" | "offplan_share" | "active_communities", KpiValue>;
  monthly: CityMonth[];
  price_bands: { price_band: string; sales: number }[];
  top_by_value: { community_id: string; community_name: string; sales: number; value_aed: number }[];
  top_by_sales: { community_id: string; community_name: string; sales: number; value_aed: number }[];
  daily: { date: string; sales: number }[];
  bedrooms: {
    code: string; label: string; n: number; price_median: number; psf_median: number;
    sqft_median: number; rent_median: number; n_rents: number; yield_pct: number;
  }[];
}

export interface Community {
  community_id: string;
  community_name: string;
  community_name_ar: string;
  sector: number;
  land_area_km2: number;
  centroid_lon: number;
  centroid_lat: number;
  active: boolean;
  sales_12m: number;
  sales_prev_12m: number;
  sales_change_12m: Nullable<number>;
  value_12m: Nullable<number>;
  psf_12m: Nullable<number>;
  psf_apartment_12m: Nullable<number>;
  psf_villa_12m: Nullable<number>;
  price_12m: Nullable<number>;
  psf_prev_12m: Nullable<number>;
  psf_3m: Nullable<number>;
  psf_change_12m: Nullable<number>;
  psf_change_3m: Nullable<number>;
  offplan_share_12m: Nullable<number>;
  sales_per_km2: number;
  nearest_station: Nullable<string>;
  nearest_station_kind: Nullable<string>;
  metro_dist_m: Nullable<number>;
  n_school: number; n_healthcare: number; n_retail: number; n_park: number;
  n_beach: number; n_restaurant: number; n_office: number;
  amenity_score_raw: number;
  rent_median: Nullable<number>;
  rent_contracts_12m: number;
  rent_contracts_per_km2: Nullable<number>;
  yield_pct: Nullable<number>;
  rent_sources: Nullable<string[]>;
  rent_approx: Nullable<boolean>;
  projects_active: number;
  units_pipeline: number;
  units_next_12m: number;
  units_next_24m: number;
  projects_delayed: number;
  avg_completion_pct: Nullable<number>;
  supply_pressure: Nullable<number>;
  score_transit: Nullable<number>;
  score_amenities: Nullable<number>;
  score_yield: Nullable<number>;
  score_momentum: Nullable<number>;
  score_rental_demand: Nullable<number>;
  score_supply_risk: Nullable<number>;
  location_score: Nullable<number>;
  limited_data: Nullable<boolean>;
  rank_psf_12m: Nullable<number>;
  rank_rent_median: Nullable<number>;
  rank_yield_pct: Nullable<number>;
  rank_psf_change_12m: Nullable<number>;
  rank_sales_12m: Nullable<number>;
  rank_location_score: Nullable<number>;
  sparkline: Nullable<[string, Nullable<number>][]>;
  aliases: Nullable<string[]>;
}

export interface Project {
  project_id: number;
  name: string;
  status: "Active" | "Finished" | "Cancelled";
  completion_pct: Nullable<number>;
  completion_date: Nullable<string>;
  start_date: Nullable<string>;
  developer: Nullable<string>;
  developer_slug: Nullable<string>;
  total_units: Nullable<number>;
  lat: Nullable<number>;
  lng: Nullable<number>;
  marketing_community: Nullable<string>;
  community_id: Nullable<string>;
  sales_n: Nullable<number>;
  price_median: Nullable<number>;
  psf_median: Nullable<number>;
  offplan_share: Nullable<number>;
}

export interface Developer {
  name: string; slug: string; n_projects: number; units: number; sales_n: number;
  price_median: Nullable<number>; psf_median: Nullable<number>; offplan_share: Nullable<number>;
}

export interface BedroomRent {
  marketing_community: string;
  community_id: Nullable<string>;
  bedrooms: string;
  label: string;
  sales_n: Nullable<number>;
  price_median: Nullable<number>;
  psf_median: Nullable<number>;
  sqft_median: Nullable<number>;
  rent_median: Nullable<number>;
  rent_contracts: Nullable<number>;
  yield_pct: Nullable<number>;
}

export interface Memo {
  memo: string;
  source: "ai" | "template";
  model: Nullable<string>;
  data_through: string;
  disclaimer: string;
}

export interface ScoreConfig {
  weights: Record<ScoreComponent, number>;
  amenity_weights: Record<string, number>;
  amenity_radius_m: number;
  distributions: { metro_dist_m: number[]; amenity_score_raw: number[] };
}

export type ScoreComponent = "transit" | "amenities" | "yield" | "momentum" | "rental_demand" | "supply_risk";

export interface Amenities {
  categories: string[];
  points: [number, number, number][];
}

export interface AmenityHex {
  h3: string;
  total: number;
  weighted: number;
  [category: string]: string | number;
}
