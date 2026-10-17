# Dubai Location Intelligence Dashboard — Project Plan

> Working title. An open-source demo dashboard combining Dubai Land Department (DLD) open property data with location context (boundaries, population, transit, amenities) and an AI-written site memo.
>
> Author: Surabhi Gupta · Hosting: GitHub Pages · Status: Planning

---

## 1. Goal

Build a public, open-source dashboard that shows **range**: market analytics, maps, rental economics, supply tracking, spatial site analysis and AI-generated insights, all from free, legal, official data.

It serves two purposes:

1. **Portfolio / demo** — proof that I can turn messy public data into decision tools for real estate firms.
2. **Outreach asset** — something to share on LinkedIn, in GeoCloud Insights, and in direct messages to Dubai developers, brokerages and investment advisory firms.

### What "success" looks like for the demo

- Loads fast on a laptop and phone (first view under 3 seconds).
- Every number is traceable to a named public source.
- A first-time visitor understands each page in under 10 seconds.
- At least one "wow" moment: the map + Site Analyst + AI memo.
- A 60–90 second screen recording can walk through all pages.

---

## 2. Audience

| Audience | What they should take away |
|---|---|
| Real estate developers | Supply pipeline and absorption insight, location scoring for land/site decisions |
| Brokerages (mid-size, with analysts) | Community-level pricing, rent and yield intelligence they could brand for clients |
| Investment / advisory firms | Screening, comparison and a memo that saves analyst hours |
| GIS / data community | Clean open-source pipeline they can learn from or reuse |

---

## 3. Scope

### In scope (v1)
- Emirate of Dubai, **residential** property (apartments, villas/townhouses).
- Sales: last **5 years** in detail, full history only as yearly/monthly aggregates.
- Rents: Ejari contracts from 2023 onward (best data quality period).
- Projects pipeline: current snapshot of the DLD project register.
- Six dashboard pages (Section 7) plus an About/Data page.
- AI memos pre-generated for every community with enough data.

### Out of scope (v1)
- Commercial, industrial and land transactions (possible v2 page).
- Asking prices / listings data (Bayut, Property Finder). **No scraping.**
- User accounts, saved searches, payments.
- Predictive price models / forecasts (v2 candidate, clearly labelled if added).

---

## 4. Final data sources

### 4.1 Core property data — Dubai Land Department

| # | Dataset | Access route | Refresh | Used for |
|---|---|---|---|---|
| D1 | Sale transactions | Dubai Pulse bulk CSV (history) + DLD open-data gateway (recent) | Daily/weekly | Prices, volumes, momentum, off-plan share |
| D2 | Ejari rent contracts | Dubai Pulse bulk CSV + DLD gateway | Daily/weekly | Rents, yields, rental demand |
| D3 | Projects register | DLD gateway / Dubai Pulse | Weekly | Supply pipeline, developer tracker, delays |
| D4 | Units register | Dubai Pulse | Occasional | Housing stock per community |
| D5 | Buildings register | Dubai Pulse | Occasional | Stock, building counts |
| D6 | Developers register | DLD gateway | Occasional | Developer names / IDs |
| D7 | Residential sale price index | Dubai Pulse | Monthly | Official index line on Market Pulse |
| D8 | Area / community lookup | DLD gateway (area codes) | Rare | Joining DLD names to boundaries |

**License:** DLD open data, republished by third parties under CC BY 4.0. *Verify the license text on the DLD portal in Phase 0* and add attribution on every page.

### 4.2 Location context

| # | Dataset | Publisher | Used for |
|---|---|---|---|
| L1 | Community boundaries (`dm_community-open`) | Dubai Municipality via Dubai Pulse | Base polygons for every map and join |
| L2 | Sector boundaries (`dm_sectors-open`) | Dubai Municipality via Dubai Pulse | Higher-level grouping |
| L3 | Population by community | Dubai Statistics Center via Dubai Pulse | Density, growth, demand context |
| L4 | Metro & tram stations | RTA via Dubai Pulse (fallback: OpenStreetMap) | Transit access |
| L5 | Parks & beaches | Dubai Municipality via Dubai Pulse | Lifestyle amenities |
| L6 | Schools, hospitals/clinics, malls/supermarkets, offices, restaurants | OpenStreetMap (ODbL) | Amenity scores |
| L7 | Basemap | OpenStreetMap-based vector tiles | Map background |

