"""Clean DLD residential sales (plan.md §5.2) into data/interim/sales_clean.parquet."""

from __future__ import annotations

from pathlib import Path

import duckdb

from dli.config import MAX_UNIT_SQM, MIN_UNIT_SQM, SQFT_PER_SQM

EXCLUDED_SUBTYPES = (
    "Office", "Shop", "Hotel Rooms", "Hotel Apartment", "Show Rooms", "Warehouse", "Workshop",
)


def clean(con: duckdb.DuckDBPyConnection, sales_parquet: Path, crosswalk_csv: Path, out: Path) -> dict:
    excluded = ", ".join(f"'{s}'" for s in EXCLUDED_SUBTYPES)
    con.execute(f"""
        create or replace table sales_clean as
        with xw as (
            select dld_area_id, dm_community_id as community_id
            from read_csv('{crosswalk_csv.as_posix()}', types={{'dm_community_id': 'VARCHAR'}})
            where dm_community_id is not null
        ),
        base as (
            select
                s.transaction_id                                        as txn_id,
                s.instance_date                                         as date,
                s.area_id                                               as dld_area_id,
                xw.community_id,
                case when s.reg_type_label = 'Off-Plan' then 'offplan' else 'ready' end as market,
                case
                    when s.property_type_label = 'Villa' then 'villa'
                    when s.property_sub_type = 'Stacked Townhouses' then 'villa'
                    else 'apartment'
                end                                                     as ptype,
                s.rooms_bucket::tinyint                                 as rooms,
                s.area_sqm                                              as size_sqm,
                s.area_sqm * {SQFT_PER_SQM}                             as size_sqft,
                s.price_aed                                             as price,
                s.price_psf                                             as psf_raw,
                s.quality_flags,
                nullif(trim(s.project_name), '')                        as project_name,
                nullif(trim(s.master_project_name), '')                 as master_project,
                nullif(trim(s.building_name), '')                       as building_name
            from read_parquet('{sales_parquet.as_posix()}') s
            left join xw on xw.dld_area_id = s.area_id
            where s.usage_label = 'Residential'
              and s.property_type_label in ('Unit', 'Villa')
              and coalesce(s.property_sub_type, '') not in ({excluded})
              and (s.quality_flags & 16) = 0          -- BAD_DATE
              and s.instance_date >= date '2010-01-01'
        ),
        eligible as (
            select *,
                (quality_flags & (1 | 2 | 8)) = 0
                    and size_sqm between {MIN_UNIT_SQM} and {MAX_UNIT_SQM}
                    and psf_raw is not null                         as psf_candidate
            from base
        ),
        bands as (
            -- P1–P99 price/sqft band per community per year (plan §5.2)
            select community_id, year(date) as yr,
                   quantile_cont(psf_raw, 0.01) as p01,
                   quantile_cont(psf_raw, 0.99) as p99
            from eligible where psf_candidate
            group by all
        )
        select
            e.txn_id, e.date, date_trunc('month', e.date)::date as month,
            e.dld_area_id, e.community_id, e.market, e.ptype, e.rooms,
            round(e.size_sqm, 2) as size_sqm, round(e.size_sqft, 1) as size_sqft,
            case when (e.quality_flags & 1) = 0 then e.price end as price,
            case when e.psf_candidate and e.psf_raw between b.p01 and b.p99
                 then round(e.psf_raw, 2) end as psf,
            e.project_name, e.master_project, e.building_name,
            case
                when e.price < 1000000 then '<1M'
                when e.price < 2000000 then '1-2M'
                when e.price < 3000000 then '2-3M'
                when e.price < 5000000 then '3-5M'
                else '5M+'
            end as price_band
        from eligible e
        left join bands b on b.community_id = e.community_id and b.yr = year(e.date)
        order by e.date
    """)
    con.execute(f"copy sales_clean to '{out.as_posix()}' (format parquet, compression zstd)")
    stats = con.execute("""
        select count(*) n, count(community_id) n_mapped, count(psf) n_psf, max(date) max_date
        from sales_clean
    """).fetchone()
    return dict(zip(["rows", "mapped", "psf_rows", "max_date"], stats))
