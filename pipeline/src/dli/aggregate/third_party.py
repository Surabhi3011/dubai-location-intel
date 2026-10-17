"""Attach datadubai aggregates (rents, yields, projects, developers) to DM communities.

datadubai reports rents/yields per *marketing* community (e.g. "Jumeirah Village Circle"), each tied to
its main DLD area (`top_area`). We map top_area -> DM community through the crosswalk. When several
marketing communities land in one DM community, values are combined as a contract-weighted mean of
their medians and flagged `rent_approx`.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl

from dli.clean.crosswalk import normalize


def _area_lookup(crosswalk: pl.DataFrame) -> dict[str, str]:
    lk = {}
    for r in crosswalk.filter(pl.col("dm_community_id").is_not_null()).iter_rows(named=True):
        lk[normalize(r["dld_area_name"])] = str(r["dm_community_id"])
        lk[normalize(r["dm_community_name"])] = str(r["dm_community_id"])
    return lk


def marketing_communities(raw: Path, crosswalk: pl.DataFrame) -> pl.DataFrame:
    lk = _area_lookup(crosswalk)
    mc = pl.read_csv(raw / "communities.csv")
    return mc.with_columns(
        pl.col("top_area").map_elements(lambda a: lk.get(normalize(a)), return_dtype=pl.String).alias("community_id")
    )


def community_rents(mc: pl.DataFrame) -> pl.DataFrame:
    rents = mc.filter(pl.col("community_id").is_not_null() & pl.col("rent_median").is_not_null())
    return (
        rents.group_by("community_id")
        .agg(
            (pl.col("rent_median") * pl.col("n_rents")).sum().truediv(pl.col("n_rents").sum()).round(0).alias("rent_median"),
            pl.col("n_rents").sum().alias("rent_contracts_12m"),
            (pl.col("yield_pct") * pl.col("yield_n_rents")).sum().truediv(
                pl.col("yield_n_rents").filter(pl.col("yield_pct").is_not_null()).sum()
            ).round(2).alias("yield_pct"),
            pl.col("name").alias("rent_sources"),
            (pl.len() > 1).alias("rent_approx"),
        )
    )


def bedroom_rents(raw: Path, mc: pl.DataFrame) -> pl.DataFrame:
    cb = pl.read_csv(raw / "community_bedrooms.csv")
    return cb.join(
        mc.select(pl.col("slug").alias("community_slug"), "community_id"), on="community_slug", how="left"
    ).select(
        pl.col("community").alias("marketing_community"),
        "community_id",
        pl.col("code").alias("bedrooms"),
        pl.col("label"),
        pl.col("n").alias("sales_n"),
        "price_median", "psf_median", "sqft_median", "rent_median",
        pl.col("n_rents").alias("rent_contracts"),
        "yield_pct",
    )


def projects(raw: Path, crosswalk: pl.DataFrame, mc: pl.DataFrame) -> pl.DataFrame:
    lk = _area_lookup(crosswalk)
    mc_lk = dict(zip(mc["name"], mc["community_id"]))

    def area_from_street(street: str | None) -> str | None:
        if not street or "," not in street:
            return None
        return lk.get(normalize(street.rsplit(",", 1)[1]))

    p = pl.read_csv(raw / "projects.csv", try_parse_dates=True, infer_schema_length=2000)
    p = p.with_columns(
        pl.struct("street", "community")
        .map_elements(
            lambda r: area_from_street(r["street"]) or mc_lk.get(r["community"]), return_dtype=pl.String
        )
        .alias("community_id")
    )
    return p.select(
        pl.col("pn").alias("project_id"),
        "name", "status",
        pl.col("completion").alias("completion_pct"),
        pl.col("completion_date").cast(pl.Date),
        pl.col("start_date").cast(pl.Date),
        "developer", pl.col("developer_slug"),
        "total_units", "lat", "lng",
        pl.col("community").alias("marketing_community"),
        "community_id",
        pl.col("n").alias("sales_n"),
        "price_median", "psf_median", "offplan_share",
    )


def developers(raw: Path) -> pl.DataFrame:
    return pl.read_csv(raw / "developers.csv").select(
        "name", "slug", "n_projects", "units",
        pl.col("n").alias("sales_n"), "price_median", "psf_median", "offplan_share",
    )


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