### 4.3 Prototyping shortcut
- **datadubai/dubai-real-estate-dld** on GitHub (cleaned community-level aggregates: rents, yields, developers, projects). Use for the first prototype only; the final pipeline builds from raw DLD data so every number is our own and reproducible.

### 4.4 Explicitly excluded
- Listing portals (Bayut, Property Finder, Dubizzle) — no scraping.
- Any paid or login-restricted dataset that cannot be redistributed.

---

## 5. Data model and cleaning rules

### 5.1 Join keys
- **Community** is the master key. DLD uses `area_name_en` / area IDs; Dubai Municipality uses community IDs/names.
- Build a maintained crosswalk: `data/reference/community_crosswalk.csv`
  `dld_area_id, dld_area_name, dm_community_id, dm_community_name, match_method, verified`
- Match order: exact ID → normalized name → fuzzy name (manually verified) → manual override.
- Master/marketing names (e.g. "JVC", "Dubai Marina") get an `alias` column for search.

### 5.2 Cleaning rules
- Keep only completed **Sales** registrations for price stats (exclude mortgages and gifts from prices; keep them for the mortgage-share KPI).
- Residential only: apartments/units, villas, townhouses.
- Drop rows with missing price or area; drop area < 15 m² or > 5,000 m² for units.
- Remove price-per-sqft outliers outside the 1st–99th percentile **per community per year**.
- Convert m² to sq ft (× 10.7639) and keep both.
- Use **medians**, never means, for price and rent.
- Suppress any community-period metric with **fewer than 10 records** (show "insufficient data").
- Rents: single-property, new + renewed residential contracts; annualize where needed; exclude commercial.

### 5.3 Data freshness
- Every page shows "Data through: DD MMM YYYY" from the pipeline build.

---

## 6. Global filters (shared across pages)

| Filter | Options |
|---|---|
| Time period | Last 3 months, 6 months, 12 months, YTD, custom year |
| Property type | All, Apartment, Villa/Townhouse |
| Bedrooms | Studio, 1, 2, 3, 4+ (where field available) |
| Market | All, Off-plan, Ready |
| Community | Multi-select with search (aliases included) |
| Price band (AED) | <1M, 1–2M, 2–3M, 3–5M, 5M+ |

Filters persist in the URL so any view is shareable.

---

## 7. Dashboard pages, cards and KPIs

### Page 1 — Market Pulse (city overview)
*Purpose: "What is the Dubai market doing right now?"*

**KPI cards (with change vs previous period and vs same period last year)**
1. Total sales value (AED)
2. Number of sales transactions
3. Median price per sq ft
4. Off-plan share of sales (%)
5. Mortgage-to-sales ratio
6. Number of active communities (≥10 sales in period)

**Charts**
- Monthly sales value + transaction count (combo bar/line), 5 years
- Median price per sq ft trend, apartment vs villa
- Official DLD residential price index line
- Off-plan vs ready stacked area
- Price-band distribution (bar)
- Top 10 communities by sales value (bar) and by transaction count (bar)
- Calendar heatmap of daily transaction counts (last 12 months)

---

### Page 2 — Community Explorer (map)
*Purpose: "Where are prices, rents and growth happening?"*

**Map**: community choropleth with a metric switcher:
- Median price per sq ft
- Median annual rent
- Gross rental yield
- 12-month price change (%)
- Transaction velocity (sales per 1,000 units of stock)
- Population and population growth
- Units in pipeline
- Distance from community centroid to nearest metro station

**Extra map layers (toggle)**
- Metro and tram stations
- H3 hexagon density of amenities (variety: hex grid vs polygons)
- 3D extruded communities by sales value (variety: 3D view)

**Side panel on click (community card)**
- Name, sector, population, units
- Median price/sqft, median rent, yield, 12-month change
- Sparkline of price trend
- Rank among all communities for each metric
- Buttons: "Open in Site Analyst", "Add to compare"

---

### Page 3 — Rental & Yield Analyzer
*Purpose: "Where does rent justify the price?"*

