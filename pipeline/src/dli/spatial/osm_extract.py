"""Extract Dubai boundaries, transit stations and amenity points from the Geofabrik GCC extract."""

from __future__ import annotations

from pathlib import Path

import geopandas as gpd
import osmium
import shapely
from shapely import wkb

# Loose box around the emirate (incl. Hatta); exact clip uses the OSM emirate polygon.
DUBAI_BBOX = (54.85, 24.60, 56.25, 25.40)

AMENITY_RULES: list[tuple[str, str, set[str] | None]] = [
    # (category, tag key, accepted values; None = any value)
    ("school", "amenity", {"school", "kindergarten", "college", "university"}),
    ("healthcare", "amenity", {"hospital", "clinic", "doctors"}),
    ("healthcare", "healthcare", {"hospital", "clinic", "doctor", "centre"}),
    ("retail", "shop", {"mall", "supermarket", "department_store"}),
    ("retail", "amenity", {"marketplace"}),
    ("office", "office", None),
    ("restaurant", "amenity", {"restaurant", "cafe", "fast_food", "food_court"}),
    ("park", "leisure", {"park", "garden"}),
    ("beach", "natural", {"beach"}),
]


def classify_amenity(tags: osmium.osm.TagList) -> str | None:
    for category, key, values in AMENITY_RULES:
        v = tags.get(key)
        if v and (values is None or v in values):
            return category
    return None


def classify_station(tags: osmium.osm.TagList) -> str | None:
    if tags.get("railway") == "tram_stop" or tags.get("tram") == "yes" and tags.get("public_transport") == "station":
        return "tram"
    if tags.get("station") == "light_rail" or tags.get("light_rail") == "yes":
        return "tram"
    if tags.get("station") == "subway" or tags.get("subway") == "yes":
        return "metro"
    if tags.get("railway") == "station" and "metro" in (tags.get("network", "") + tags.get("name:en", "") + tags.get("name", "")).lower():
        return "metro"
    return None


def _in_bbox(lon: float, lat: float) -> bool:
    x0, y0, x1, y1 = DUBAI_BBOX
    return x0 <= lon <= x1 and y0 <= lat <= y1


def extract(pbf: Path, out_dir: Path) -> dict[str, int]:
    out_dir.mkdir(parents=True, exist_ok=True)
    fab = osmium.geom.WKBFactory()
    admin, points, stations = [], [], []

    fp = osmium.FileProcessor(str(pbf)).with_areas().with_filter(osmium.filter.EmptyTagFilter())
    for o in fp:
        tags = o.tags
        if o.is_node():
            lon, lat = o.location.lon, o.location.lat
            if not _in_bbox(lon, lat):
                continue
            geom = shapely.Point(lon, lat)
        elif o.is_area():
            try:
                geom = wkb.loads(fab.create_multipolygon(o), hex=True)
            except (RuntimeError, osmium.InvalidLocationError):  # broken multipolygon in source data
                continue
            c = geom.centroid
            if not _in_bbox(c.x, c.y):
                continue
            if tags.get("boundary") == "administrative" and o.from_way() is False:
                admin.append(
                    {
                        "osm_id": o.orig_id(),
                        "name": tags.get("name"),
                        "name_en": tags.get("name:en") or tags.get("name"),
                        "name_ar": tags.get("name:ar"),
                        "admin_level": tags.get("admin_level"),
                        "place": tags.get("place"),
                        "ref": tags.get("ref"),
                        "geometry": geom,
                    }
                )
        else:
            continue

        name = tags.get("name:en") or tags.get("name")
        station_kind = classify_station(tags)
        if station_kind and o.is_node():
            stations.append({"osm_id": o.id, "kind": station_kind, "name": name, "geometry": geom})
            continue
        category = classify_amenity(tags)
        if category:
            pt = geom if o.is_node() else geom.representative_point()
            area_m2 = None
            if not o.is_node() and category in ("park", "beach"):
                area_m2 = float(gpd.GeoSeries([geom], crs=4326).to_crs(32640).area.iloc[0])
            points.append(
                {
                    "osm_type": "n" if o.is_node() else ("w" if o.from_way() else "r"),
                    "osm_id": o.id if o.is_node() else o.orig_id(),
                    "category": category,
                    "name": name,
                    "area_m2": area_m2,
                    "geometry": pt,
                }
            )

    admin_gdf = gpd.GeoDataFrame(admin, crs=4326)
    admin_gdf.to_parquet(out_dir / "osm_admin_bbox.parquet")
    # The emirate relation is not always tagged admin_level=4; take the largest "Dubai" boundary.
    cand = admin_gdf[admin_gdf.name_en.isin(["Dubai", "Emirate of Dubai", "Dubai Emirate"])]
    cand = cand[cand.admin_level.isin(["4", None]) | cand.admin_level.isna()]
    if cand.empty:
        raise RuntimeError("Dubai emirate boundary not found in extract")
    dubai = cand.loc[cand.to_crs(32640).area.idxmax(), "geometry"]

    def clip(gdf: gpd.GeoDataFrame, predicate: str) -> gpd.GeoDataFrame:
        if gdf.empty:
            return gdf
        if predicate == "within_centroid":
            return gdf[gdf.geometry.representative_point().within(dubai)]
        return gdf[gdf.geometry.within(dubai)]

    admin_gdf = clip(admin_gdf, "within_centroid")
    points_gdf = clip(gpd.GeoDataFrame(points, crs=4326), "within")
    stations_gdf = clip(gpd.GeoDataFrame(stations, crs=4326), "within")
    # Stations: the same stop is often mapped several times (platforms, stop_positions); keep one per name+kind.
    stations_gdf = stations_gdf.dropna(subset=["name"]).drop_duplicates(subset=["kind", "name"])

    admin_gdf.to_parquet(out_dir / "osm_admin_dubai.parquet")
    points_gdf.to_parquet(out_dir / "osm_amenities_dubai.parquet")
    stations_gdf.to_parquet(out_dir / "osm_stations_dubai.parquet")
    gpd.GeoDataFrame({"name": ["Dubai"]}, geometry=[dubai], crs=4326).to_parquet(out_dir / "dubai_emirate.parquet")
    return {"admin": len(admin_gdf), "amenities": len(points_gdf), "stations": len(stations_gdf)}
