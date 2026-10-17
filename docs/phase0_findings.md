# Phase 0 — Data validation findings

Run: 17 Oct 2026. Raw downloads live in `data/raw/` (git-ignored). `dli fetch` records each one (URL, sha256, timestamp) in `data/raw/manifest.json`.

## 1. Access check

| Planned source | Result | What we use instead |
|---|---|---|
| Dubai Pulse bulk CSVs (D1–D8, L1–L5) | **Blocked.** dubaipulse.gov.ae refuses TCP connections from India IPs | Mirrors below |
| data.dubai (new Dubai Data platform) | **Blocked.** WAF returns "Request Rejected", in a real browser too | Mirrors below |
| DLD website open-data search | Reachable, but queries are **reCAPTCHA-gated**, so we don't automate it | Not used |
| OpenStreetMap (Geofabrik GCC extract) | OK, 255 MB, md5 verified | L4 stations, L6 amenities, parks, beaches |
| Overpass API | Unreliable (5xx) | Geofabrik extract instead |

Decision (user, 17 Oct 2026): build v1 on fallbacks and attributed CC BY 4.0 mirrors. Official Dubai Pulse files can replace them later via `data/raw/dubai_pulse/`.

## 2. Sources in use

| ID | Dataset | Source | Licence | Coverage |
|---|---|---|---|---|
| D1 | Row-level sales (1,372,277 rows) | HF `dubairealestatedata/dubai-real-estate-sales-transactions` (DLD via Dubai Pulse + DLD gateway) | CC BY 4.0 | 2004 → **5 Oct 2026** |
| D2* | Rents and yields, last 12 months, by community and bedroom | GitHub `datadubai/dubai-real-estate-dld` (Ejari) | CC BY 4.0 | 12-month snapshot, data through 9 Oct 2026 |
| D3* | Project register (770 projects: 558 active, 211 finished) | same | CC BY 4.0 | snapshot |
| D6* | Developers (367) | same | CC BY 4.0 | snapshot |
| D7* | Official price index | **not available.** Replaced by our own monthly median price/sqft | — | — |
| L1 | DM community polygons (224) | GitHub mirrors of DM community layer + `trivoslabs/dubai-communities` names (layer Community_20260815) | Dubai Data Open Data Licence (attribution) | Aug 2026 names |
| L4 | Metro (66) and tram (14) stations | OSM | ODbL | Oct 2026 |
| L5/L6 | 11,184 amenity points: restaurants 4,239, parks 3,006, retail 1,634, offices 1,383, healthcare 405, schools 349, beaches 168 | OSM | ODbL | Oct 2026 |

\* = aggregated by a third party, not row-level.

## 3. Answers to plan §13 open questions

| Question | Answer |
|---|---|
| Dubai Pulse access requirements | Geo-blocked from India; could not test registration/OAuth |
| Bedrooms present in sales? | **Yes**: 99.4% of off-plan and 94.5% of ready residential sales since Oct 2021 (`rooms_bucket` 0 = studio … 5 = 5+) |
| Bedrooms in rents? | Only as aggregates (community × bedroom) |
| Sales ↔ projects join? | Partly. Sales carry `project_name` for about 92% of rows. The project file has names, so we join on normalized name |
| Ejari new vs renewed? | Not available (no row-level rents) |
| RTA stations current? | RTA file blocked; **OSM is primary** (66 metro + 14 tram) |
| Licence wording | DLD data: CC BY 4.0 per both mirrors. DM layer: Dubai Data Open Data Licence. OSM: ODbL. Attribution text is in `DATA_LICENSE.md` |

## 4. Crosswalk (DLD area → DM community)

- 202 DLD area IDs: 133 exact-name, 41 fuzzy (each reviewed by hand), 28 manual overrides (`data/reference/community_crosswalk_overrides.csv`). The rest are legacy areas with no sales in the last 5 years.
- **100% of sales in the last 5 years map to a community.**
- Notable overrides: Palm Jumeirah → Nakhlat Jumeira; legacy "Jabal Ali" (Discovery Gardens) → Jabal Ali First; legacy "Nad Al Shiba" (Silicon Oasis) → Nadd Hessa; Al Yufrah 3/4 → renumbered DM communities.

## 5. Consequences for plan scope (v1)

| Plan item | Status in v1 |
|---|---|
| Mortgage-to-sales KPI | **Dropped.** The sales file contains Sales only |
| Official DLD price index line | Replaced by our median price/sqft index (Jan 2020 = 100) |
| Rent trend (monthly), 12m rent growth, rent KPI deltas | **Deferred.** No rent time series |
| Rental contracts registered | Last-12-month total only |
| New vs renewed contracts | Deferred |
| Population, density (L3) | **Deferred.** DSC file blocked. Location Score drops nothing it depends on |
| Transaction velocity per 1,000 units, supply pressure ratio | Units register (D4) blocked. Velocity becomes **sales per km²**. Supply pressure becomes **upcoming units ÷ trailing-12m sales** (labelled as a proxy) |
| Rental demand in Location Score | Becomes rent contracts per km² |
| Project map | Only 114 projects have coordinates. The rest are placed at their community and shown aggregated |
| Comparable sales | Available (row-level, no unit numbers in the source) |

## 6. Data quality notes
- `quality_flags = 0` on 97.9% of rows since Oct 2021. We use the flagged P1–P99 trim, then re-trim per community-year per plan §5.2.
- `Unit` includes hotel apartments, offices and shops. Price stats keep `usage = Residential` and `property_sub_type` ∈ {Flat, Villa, Stacked Townhouses, NULL-villa}.
- The datadubai project file covers only about 770 projects (those with sales). The full DLD register is larger, so supply figures are a lower bound.