**KPI cards**
1. Median annual rent (AED)
2. Median rent per sq ft
3. City-wide gross yield (%)
4. Rental contracts registered (period)
5. 12-month rent growth (%)

**Charts**
- Median rent by bedrooms and property type (grouped bar)
- Rent trend, monthly (line)
- **Yield vs price scatter** (one dot per community; quadrants: high yield/low price = value corner)
- Top 15 communities by gross yield (bar, minimum data threshold applied)
- Rent-to-price ratio table with sorting
- New vs renewed contracts split (if field available — verify in Phase 0)

---

### Page 4 — Supply Pipeline & Developer Tracker
*Purpose: "What supply is coming, and who delivers?"*

**KPI cards**
1. Projects under construction
2. Units under construction
3. Units due to complete in the next 12 / 24 months
4. Average construction completion (%)
5. Projects past their completion date (count)

**Charts**
- Units completing by year (bar), split by top communities
- Map of projects (points sized by units, coloured by status)
- **Supply pressure ratio** by community: upcoming units ÷ existing stock (bar + map)
- Developer league table: projects, units, sales value, % delivered, average completion
- Delayed projects table (completion date passed, progress < 100%)
- Off-plan absorption by project: units sold ÷ total units (where joinable)

---

### Page 5 — AI Site Analyst (centrepiece)
*Purpose: "Tell me about this location in two minutes."*

**Input**: drop a pin on the map, search an address/community, or pick from a list. Radius selector: 1 km / 2 km / 3 km.

**Cards**
1. **Location Score** (0–100) with breakdown bars (see Section 9)
2. Pricing: median price/sqft in community vs Dubai median (index, e.g. 118 = 18% above)
3. Rent and gross yield vs Dubai median
4. Momentum: 3-month and 12-month price change
5. Transit: nearest metro/tram station and distance
6. Amenities within radius: schools, healthcare, retail, parks, restaurants (counts)
7. Population and density of the community
8. Supply nearby: units in pipeline within radius / community
9. Recent comparable sales (table: date, type, size, price, price/sqft) — aggregated/anonymized, no unit numbers

**Compare mode**: 2–3 sites side by side, same cards, radar chart of score components.

**AI memo**: "Read the memo" button shows a one-page memo (Section 10).

**Export**: download the site summary as PNG/PDF (client-side).

---

### Page 6 — Investment Screener
*Purpose: "Shortlist communities that match my criteria."*

**Filters**: budget band, property type, bedrooms, minimum yield, off-plan/ready, max supply pressure, max metro distance.

**Outputs**
- Ranked results table: community, median price, rent, yield, 12-month change, supply pressure, Location Score
- **Value–momentum quadrant**: x = yield, y = 12-month price change; bubble size = transaction volume
- "Caution" flags: low data, high supply pressure, falling rents
- Export shortlist as CSV

---

### Page 7 — About & Data
- What the project is and who built it
- Every data source with link, license and "data through" date
- KPI definitions (Section 8)
- Methodology and limitations
- Disclaimer: informational only, not investment advice
- Link to GitHub repo and contact

---

## 8. KPI dictionary

| KPI | Definition | Source |
|---|---|---|
| Total sales value | Sum of registered residential sale prices in period | D1 |
| Sales transactions | Count of registered residential sales | D1 |
| Median price per sq ft | Median of (price ÷ area in sq ft), outliers removed | D1 |
| Off-plan share | Off-plan sales ÷ all sales | D1 |
| Mortgage-to-sales ratio | Mortgage registrations ÷ sale registrations | D1 |
| Median annual rent | Median annualized rent of residential Ejari contracts | D2 |
| Rent per sq ft | Median of (annual rent ÷ area in sq ft) | D2 |
| Gross rental yield | Median annual rent ÷ median sale price, same community, type and bedrooms where possible, trailing 12 months | D1, D2 |
| Price change (3m / 12m) | Change in median price/sqft, rolling window vs prior window | D1 |
| Rent growth (12m) | Change in median rent, trailing 12m vs prior 12m | D2 |
| Transaction velocity | Sales in last 12 months ÷ residential units in community × 1,000 | D1, D4 |
| Units in pipeline | Units in projects not yet completed | D3 |
| Supply pressure ratio | Units completing in next 24 months ÷ existing units | D3, D4 |
| Avg completion % | Mean construction progress of active projects | D3 |
| Delayed project | Active project whose stated completion date has passed with progress < 100% | D3 |
| Off-plan absorption | Units sold in project ÷ project total units | D1, D3 |
| Population density | Population ÷ community land area (km²) | L1, L3 |
| Metro distance | Distance from community centroid (or pin) to nearest station | L1, L4 |
| Amenity count | Count of amenity points by category within radius | L6 |
| Location Score | Weighted composite, Section 9 | Several |

