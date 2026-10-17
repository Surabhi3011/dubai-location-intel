"""Fail the build on bad data (architecture.md §4, stage 6)."""

from __future__ import annotations

import pandera.pandas as pa
import polars as pl
from pandera.pandas import Check, Column

from dli.aggregate.build import Tables

city_monthly_schema = pa.DataFrameSchema(
    {
        "month": Column(str, Check.str_matches(r"^\d{4}-\d{2}$"), unique=True),
        "sales": Column(int, Check.ge(0)),
        "value_aed": Column(float, Check.ge(0), nullable=True, coerce=True),
        "psf": Column(float, Check.in_range(200, 10000), nullable=True),
        "psf_index": Column(float, Check.in_range(10, 1000), nullable=True),
    },
    strict=False,
)

community_schema = pa.DataFrameSchema(
    {
        "community_id": Column(str, unique=True),
        "community_name": Column(str),
        "land_area_km2": Column(float, Check.gt(0)),
        "sales_12m": Column(int, Check.ge(0)),
        "psf_12m": Column(float, Check.in_range(100, 20000), nullable=True),
        "yield_pct": Column(float, Check.in_range(1, 15), nullable=True),
        "offplan_share_12m": Column(float, Check.in_range(0, 100), nullable=True),
        # Hatta exclave is ~84 km from the nearest metro station.
        "metro_dist_m": Column(float, Check.in_range(0, 150000), nullable=True),
        "location_score": Column(float, Check.in_range(0, 100), nullable=True),
        "supply_pressure": Column(float, Check.ge(0), nullable=True),
    },
    strict=False,
)


def run(t: Tables, crosswalk: pl.DataFrame) -> list[str]:
    city_monthly_schema.validate(t.city_monthly, lazy=True)
    community_schema.validate(t.community_kpis, lazy=True)

    problems: list[str] = []
    unmatched = crosswalk.filter(pl.col("dm_community_id").is_null() & (pl.col("n_sales_5y") > 0)
                                 & (pl.col("match_method") != "manual_excluded"))
    if unmatched.height:
        problems.append(f"crosswalk: {unmatched.height} DLD areas with recent sales are unmatched: "
                        f"{unmatched['dld_area_name'].to_list()}")
    if len(t.community_kpis) < 200:
        problems.append(f"only {len(t.community_kpis)} communities (expected ~224)")
    if t.community_kpis["active"].sum() < 50:
        problems.append("fewer than 50 active communities — sales join likely broken")
    if len(t.stations) < 50:
        problems.append(f"only {len(t.stations)} stations extracted from OSM")
    if t.community_kpis.loc[t.community_kpis.active, "location_score"].isna().any():
        problems.append("active community without a Location Score")
    return problems
