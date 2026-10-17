import { PageHeader } from "../components/ui";
import { dateLabel } from "../data/format";
import { useBuildInfo, useScoreConfig } from "../data/loaders";
import { SCORE_LABELS, SCORE_ORDER } from "../data/site";

const KPIS: [string, string, string][] = [
  ["Total sales value", "Sum of registered residential sale prices in the period", "DLD sales"],
  ["Sales transactions", "Count of registered residential sales (apartments, villas, townhouses)", "DLD sales"],
  ["Median price per sq ft", "Median of price ÷ area in sq ft, after removing values outside the 1st–99th percentile per community per year", "DLD sales"],
  ["Off-plan share", "Off-plan (pre-registration) sales ÷ all sales", "DLD sales"],
  ["Median annual rent", "Median annualised rent of residential Ejari contracts, last 12 months", "Ejari via datadubai.ae"],
  ["Gross rental yield", "Median annual rent ÷ median sale price within the same property class and bedroom count; then the median across segments for a place", "Ejari + DLD via datadubai.ae"],
  ["Price change (3m / 12m)", "Change in median price per sq ft, rolling window vs the window before", "DLD sales"],
  ["Transaction velocity", "Sales in the last 12 months ÷ community land area (sales per km²). Stand-in for sales per 1,000 units: the units register was not reachable", "DLD sales, DM boundaries"],
  ["Units in pipeline", "Units in active projects", "DLD project register"],
  ["Supply pressure (proxy)", "Units due in the next 24 months ÷ sales in the last 12 months. Stand-in for ÷ existing stock", "DLD project register, DLD sales"],
  ["Average completion %", "Mean construction progress of active projects", "DLD project register"],
  ["Delayed project", "Active project whose stated completion date has passed with progress below 100%", "DLD project register"],
  ["Off-plan absorption", "Registered sales in a project ÷ its total units (capped at 100%)", "DLD project register"],
  ["Metro distance", "Straight-line distance from the community's representative point (or a pin) to the nearest metro or tram station", "OpenStreetMap"],
  ["Amenity count", "OpenStreetMap schools, healthcare, malls/supermarkets, parks, beaches, restaurants/cafés and offices within the radius", "OpenStreetMap"],
  ["Rental demand", "Rent contracts in the last 12 months ÷ community land area", "Ejari via datadubai.ae"],
];

