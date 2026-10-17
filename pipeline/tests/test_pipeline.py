from datetime import date

import polars as pl

from dli.aggregate.build import Windows
from dli.clean.crosswalk import build, normalize
from dli.memos.generate import fact_check, template_memo


def test_normalize_handles_spelling_variants():
    assert normalize("AL QOUZ IND.FOURTH") == normalize("Al Quoz Industrial 4")
    assert normalize("Jabal Ali First") == normalize("Jebel Ali 1")
    assert normalize("Me'aisem First") == "meaisem first"


def test_crosswalk_prefers_override(tmp_path):
    overrides = tmp_path / "o.csv"
    overrides.write_text("dld_area_id,dld_area_name,dm_community_id,dm_community_name,note\n"
                         "410,Palm Jumeirah,381,Nakhlat Jumeira,x\n")
    dld = pl.DataFrame({"area_id": [410, 1], "area_name_en": ["Palm Jumeirah", "Al Barsha First"],
                        "n_sales_5y": [100, 5]})
    dm = pl.DataFrame({"dm_community_id": ["381", "373"], "dm_community_name": ["Nakhlat Jumeira", "Al Barsha First"]})
    cw = {r["dld_area_id"]: r for r in build(dld, dm, overrides).iter_rows(named=True)}
    assert cw[410]["dm_community_id"] == "381" and cw[410]["match_method"] == "manual"
    assert cw[1]["dm_community_id"] == "373" and cw[1]["match_method"] == "normalized_name"


def test_windows_use_complete_months_only():
    w = Windows.from_data_end(date(2026, 10, 5))
    assert w.w12_end == date(2026, 10, 1)
    assert w.w12_start == date(2025, 10, 1)
    assert w.p12_start == date(2024, 10, 1)
    assert w.w3_start == date(2026, 7, 1)
    full = Windows.from_data_end(date(2026, 9, 30))
    assert full.w12_end == date(2026, 10, 1)


FACTS = {
    "community": "Test Bay", "period": "Oct 2025 to Sep 2026", "data_through": "05 Oct 2026",
    "sales_12m": 1234, "median_price_per_sqft_aed": 1840.0, "dubai_median_price_per_sqft_aed": 1722.0,
    "price_per_sqft_change_12m_pct": 5.2, "price_per_sqft_change_3m_pct": -1.1, "gross_yield_pct": 6.25,
    "offplan_share_pct": 61.3, "nearest_station": "Test Station", "nearest_station_distance_m": 450.0,
    "units_completing_next_24m": 3000, "median_price_aed": 1250000.0,
    "peers": [{"community": "Peer A", "median_price_per_sqft_aed": 1800.0}],
}


def test_fact_check_accepts_known_numbers_and_formats():
    memo = "Sales were 1,234 at 1,840 AED/sqft (Dubai: 1,722), yield 6.25%, change 5.2%, AED 1.25M median."
    assert fact_check(memo, FACTS) == []


def test_fact_check_rejects_invented_numbers():
    assert fact_check("Prices rose 9.7% and yield is 7.1%.", FACTS) == [9.7, 7.1]


def test_template_memo_passes_fact_check():
    assert fact_check(template_memo(FACTS), FACTS) == []
