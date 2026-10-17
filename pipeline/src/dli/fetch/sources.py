"""Source registry and polite, cached downloads. Every file is recorded in data/raw/manifest.json."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

from dli.config import RAW

UA = "dubai-location-intel/0.1 (+https://github.com/surabhigeo/dubai-location-intel)"
HF_SALES = "https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions/resolve/main"
DATADUBAI = "https://raw.githubusercontent.com/datadubai/dubai-real-estate-dld/HEAD"
DATADUBAI_FILES = [
    "areas", "communities", "community_bedrooms", "community_monthly", "community_yearly",
    "developers", "market_bedrooms", "market_monthly", "market_yearly", "projects",
    "rents_by_community", "yields_by_community",
]


@dataclass(frozen=True)
class Source:
    key: str
    url: str
    dest: str  # relative to data/raw
    licence: str
    attribution: str


SOURCES: list[Source] = [
    Source(
        "dld_sales",
        f"{HF_SALES}/dld_sales_transactions.parquet",
        "hf_dred_sales/dld_sales_transactions.parquet",
        "CC BY 4.0",
        "Dubai Real Estate Data (dubairealestatedata.com), based on Dubai Land Department open data",
    ),
    Source("dld_sales_dictionary", f"{HF_SALES}/DATA_DICTIONARY.md", "hf_dred_sales/DATA_DICTIONARY.md", "CC BY 4.0", ""),
    Source("dld_sales_manifest", f"{HF_SALES}/export-manifest.json", "hf_dred_sales/export-manifest.json", "CC BY 4.0", ""),
    *[
        Source(
            f"datadubai_{name}",
            f"{DATADUBAI}/data/{name}.csv",
            f"datadubai/{name}.csv",
            "CC BY 4.0",
            "Dubai Data (datadubai.ae), based on Dubai Land Department open data",
        )
        for name in DATADUBAI_FILES
    ],
    Source("datadubai_readme", f"{DATADUBAI}/README.md", "datadubai/README.md", "CC BY 4.0", ""),
    Source(
        "dm_communities",
        "https://raw.githubusercontent.com/martaferreirahuspy/dubai-realestate-gis/main/dubai_communities.geojson",
        "boundaries/dm_communities_martaferreira.geojson",
        "Dubai Data Open Data Licence",
        "Dubai Municipality community layer",
    ),
    Source(
        "dm_communities_older",
        "https://raw.githubusercontent.com/Krishna99008594/MapFiles/main/Community.geojson",
        "boundaries/dm_communities_krishna.geojson",
        "Dubai Data Open Data Licence",
        "Dubai Municipality community layer",
    ),
    Source(
        "dm_community_names",
        "https://raw.githubusercontent.com/trivoslabs/dubai-communities/main/data/communities.json",
        "boundaries/trivoslabs_communities.json",
        "Dubai Data Open Data Licence",
        "Dubai Municipality GIS community layer Community_20260815, via Dubai Data (data.dubai)",
    ),
    Source(
        "osm_gcc",
        "https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf",
        "osm/gcc-states-latest.osm.pbf",
        "ODbL",
        "© OpenStreetMap contributors",
    ),
]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_all(force: bool = False, only: set[str] | None = None) -> dict:
    manifest_path = RAW / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    with httpx.Client(headers={"User-Agent": UA}, follow_redirects=True, timeout=600) as client:
        for src in SOURCES:
            if only and src.key not in only:
                continue
            dest = RAW / src.dest
            if dest.exists() and not force:
                manifest.setdefault(src.key, {}).update({"dest": src.dest, "sha256": _sha256(dest)})
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            for attempt in range(3):
                try:
                    with client.stream("GET", src.url) as r:
                        r.raise_for_status()
                        with tmp.open("wb") as f:
                            for chunk in r.iter_bytes(1 << 20):
                                f.write(chunk)
                    break
                except httpx.HTTPError:
                    if attempt == 2:
                        raise
            tmp.replace(dest)
            manifest[src.key] = {
                "url": src.url,
                "dest": src.dest,
                "licence": src.licence,
                "attribution": src.attribution,
                "sha256": _sha256(dest),
                "bytes": dest.stat().st_size,
                "fetched_at": datetime.now(UTC).isoformat(timespec="seconds"),
            }
    for src in SOURCES:
        manifest.setdefault(src.key, {}).update(
            {"url": src.url, "licence": src.licence, "attribution": src.attribution}
        )
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    return manifest