---

## 9. Location Score (0–100)

Each component is converted to a 0–100 percentile rank across all communities, then weighted:

| Component | Weight | Higher is better? |
|---|---|---|
| Transit access (metro distance) | 20% | Closer = better |
| Amenity density (weighted count within 1.5 km) | 20% | Yes |
| Gross rental yield | 20% | Yes |
| Price momentum (12m change) | 15% | Yes |
| Rental demand (contracts per 1,000 units) | 15% | Yes |
| Supply risk (supply pressure ratio) | 10% | Lower = better |

- Weights are shown on the page, with sliders in a "customize score" drawer (demonstrates flexibility to clients).
- Communities below data thresholds get a partial score with a clear "limited data" badge.

---

## 10. AI memo specification

**Input to the model**: a JSON snapshot of the community's KPIs, ranks, trends, amenities, transit and pipeline. **Only computed facts are sent.** The model must not invent numbers.

**Memo structure (max ~350 words)**
1. One-line summary
2. Strengths (3 bullets, each tied to a number)
3. Risks (3 bullets, each tied to a number)
4. How it compares with 2 similar communities
5. Questions to investigate before deciding
6. Footer: data date, "AI-generated from public data, not investment advice"

**Generation**: pre-generated in the build pipeline for every community passing data thresholds (see architecture.md). Optional live memo for custom pins via bring-your-own-API-key.

**Quality checks**: automated check that every number in the memo exists in the input JSON; memos failing the check are regenerated or hidden.

---

## 11. Design principles
- Clean, light-first theme with dark mode; one accent colour; consistent number formatting (AED 1.2M, 1,840 AED/sqft).
- Every card shows its source and period on hover.
- Mobile: cards stack; map becomes full-width with a bottom sheet.
- Accessible colour scales (colour-blind-safe sequential and diverging palettes).
- No chart without a one-line "what this tells you" caption.

---

## 12. Milestones

| Phase | Deliverable | Est. effort |
|---|---|---|
| 0. Data validation | Download every source, inspect fields, confirm licenses, confirm which fields exist (bedrooms, new vs renewal, project ↔ transaction join) | 2–3 days |
| 1. Pipeline | Crosswalk, cleaning, aggregates, GeoJSON/Parquet outputs, validation tests | 1 week |
| 2. Shell + Market Pulse | App skeleton, routing, filters, first page | 3–4 days |
| 3. Community Explorer | Map, metric switcher, layers, side panel | 1 week |
| 4. Rental & Supply pages | Pages 3 and 4 | 1 week |
| 5. Site Analyst + Screener | Pages 5 and 6, Location Score | 1–1.5 weeks |
| 6. AI memos | Generation step, checks, display | 3–4 days |
| 7. Polish & launch | Mobile, performance, About page, README, demo video, LinkedIn + newsletter post | 1 week |

Total: roughly 6–8 weeks part-time. Ship Pages 1, 2 and 5 first if time is short; they carry the demo.

---

## 13. Open questions (resolve in Phase 0)
- Exact current access requirements for Dubai Pulse bulk files and API (registration/OAuth).
- Are bedrooms present in sale and rent records consistently?
- Can sales be reliably joined to projects (project ID/name) for absorption?
- Does Ejari data mark new vs renewed contracts?
- Is the RTA metro station dataset current, or should OpenStreetMap be the primary source?
- Final license wording for DLD and Dubai Pulse data; required attribution text.
- Project name and domain/subpath (e.g. `surabhigeo.github.io/dubai-location-intel`).
