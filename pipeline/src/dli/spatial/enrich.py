"""Spatial context per community: transit distance, amenity counts and H3 amenity density."""

from __future__ import annotations

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
from shapely import Point

from dli.config import AMENITY_WEIGHTS, H3_RES, SCORE_AMENITY_RADIUS_M, UTM40N


def community_context(
    communities: gpd.GeoDataFrame, stations: gpd.GeoDataFrame, amenities: gpd.GeoDataFrame
) -> pd.DataFrame:
    comm = communities.to_crs(UTM40N)
    centroids = gpd.GeoDataFrame(
        comm[["community_id"]],
        geometry=[Point(xy) for xy in zip(*gpd.GeoSeries.from_xy(
            communities.centroid_lon, communities.centroid_lat, crs=4326).to_crs(UTM40N).pipe(lambda s: (s.x, s.y)))],
        crs=UTM40N,
    )

    st = stations.to_crs(UTM40N)
    nearest = gpd.sjoin_nearest(centroids, st[["name", "kind", "geometry"]], distance_col="metro_dist_m")
    nearest = nearest.sort_values("metro_dist_m").drop_duplicates("community_id")
    out = nearest[["community_id", "name", "kind", "metro_dist_m"]].rename(
        columns={"name": "nearest_station", "kind": "nearest_station_kind"}
    )
    out["metro_dist_m"] = out["metro_dist_m"].round(0)

    am = amenities.to_crs(UTM40N)
    # Counts inside each community polygon.
    inside = gpd.sjoin(am[["category", "geometry"]], comm[["community_id", "geometry"]], predicate="within")
    counts = inside.pivot_table(index="community_id", columns="category", aggfunc="size", fill_value=0)
    counts.columns = [f"n_{c}" for c in counts.columns]

    # Weighted amenity count within the scoring radius of the community's representative point.
    buf = centroids.copy()
    buf["geometry"] = buf.buffer(SCORE_AMENITY_RADIUS_M)
    near = gpd.sjoin(am[["category", "geometry"]], buf, predicate="within")
    near["w"] = near["category"].map(AMENITY_WEIGHTS).fillna(0)
    weighted = near.groupby("community_id")["w"].sum().rename("amenity_score_raw").round(1)

    out = out.merge(counts, on="community_id", how="left").merge(weighted, on="community_id", how="left")
    fill_cols = [c for c in out.columns if c.startswith("n_")] + ["amenity_score_raw"]
    out[fill_cols] = out[fill_cols].fillna(0)
    return out


def amenity_hexes(amenities: gpd.GeoDataFrame) -> pd.DataFrame:
    df = pd.DataFrame(
        {
            "h3": [h3.latlng_to_cell(p.y, p.x, H3_RES) for p in amenities.geometry],
            "category": amenities["category"].values,
        }
    )
    hexes = df.pivot_table(index="h3", columns="category", aggfunc="size", fill_value=0)
    hexes["total"] = hexes.sum(axis=1)
    hexes["weighted"] = sum(hexes.get(c, 0) * w for c, w in AMENITY_WEIGHTS.items())
    return hexes.reset_index()


def nearest_distances_distribution(values: pd.Series) -> list[float]:
    """Sorted values, used client-side to percentile-rank a dropped pin against communities."""
    return sorted(np.round(values.dropna().astype(float), 1).tolist())
