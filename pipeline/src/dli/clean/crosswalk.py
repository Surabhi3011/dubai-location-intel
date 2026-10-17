"""Build the DLD area -> Dubai Municipality community crosswalk.

Match order (plan.md §5.1): exact ID -> normalized name -> fuzzy name -> manual override.
Manual overrides live in data/reference/community_crosswalk_overrides.csv and always win.
"""

from __future__ import annotations

import re
from pathlib import Path

import polars as pl
from rapidfuzz import fuzz, process

ORDINALS = {
    "1": "first", "2": "second", "3": "third", "4": "fourth", "5": "fifth",
    "6": "sixth", "7": "seventh", "8": "eighth", "9": "ninth", "10": "tenth",
    "11": "eleventh",
}
REPLACEMENTS = [
    (r"\bind\.?\b", "industrial"),
    (r"\bjabal\b", "jebel"),
    (r"\bqouz\b", "quoz"),
    (r"\bjumeira\b", "jumeirah"),
    (r"\bnadd\b", "nad"),
    (r"\bal\s", "al "),
]


def normalize(name: str | None) -> str:
    if not name:
        return ""
    s = name.lower().replace("'", "").replace("`", "").replace("’", "")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    for pat, rep in REPLACEMENTS:
        s = re.sub(pat, rep, s)
    s = " ".join(ORDINALS.get(tok, tok) for tok in s.split())
    return s.strip()


def build(dld_areas: pl.DataFrame, dm: pl.DataFrame, overrides_path: Path) -> pl.DataFrame:
    """dld_areas: area_id, area_name_en, n_sales_5y. dm: dm_community_id, dm_community_name."""
    dm = dm.with_columns(pl.col("dm_community_name").map_elements(normalize, return_dtype=pl.String).alias("_norm"))
    norm_to_dm = dict(zip(dm["_norm"], zip(dm["dm_community_id"], dm["dm_community_name"])))
    choices = list(norm_to_dm)

    overrides: dict[int, tuple[str, str, str]] = {}
    if overrides_path.exists():
        for r in pl.read_csv(overrides_path, schema_overrides={"dm_community_id": pl.String}).iter_rows(named=True):
            overrides[r["dld_area_id"]] = (r["dm_community_id"], r["dm_community_name"], r.get("note") or "")

    rows = []
    for r in dld_areas.iter_rows(named=True):
        aid, name = r["area_id"], r["area_name_en"]
        norm = normalize(name)
        dm_id = dm_name = None
        method, score = "unmatched", 0.0
        if aid in overrides:
            dm_id, dm_name, _ = overrides[aid]
            method, score = ("manual", 100.0) if dm_id else ("manual_excluded", 0.0)
        elif norm in norm_to_dm:
            dm_id, dm_name = norm_to_dm[norm]
            method, score = "normalized_name", 100.0
        else:
            hit = process.extractOne(norm, choices, scorer=fuzz.token_sort_ratio)
            if hit and hit[1] >= 88:
                dm_id, dm_name = norm_to_dm[hit[0]]
                method, score = "fuzzy", float(hit[1])
            elif hit:
                score = float(hit[1])
                method = f"unmatched (best: {norm_to_dm[hit[0]][1]})"
        rows.append(
            {
                "dld_area_id": aid,
                "dld_area_name": name,
                "dm_community_id": dm_id,
                "dm_community_name": dm_name,
                "match_method": method,
                "match_score": score,
                "n_sales_5y": r["n_sales_5y"],
                "verified": method in ("manual", "manual_excluded", "normalized_name"),
            }
        )
    return pl.DataFrame(rows).sort("n_sales_5y", descending=True)
