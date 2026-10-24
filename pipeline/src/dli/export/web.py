"""Write web-ready static files into data/output/."""

from __future__ import annotations

import json
import math
from datetime import UTC, date, datetime
from pathlib import Path

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

from dli.aggregate.build import Tables
from dli.config import AMENITY_WEIGHTS, MIN_RECORDS, RAW, SCORE_AMENITY_RADIUS_M, SCORE_WEIGHTS

AMENITY_CATEGORIES = ["school", "healthcare", "retail", "park", "beach", "restaurant", "office"]


def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return None if np.isnan(v) else round(float(v), 4)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if isinstance(v, (pd.Timestamp, date, datetime)):
        return v.isoformat()[:10]
    if isinstance(v, np.ndarray):
        return [_clean(x) for x in v.tolist()]
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if v is pd.NaT:
        return None
    return v


def _records(df: pd.DataFrame) -> list[dict]:
    return [{k: _clean(v) for k, v in r.items()} for r in df.to_dict(orient="records")]


def _write_json(path: Path, obj) -> int:
    path.write_text(json.dumps(_clean(obj), separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return path.stat().st_size


def _geojson(gdf: gpd.GeoDataFrame, path: Path, precision: int = 5) -> int:
    gdf = gdf.copy()
    gdf["geometry"] = shapely.set_precision(gdf.geometry.values, 10 ** -precision)
    path.write_text(gdf.to_json(drop_id=True, na="null"), encoding="utf-8")
    return path.stat().st_size


def export(t: Tables, con: duckdb.DuckDBPyConnection, out: Path, memos: dict | None = None) -> dict[str, int]:
    out.mkdir(parents=True, exist_ok=True)
    w = t.windows
    sizes: dict[str, int] = {}

    manifest = json.loads((RAW / "manifest.json").read_text(encoding="utf-8")) if (RAW / "manifest.json").exists() else {}
    sizes["build_info.json"] = _write_json(out / "build_info.json", {
        "data_through": w.data_end,
        "last_full_month": w.last_full_month,
        "window_12m": [w.w12_start, w.w12_end],
        "window_prev_12m": [w.p12_start, w.w12_start],
        "detail_start": w.detail_start,
        "built_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "min_records": MIN_RECORDS,
        "sources": {k: {kk: v.get(kk) for kk in ("url", "licence", "attribution", "fetched_at")}
                    for k, v in manifest.items() if v.get("attribution")},
    })

    top = t.top_communities
    sizes["city.json"] = _write_json(out / "city.json", {
        "kpis": t.city_kpis,
        "monthly": _records(t.city_monthly),
        "price_bands": _records(t.price_bands),
        "top_by_value": _records(top.nlargest(10, "value_aed")),
        "top_by_sales": _records(top.nlargest(10, "sales")),
        "daily": _records(t.daily),
        "bedrooms": _records(t.market_bedrooms[["code", "label", "n", "price_median", "psf_median",
                                                "sqft_median", "rent_median", "n_rents", "yield_pct"]]),
    })

    k = t.community_kpis.copy()
    spark = t.community_monthly.groupby("community_id").apply(
        lambda g: [[m, (p if n >= 5 else None)] for m, n, p in zip(g.month, g.n, g.psf)], include_groups=False
    )
    k["sparkline"] = k["community_id"].map(spark)
    aliases = t.aliases.groupby("community_id")["alias"].apply(list)
    k["aliases"] = k["community_id"].map(aliases)
    drop = [c for c in k.columns if c.startswith("n_psf") or c in ("offplan_12m",)]
    sizes["community_kpis.json"] = _write_json(out / "community_kpis.json", _records(k.drop(columns=drop)))

    comm = t.communities[["community_id", "community_name", "sector", "geometry"]].copy()
    comm["geometry"] = comm.geometry.simplify(0.00012, preserve_topology=True)
    sizes["communities.geojson"] = _geojson(comm, out / "communities.geojson")

    st = t.stations[["name", "kind", "geometry"]]
    sizes["stations.geojson"] = _geojson(st, out / "stations.geojson")

    am = t.amenities
    cat_idx = {c: i for i, c in enumerate(AMENITY_CATEGORIES)}
    sizes["amenities.json"] = _write_json(out / "amenities.json", {
        "categories": AMENITY_CATEGORIES,
        "points": [[round(p.x, 5), round(p.y, 5), cat_idx[c]] for p, c in zip(am.geometry, am.category)],
    })
    parks = am[am.category.isin(["park", "beach"]) & (am.area_m2.fillna(0) >= 5000)]
    sizes["parks.geojson"] = _geojson(parks[["name", "category", "area_m2", "geometry"]], out / "parks.geojson")
    sizes["amenities_h3.json"] = _write_json(out / "amenities_h3.json", _records(t.amenity_hexes))

    sizes["score.json"] = _write_json(out / "score.json", {
        "weights": SCORE_WEIGHTS,
        "amenity_weights": AMENITY_WEIGHTS,
        "amenity_radius_m": SCORE_AMENITY_RADIUS_M,
        "distributions": t.score_distributions,
    })

    sizes["projects.json"] = _write_json(out / "projects.json", _records(t.projects))
    sizes["developers.json"] = _write_json(out / "developers.json", _records(t.developers))
    sizes["rents_bedrooms.json"] = _write_json(out / "rents_bedrooms.json", _records(t.bedroom_rents))
    sizes["memos.json"] = _write_json(out / "memos.json", memos or {})

    detail = out / "sales_detail.parquet"
    con.execute(f"""
        copy (
            select date, community_id, market, ptype, rooms,
                   round(size_sqft)::integer as size_sqft, price, psf::float as psf, price_band,
                   project_name, building_name
            from sales_clean
            where date >= date '{w.detail_start.isoformat()}' and community_id is not null
            order by community_id, date
        ) to '{detail.as_posix()}' (format parquet, compression zstd, row_group_size 100000)
    """)
    sizes["sales_detail.parquet"] = detail.stat().st_size
    return sizes
