"""Assemble the Dubai Municipality community layer.

Geometry: DM community polygons (Apr 2026 mirror), plus the two communities that mirror lacks
(501, 502) from an older DM mirror. Names and sector: DM layer Community_20260815 (Aug 2026).
"""

from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd


def build(raw_dir: Path) -> gpd.GeoDataFrame:
    primary = gpd.read_file(raw_dir / "dm_communities_martaferreira.geojson")[["COMM_NUM", "geometry"]]
    older = gpd.read_file(raw_dir / "dm_communities_krishna.geojson")[["COMM_NUM", "geometry"]]
    missing = older[~older.COMM_NUM.isin(primary.COMM_NUM) & older.COMM_NUM.isin([501, 502])]
    gdf = pd.concat([primary, missing], ignore_index=True)
    gdf["geometry"] = gdf.geometry.make_valid()
    gdf = gdf.dissolve("COMM_NUM").reset_index()

    meta = json.loads((raw_dir / "trivoslabs_communities.json").read_text(encoding="utf-8"))
    names = pd.DataFrame(
        [
            {
                "COMM_NUM": int(c["communityNumber"]),
                "community_name": c["nameDisplay"]["en"],
                "community_name_ar": c["name"]["ar"],
                "sector": c["sector"],
            }
            for c in meta["communities"]
        ]
    )
    gdf = gdf.merge(names, on="COMM_NUM", how="inner").rename(columns={"COMM_NUM": "community_id"})
    gdf["community_id"] = gdf["community_id"].astype(str)
    projected = gdf.to_crs(32640)
    gdf["land_area_km2"] = (projected.area / 1e6).round(3)
    centroids = projected.geometry.representative_point().to_crs(4326)
    gdf["centroid_lon"] = centroids.x.round(5)
    gdf["centroid_lat"] = centroids.y.round(5)
    return gpd.GeoDataFrame(gdf, crs=4326)
