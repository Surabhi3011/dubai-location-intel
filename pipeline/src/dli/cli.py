"""`dli` — Dubai Location Intelligence pipeline. `dli run all` rebuilds everything."""

from __future__ import annotations

import json
import shutil
import time

import duckdb
import polars as pl
import typer

from dli.config import INTERIM, OUTPUT, RAW, REFERENCE, ROOT

app = typer.Typer(add_completion=False, help=__doc__)
run_app = typer.Typer(help="Run pipeline stages.")
app.add_typer(run_app, name="run")

SALES = RAW / "hf_dred_sales" / "dld_sales_transactions.parquet"


def _step(name: str):
    typer.secho(f"\n▶ {name}", fg=typer.colors.CYAN, bold=True)
    return time.perf_counter()


def _done(t0: float, msg: str = ""):
    typer.secho(f"  ✓ {time.perf_counter() - t0:.1f}s {msg}", fg=typer.colors.GREEN)


@run_app.command("fetch")
def fetch(force: bool = False):
    """Download all sources into data/raw (cached)."""
    from dli.fetch.sources import fetch_all

    t0 = _step("fetch")
    m = fetch_all(force=force)
    _done(t0, f"{len(m)} sources")


@run_app.command("osm")
def osm():
    """Extract Dubai boundaries, stations and amenities from the OSM extract."""
    from dli.spatial.osm_extract import extract

    t0 = _step("osm extract")
    _done(t0, str(extract(RAW / "osm" / "gcc-states-latest.osm.pbf", INTERIM / "osm")))


@run_app.command("crosswalk")
def crosswalk():
    """Build DM communities and the DLD area -> community crosswalk. Fails on unmatched areas."""
    from dli.clean.crosswalk import build
    from dli.spatial.boundaries import build as build_boundaries

    t0 = _step("communities + crosswalk")
    g = build_boundaries(RAW / "boundaries")
    INTERIM.mkdir(parents=True, exist_ok=True)
    g.to_parquet(INTERIM / "communities.parquet")
    areas = duckdb.sql(f"""
        select area_id, any_value(area_name_en) area_name_en,
               count(*) filter (where instance_date >= current_date - interval 5 year) n_sales_5y
        from '{SALES.as_posix()}' where area_id is not null group by 1
    """).pl()
    dm = pl.DataFrame({"dm_community_id": g.community_id.tolist(), "dm_community_name": g.community_name.tolist()})
    cw = build(areas, dm, REFERENCE / "community_crosswalk_overrides.csv")
    # Fuzzy matches were reviewed by hand on 2026-10-17; new fuzzy matches surface as unverified.
    reviewed = REFERENCE / "community_crosswalk.csv"
    if reviewed.exists():
        prev = pl.read_csv(reviewed, schema_overrides={"dm_community_id": pl.String})
        ok = {(r["dld_area_id"], r["dm_community_id"]) for r in prev.filter(pl.col("verified")).iter_rows(named=True)}
        cw = cw.with_columns(
            pl.struct("dld_area_id", "dm_community_id", "verified")
            .map_elements(lambda r: r["verified"] or (r["dld_area_id"], r["dm_community_id"]) in ok,
                          return_dtype=pl.Boolean)
            .alias("verified")
        )
    cw.write_csv(reviewed)
    bad = cw.filter(pl.col("dm_community_id").is_null() & (pl.col("n_sales_5y") > 0)
                    & (pl.col("match_method") != "manual_excluded"))
    unverified = cw.filter(~pl.col("verified") & (pl.col("n_sales_5y") > 0))
    if bad.height or unverified.height:
        typer.secho("Crosswalk needs review (add rows to community_crosswalk_overrides.csv):", fg="red")
        typer.echo(pl.concat([bad, unverified]).unique().select("dld_area_id", "dld_area_name", "dm_community_name",
                                                                 "match_method", "n_sales_5y"))
        raise typer.Exit(1)
    _done(t0, f"{len(g)} communities, {cw.height} DLD areas")


@run_app.command("all")
def run_all(fetch_sources: bool = True, memos: bool = True, max_new_memos: int = 200):
    """fetch -> osm -> crosswalk -> clean -> aggregate -> validate -> memos -> export."""
    from dli.aggregate.build import build
    from dli.clean.sales import clean
    from dli.export.web import export
    from dli.memos.generate import generate
    from dli.validate.checks import run as validate

    if fetch_sources:
        fetch()
    if not (INTERIM / "osm" / "osm_amenities_dubai.parquet").exists():
        osm()
    crosswalk()

    con = duckdb.connect()
    t0 = _step("clean sales")
    stats = clean(con, SALES, REFERENCE / "community_crosswalk.csv", INTERIM / "sales_clean.parquet")
    _done(t0, str(stats))

    t0 = _step("aggregate")
    tables = build(con)
    _done(t0, f"{int(tables.community_kpis.active.sum())} active communities")

    t0 = _step("validate")
    cw = pl.read_csv(REFERENCE / "community_crosswalk.csv", schema_overrides={"dm_community_id": pl.String})
    problems = validate(tables, cw)
    if problems:
        for p in problems:
            typer.secho(f"  ✗ {p}", fg="red")
        raise typer.Exit(1)
    _done(t0)

    t0 = _step("memos")
    memo_map = generate(tables, ROOT / "data" / "memos" / "memos.json", max_new=max_new_memos, use_ai=memos)
    n_ai = sum(m["source"] == "ai" for m in memo_map.values())
    _done(t0, f"{len(memo_map)} memos ({n_ai} AI, {len(memo_map) - n_ai} template)")

    t0 = _step("export")
    sizes = export(tables, con, OUTPUT, memo_map)
    total = sum(sizes.values())
    _done(t0, f"{len(sizes)} files, {total / 1e6:.1f} MB")
    for name, size in sorted(sizes.items(), key=lambda x: -x[1]):
        typer.echo(f"    {size / 1e3:>9,.0f} KB  {name}")


@app.command("publish")
def publish():
    """Copy data/output into web/public/data for the frontend build."""
    dest = ROOT / "web" / "public" / "data"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(OUTPUT, dest)
    typer.echo(json.dumps({"copied_to": str(dest)}))


if __name__ == "__main__":
    app()
