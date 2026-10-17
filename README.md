# Dubai Location Intelligence

An open-source demo dashboard that combines Dubai Land Department (DLD) property data with location context: community boundaries, metro access and amenities. It also writes a one-page summary for each community. It runs as a static site on GitHub Pages with no backend.

- Plan: [`plan.md`](plan.md). Architecture: [`architecture.md`](architecture.md). Phase 0 data findings: [`docs/phase0_findings.md`](docs/phase0_findings.md)
- Data licences and attribution: [`DATA_LICENSE.md`](DATA_LICENSE.md)

## Rebuild the data

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/).

```bash
cd pipeline
uv sync
uv run dli run all          # fetch -> osm -> crosswalk -> clean -> aggregate -> validate -> memos -> export
uv run dli publish          # copy data/output into web/public/data
```

Site summaries are rule-based by default, so the build costs nothing. AI memos are optional: locally they run only when `ANTHROPIC_API_KEY` is set (use `--no-memos` to force them off). Summaries are cached in `data/memos/memos.json` by input hash.

The DLD-area to Dubai Municipality community crosswalk is `data/reference/community_crosswalk.csv`. If a new DLD area appears and can't be matched, the build fails. Add a row to `data/reference/community_crosswalk_overrides.csv` to fix it.

## Run the web app

Requires Node 20+.

```bash
cd web
npm install
npm run dev
```

## Deploy (GitHub Pages)

1. Push this repository to GitHub. Then go to **Settings → Pages** and set the source to **GitHub Actions**.
2. AI memos are off by default and nothing is billed. To turn them on later, add an `ANTHROPIC_API_KEY` secret and set a repository variable `ENABLE_AI_MEMOS` to `true`.
3. Run the **Data refresh** workflow once (Actions → Data refresh → Run workflow). It builds the data, publishes it to the `data` branch and triggers **Deploy**.
4. After that, Data refresh runs every Monday, and every push to `main` redeploys with the latest data build.

`ci.yml` runs on every pull request: ruff and pytest for the pipeline, then ESLint, `tsc` and Vitest for the web app. Playwright smoke tests run locally with `npm run build && npm run e2e`.

## Disclaimer

Informational only. Not investment advice. The dashboard is not affiliated with the Dubai Land Department, Dubai Municipality or any government entity.
