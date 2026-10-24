# Dubai Location Intelligence

**Live demo: https://surabhi3011.github.io/dubai-location-intel/**

An open-source dashboard for Dubai's residential property market. It combines Dubai Land Department (DLD) open data on sales, rents and new projects with location context: Dubai Municipality community boundaries, metro and tram access, and nearby amenities. Every community also gets a one-page site summary.

The whole site is static. Data is processed by a public pipeline and served as files, so there is no backend, no account and no tracking.

## What's inside

| Page | Question it answers |
|---|---|
| **Market Pulse** | What is the Dubai residential market doing right now? Sales value, transaction volume, price per sq ft and a price index. |
| **Community Explorer** | A full-screen map of all 224 communities, coloured by the metric you pick. |
| **Rental & Yield** | Where does rent justify the price? Rents by bedroom count, gross yields and rent-to-price comparisons. |
| **Supply Pipeline** | What supply is coming, and who is delivering it? Units completing by year, supply pressure and off-plan absorption. |
| **Site Analyst** | Drop a pin or search a community for a two-minute brief on pricing, rent, transit, amenities and a location score. Compare up to three sites. |
| **Screener** | Shortlist communities that match your criteria, with a value-vs-momentum view. |
| **About & Data** | Sources, licences, KPI definitions and known limitations. |

## Data sources

| Data | Source | Licence |
|---|---|---|
| Residential sale transactions (1.37M) | Dubai Land Department, via [Dubai Real Estate Data](https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions) | CC BY 4.0 |
| Rents, yields, project register, developers | Dubai Land Department (Ejari, project register), via [Dubai Data](https://github.com/datadubai/dubai-real-estate-dld) | CC BY 4.0 |
| Community boundaries | Dubai Municipality, via Dubai Data | Dubai Data Open Data Licence |
| Metro and tram stations, amenities | © [OpenStreetMap](https://www.openstreetmap.org) contributors, via Geofabrik | ODbL 1.0 |
| Basemap | OpenFreeMap / OpenMapTiles | ODbL / CC BY |

Full attribution is in [`DATA_LICENSE.md`](DATA_LICENSE.md).

## Tech stack

- **Pipeline:** Python 3.12, DuckDB, Polars, GeoPandas, H3, Pandera
- **Web app:** React, TypeScript, Vite, Tailwind CSS, MapLibre GL, deck.gl, ECharts, DuckDB-WASM
- **Hosting:** GitHub Pages, with GitHub Actions refreshing the data every week

## Run it locally

### Web app

Requires Node 20+.

```bash
cd web
npm install
npm run dev
```

### Rebuild the data

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd pipeline
uv sync
uv run dli run all    # fetch -> osm -> crosswalk -> clean -> aggregate -> validate -> memos -> export
uv run dli publish    # copy data/output into web/public/data
```

Site summaries are written by rules from the computed figures, so a build needs no API key and costs nothing. AI-written memos are optional: they run only when `ANTHROPIC_API_KEY` is set (`--no-memos` turns them off).

DLD areas are matched to Dubai Municipality communities through `data/reference/community_crosswalk.csv`. If a new DLD area can't be matched, the build stops. Add a row to `data/reference/community_crosswalk_overrides.csv` to fix it.

### Tests

```bash
cd pipeline && uv run ruff check src tests && uv run pytest
cd web && npm run lint && npm run typecheck && npm test
cd web && npm run build && npm run e2e    # Playwright smoke tests
```

## Deploy your own copy

1. Fork the repository, then in **Settings → Pages** set the source to **GitHub Actions**.
2. Run the **Data refresh** workflow once (Actions → Data refresh → Run workflow). It builds the data, publishes it to the `data` branch and triggers **Deploy**.
3. From then on, Data refresh runs every Monday and every push to `main` redeploys the site.

AI memos stay off unless you add an `ANTHROPIC_API_KEY` secret and set the repository variable `ENABLE_AI_MEMOS` to `true`.

## Licence

Code is released under the [MIT Licence](LICENSE). Data remains under its publishers' licences; see [`DATA_LICENSE.md`](DATA_LICENSE.md).

## Disclaimer

For information only. This is not investment advice. The project is not affiliated with or endorsed by the Dubai Land Department, Dubai Municipality or any government entity.

---

Built by Surabhi Gupta.