export default function About() {
  const { data: info } = useBuildInfo();
  const { data: score } = useScoreConfig();
  return (
    <article className="mx-auto max-w-3xl text-sm leading-relaxed text-ink-2 [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3">
      <PageHeader title="About & Data" purpose="What this is, where every number comes from, and what it can't tell you." />

      <h2>What this is</h2>
      <p>
        Dubai Location Intelligence is an open-source demo dashboard. It combines Dubai Land Department (DLD) open property data with location context:
        Dubai Municipality community boundaries, metro and tram access, and amenities. It also adds an AI-written memo for each community. Every page is
        static: data is processed in a public pipeline and served as files, with no backend and no tracking.
      </p>
      <p>
        Built by <b className="text-ink">Surabhi Gupta</b> (GeoCloud Insights). Code:{" "}
        <a className="text-accent-ink underline" href="https://github.com/surabhigeo/dubai-location-intel">github.com/surabhigeo/dubai-location-intel</a>.
      </p>
      {info && <p>Data through <b className="text-ink">{dateLabel(info.data_through)}</b>. Built {dateLabel(info.built_at)}. Rolling 12-month figures cover {dateLabel(info.window_12m[0])} to the end of {dateLabel(info.last_full_month).replace(/^1 /, "")}.</p>}

      <h2>Sources and licences</h2>
      <ul>
        <li><b className="text-ink">Sales</b>: 1.37M DLD-registered sale transactions, via <a className="underline" href="https://huggingface.co/datasets/dubairealestatedata/dubai-real-estate-sales-transactions">dubairealestatedata.com</a> (CC BY 4.0). Residential apartments, villas and townhouses are used; land, whole buildings, offices, shops and hotel units are excluded.</li>
        <li><b className="text-ink">Rents, yields, projects, developers</b>: DLD Ejari and project register aggregates via <a className="underline" href="https://github.com/datadubai/dubai-real-estate-dld">datadubai.ae</a> (CC BY 4.0).</li>
        <li><b className="text-ink">Community boundaries</b>: Dubai Municipality community layer (224 communities) via Dubai Data, under the Dubai Data Open Data Licence.</li>
        <li><b className="text-ink">Stations and amenities</b>: © OpenStreetMap contributors, ODbL, via Geofabrik.</li>
        <li><b className="text-ink">Basemap</b>: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors.</li>
      </ul>
      <p>
        The official bulk portals (Dubai Pulse and data.dubai) were not reachable from where this build runs, so the attributed CC BY 4.0 mirrors above are
        used. The pipeline keeps sources swappable for when the official files are available.
      </p>

      <h2>KPI definitions</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b border-line text-ink"><th className="py-2 pr-3" scope="col">KPI</th><th className="py-2 pr-3" scope="col">Definition</th><th className="py-2" scope="col">Source</th></tr></thead>
          <tbody>{KPIS.map(([k, d, s]) => <tr key={k} className="border-b border-line/50 align-top"><td className="py-2 pr-3 font-medium text-ink">{k}</td><td className="py-2 pr-3">{d}</td><td className="py-2">{s}</td></tr>)}</tbody>
        </table>
      </div>

      <h2>Location Score</h2>
      <p>Each component is converted to a 0–100 percentile rank across active communities (at least 10 sales in 12 months), then weighted. Weights can be changed in the Site Analyst.</p>
      <ul>
        {SCORE_ORDER.map((k) => <li key={k}>{SCORE_LABELS[k]}: {score ? Math.round(score.weights[k] * 100) : "—"}%</li>)}
      </ul>
      <p>For a dropped pin, transit and amenities are measured at the pin (amenities within {score ? score.amenity_radius_m / 1000 : 1.5} km, weighted by category) and ranked against the community distribution. Market components come from the community the pin falls in. Missing components count as 50 and the score carries a "limited data" badge.</p>

      <h2>Methodology</h2>
      <ul>
        <li>Medians, never means, for prices and rents.</li>
        <li>Metrics with fewer than {info?.min_records ?? 10} records are suppressed and shown as "insufficient data".</li>
        <li>Rolling windows use complete calendar months only. The current partial month appears in trend charts, shaded lighter.</li>
        <li>DLD areas are mapped to Dubai Municipality communities through a reviewed crosswalk (exact name → normalised name → fuzzy match reviewed by hand → manual override). 100% of sales in the last five years are mapped.</li>
        <li>From 2026 the DLD feed codes villas as "Building / Villa". The pipeline treats both codings as villas.</li>
        <li>Memos are generated from computed facts only. Every number in a memo is checked against its input, and a memo that fails is replaced by a rule-based summary.</li>
      </ul>

      <h2>Limitations</h2>
      <ul>
        <li>No mortgage-to-sales ratio: the open sales file contains sale registrations only.</li>
        <li>No rent time series, 12-month rent growth or new-vs-renewal split: only 12-month Ejari aggregates were available.</li>
        <li>No population or density: the Dubai Statistics Center file was not reachable.</li>
        <li>Velocity and supply pressure use proxies because the DLD units register was not reachable.</li>
        <li>The project list covers about 770 projects with registered sales, so pipeline totals are a lower bound. Only about 1 in 7 projects has a registered location.</li>
        <li>Community-level figures can hide large differences between buildings. Always check comparables.</li>
      </ul>

      <h2>Disclaimer</h2>
      <p>
        Informational only. This is not investment, legal or valuation advice. It is not affiliated with or endorsed by the Dubai Land Department, Dubai Municipality,
        Dubai Statistics Center or any government entity. Figures may contain errors from source data or processing.
      </p>
      <p>Contact: via the GitHub repository or <a className="underline" href="https://surabhigeo.com">surabhigeo.com</a>.</p>
    </article>
  );
}
