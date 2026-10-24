"""Compute every KPI table the web app needs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
import polars as pl
from dateutil.relativedelta import relativedelta

from dli.aggregate import third_party as tp
from dli.config import INTERIM, MIN_RECORDS, RAW, REFERENCE, SCORE_WEIGHTS, SQL_DIR
from dli.spatial import enrich


@dataclass
class Windows:
    data_end: date
    last_full_month: date
    w12_start: date
    w12_end: date  # exclusive
    p12_start: date
    w3_start: date
    p3_start: date
    w24_start: date
    detail_start: date

    @classmethod
    def from_data_end(cls, data_end: date) -> Windows:
        this_month = data_end.replace(day=1)
        # A month is complete only if data runs to its last day.
        next_month = this_month + relativedelta(months=1)
        w12_end = next_month if data_end >= next_month - relativedelta(days=1) else this_month
        last_full = w12_end - relativedelta(months=1)
        return cls(
            data_end=data_end,
            last_full_month=last_full,
            w12_start=w12_end - relativedelta(months=12),
            w12_end=w12_end,
            p12_start=w12_end - relativedelta(months=24),
            w3_start=w12_end - relativedelta(months=3),
            p3_start=w12_end - relativedelta(months=6),
            w24_start=w12_end - relativedelta(months=24),
            detail_start=w12_end - relativedelta(years=5),
        )


@dataclass
class Tables:
    windows: Windows
    city_monthly: pd.DataFrame
    city_kpis: dict
    price_bands: pd.DataFrame
    top_communities: pd.DataFrame
    daily: pd.DataFrame
    communities: gpd.GeoDataFrame
    community_kpis: pd.DataFrame
    community_monthly: pd.DataFrame
    bedroom_rents: pd.DataFrame
    market_bedrooms: pd.DataFrame
    projects: pd.DataFrame
    developers: pd.DataFrame
    stations: gpd.GeoDataFrame
    amenities: gpd.GeoDataFrame
    amenity_hexes: pd.DataFrame
    score_distributions: dict
    aliases: pd.DataFrame
    extra: dict = field(default_factory=dict)


def _sql(name: str) -> str:
    return (SQL_DIR / f"{name}.sql").read_text()


def _pct_change(new, old):
    return None if (old is None or new is None or pd.isna(old) or pd.isna(new) or old == 0) else round((new / old - 1) * 100, 1)


def _percentile_rank(s: pd.Series, higher_is_better: bool) -> pd.Series:
    r = s.rank(pct=False, method="average", ascending=higher_is_better)
    n = s.notna().sum()
    return ((r - 1) / (n - 1) * 100).round(1) if n > 1 else r * np.nan


def city_tables(con: duckdb.DuckDBPyConnection, w: Windows):
    monthly = con.execute(_sql("city_monthly")).df()
    base = monthly[monthly["month"].between("2020-01", "2020-12")]["psf"].mean()
    monthly["psf_index"] = (monthly["psf"] / base * 100).round(1)

    def window_kpis(start, end):
        r = con.execute(
            """
            select count(*) sales, sum(price) value_aed, median(psf) psf,
                   avg(case when market='offplan' then 1.0 else 0 end) * 100 offplan_share
            from sales_clean where month >= ? and month < ?
            """,
            [start, end],
        ).fetchone()
        active = con.execute(
            """select count(*) from (select community_id from sales_clean
               where month >= ? and month < ? and community_id is not null
               group by 1 having count(*) >= ?)""",
            [start, end, MIN_RECORDS],
        ).fetchone()[0]
        return dict(zip(["sales", "value_aed", "psf", "offplan_share"], r)) | {"active_communities": active}

    cur = window_kpis(w.w12_start, w.w12_end)
    prev = window_kpis(w.p12_start, w.w12_start)
    kpis = {
        k: {"value": round(cur[k], 2) if cur[k] is not None else None,
            "prev": round(prev[k], 2) if prev[k] is not None else None,
            "change_pct": _pct_change(cur[k], prev[k])}
        for k in cur
    }
    kpis["offplan_share"]["change_pp"] = round(cur["offplan_share"] - prev["offplan_share"], 1)

    bands = con.execute(
        """select price_band, count(*) sales from sales_clean
           where month >= ? and month < ? and price is not null group by 1""",
        [w.w12_start, w.w12_end],
    ).df()
    top = con.execute(
        """select community_id, count(*) sales, sum(price) value_aed from sales_clean
           where month >= ? and month < ? and community_id is not null group by 1""",
        [w.w12_start, w.w12_end],
    ).df()
    daily = con.execute(
        """select strftime(date, '%Y-%m-%d') as date, count(*) sales from sales_clean
           where date > ? group by 1 order by 1""",
        [w.data_end - relativedelta(years=1)],
    ).df()
    return monthly, kpis, bands, top, daily


def build(con: duckdb.DuckDBPyConnection) -> Tables:
    data_end = con.execute("select max(date) from sales_clean").fetchone()[0]
    w = Windows.from_data_end(data_end)
    for k, v in w.__dict__.items():
        con.execute(f"set variable {k} = date '{v.isoformat()}'")

    monthly, city_kpis, bands, top, daily = city_tables(con, w)

    communities = gpd.read_parquet(INTERIM / "communities.parquet")
    stations = gpd.read_parquet(INTERIM / "osm" / "osm_stations_dubai.parquet")
    amenities = gpd.read_parquet(INTERIM / "osm" / "osm_amenities_dubai.parquet")
    ctx = enrich.community_context(communities, stations, amenities)

    sales = con.execute(_sql("community_sales")).df()
    cm = con.execute(_sql("community_monthly")).df()

    crosswalk = pl.read_csv(REFERENCE / "community_crosswalk.csv", schema_overrides={"dm_community_id": pl.String})
    mc = tp.marketing_communities(RAW / "datadubai", crosswalk)
    rents = tp.community_rents(mc).to_pandas()
    rents["rent_sources"] = rents["rent_sources"].map(lambda xs: list(xs))
    projects = tp.projects(RAW / "datadubai", crosswalk, mc).to_pandas()

    # Supply per community.
    proj = projects.copy()
    proj["completion_date"] = pd.to_datetime(proj["completion_date"])
    end = pd.Timestamp(data_end)
    active = proj[proj["status"] == "Active"]
    supply = active.groupby("community_id").agg(
        projects_active=("project_id", "count"),
        units_pipeline=("total_units", "sum"),
        avg_completion_pct=("completion_pct", "mean"),
    )
    supply["units_next_12m"] = active[active.completion_date.between(end, end + pd.DateOffset(months=12))].groupby("community_id")["total_units"].sum()
    supply["units_next_24m"] = active[active.completion_date.between(end, end + pd.DateOffset(months=24))].groupby("community_id")["total_units"].sum()
    supply["projects_delayed"] = active[(active.completion_date < end) & (active.completion_pct < 100)].groupby("community_id")["project_id"].count()
    supply = supply.fillna({"units_next_12m": 0, "units_next_24m": 0, "projects_delayed": 0}).reset_index()

    k = (
        communities.drop(columns="geometry")
        .merge(sales, on="community_id", how="left")
        .merge(ctx, on="community_id", how="left")
        .merge(rents, on="community_id", how="left")
        .merge(supply, on="community_id", how="left")
    )
    for c in ["sales_12m", "sales_prev_12m", "offplan_12m", "projects_active", "units_pipeline",
              "units_next_12m", "units_next_24m", "projects_delayed", "rent_contracts_12m"]:
        k[c] = k[c].fillna(0).astype(int)

    # Suppress thin samples (plan §5.2).
    for col, n in [("psf_12m", "n_psf_12m"), ("psf_apartment_12m", "n_psf_12m"), ("psf_villa_12m", "n_psf_12m"),
                   ("price_12m", "n_psf_12m"), ("psf_prev_12m", "n_psf_prev_12m"),
                   ("psf_3m", "n_psf_3m"), ("psf_prev_3m", "n_psf_prev_3m")]:
        k.loc[k[n].fillna(0) < MIN_RECORDS, col] = np.nan
    k["psf_change_12m"] = [_pct_change(a, b) for a, b in zip(k.psf_12m, k.psf_prev_12m)]
    k["psf_change_3m"] = [_pct_change(a, b) for a, b in zip(k.psf_3m, k.psf_prev_3m)]
    k["sales_change_12m"] = [_pct_change(a, b) if b >= MIN_RECORDS else None for a, b in zip(k.sales_12m, k.sales_prev_12m)]
    k["offplan_share_12m"] = np.where(k.sales_12m >= MIN_RECORDS, (k.offplan_12m / k.sales_12m * 100).round(1), np.nan)
    k["sales_per_km2"] = (k.sales_12m / k.land_area_km2).round(1)
    thin_rents = k.rent_contracts_12m < MIN_RECORDS
    k.loc[thin_rents, ["rent_median", "yield_pct"]] = np.nan
    k["rent_contracts_per_km2"] = (k.rent_contracts_12m / k.land_area_km2).round(1).where(k.rent_median.notna())
    k["supply_pressure"] = np.where(k.sales_12m >= MIN_RECORDS, (k.units_next_24m / k.sales_12m).round(2), np.nan)
    k["active"] = k.sales_12m >= MIN_RECORDS
    for c in ["psf_12m", "psf_apartment_12m", "psf_villa_12m", "psf_3m", "psf_prev_12m", "price_12m", "avg_completion_pct"]:
        k[c] = k[c].round(1)

    # Location Score (plan §9) over active communities.
    comp = {
        "transit": ("metro_dist_m", False),
        "amenities": ("amenity_score_raw", True),
        "yield": ("yield_pct", True),
        "momentum": ("psf_change_12m", True),
        "rental_demand": ("rent_contracts_per_km2", True),
        "supply_risk": ("supply_pressure", False),
    }
    act = k[k.active].copy()
    for name, (col, hib) in comp.items():
        act[f"score_{name}"] = _percentile_rank(pd.to_numeric(act[col], errors="coerce"), hib)
    score_cols = [f"score_{n}" for n in comp]
    weights = pd.Series({f"score_{n}": SCORE_WEIGHTS[n] for n in comp})
    present = act[score_cols].notna()
    # Missing components count as neutral (50th percentile) so thin data neither helps nor hurts;
    # such communities carry the "limited data" badge.
    act["location_score"] = act[score_cols].fillna(50).mul(weights).sum(axis=1).round(0)
    act["score_components"] = present.sum(axis=1)
    act["limited_data"] = act["score_components"] < len(comp)
    k = k.merge(act[["community_id", *score_cols, "location_score", "score_components", "limited_data"]], on="community_id", how="left")

    # Ranks among active communities (1 = highest value).
    for col in ["psf_12m", "rent_median", "yield_pct", "psf_change_12m", "sales_12m", "location_score", "sales_per_km2"]:
        k[f"rank_{col}"] = k[col].where(k.active).rank(ascending=False, method="min")

    distributions = {
        "metro_dist_m": enrich.nearest_distances_distribution(act["metro_dist_m"]),
        "amenity_score_raw": enrich.nearest_distances_distribution(act["amenity_score_raw"]),
    }

    # Aliases: marketing names -> DM community (search, plan §5.1).
    aliases = mc.filter(pl.col("community_id").is_not_null()).select(
        pl.col("name").alias("alias"), "community_id"
    ).to_pandas()
    master = con.execute(
        """select master_project as alias, community_id, count(*) n from sales_clean
           where master_project is not null and community_id is not null and month >= getvariable('w24_start')
           group by master_project, community_id qualify row_number() over (partition by master_project order by n desc) = 1 and n >= 20"""
    ).df()[["alias", "community_id"]]
    aliases = pd.concat([aliases, master]).drop_duplicates("alias")

    market_bedrooms = pd.read_csv(RAW / "datadubai" / "market_bedrooms.csv")
    names = communities.set_index("community_id")["community_name"]
    top["community_name"] = top["community_id"].map(names)

    return Tables(
        windows=w,
        city_monthly=monthly,
        city_kpis=city_kpis,
        price_bands=bands,
        top_communities=top,
        daily=daily,
        communities=communities,
        community_kpis=k,
        community_monthly=cm,
        bedroom_rents=tp.bedroom_rents(RAW / "datadubai", mc).to_pandas(),
        market_bedrooms=market_bedrooms,
        projects=projects,
        developers=tp.developers(RAW / "datadubai").to_pandas(),
        stations=stations,
        amenities=amenities,
        amenity_hexes=enrich.amenity_hexes(amenities),
        score_distributions=distributions,
        aliases=aliases,
    )
