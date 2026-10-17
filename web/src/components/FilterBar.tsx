import { useBuildInfo } from "../data/loaders";
import {
  BAND_OPTIONS, BEDS_OPTIONS, isDefault, MARKET_OPTIONS, PERIOD_OPTIONS, type Period, TYPE_OPTIONS, useFilters,
} from "../state/filters";
import { CommunityPicker } from "./CommunityPicker";
import { Select } from "./ui";

type Key = "period" | "type" | "beds" | "market" | "band" | "communities";

/** One row of global filters above the charts (plan §6). Pages pick which filters apply. */
export function FilterBar({ show = ["period", "type", "beds", "market", "band", "communities"] }: { show?: Key[] }) {
  const { filters, setFilters, reset } = useFilters();
  const { data: info } = useBuildInfo();
  const lastYear = Number((info?.last_full_month ?? "2026").slice(0, 4));
  const years = Array.from({ length: 5 }, (_, i) => String(lastYear - i));
  const periodOptions = [
    ...PERIOD_OPTIONS,
    ...years.map((y) => ({ value: y as Period, label: `Year ${y}` })),
  ];
  const has = (k: Key) => show.includes(k);

  return (
    <div className="sticky top-14 z-20 -mx-4 mb-4 border-b border-line bg-page px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        {has("period") && <Select label="Time period" value={filters.period} onChange={(period) => setFilters({ period })} options={periodOptions} />}
        {has("type") && <Select label="Property type" value={filters.type} onChange={(type) => setFilters({ type })} options={TYPE_OPTIONS} />}
        {has("beds") && <Select label="Bedrooms" value={filters.beds} onChange={(beds) => setFilters({ beds })} options={BEDS_OPTIONS} />}
        {has("market") && <Select label="Market" value={filters.market} onChange={(market) => setFilters({ market })} options={MARKET_OPTIONS} />}
        {has("band") && <Select label="Price band" value={filters.band} onChange={(band) => setFilters({ band })} options={BAND_OPTIONS} />}
        {has("communities") && <CommunityPicker value={filters.communities} onChange={(communities) => setFilters({ communities })} />}
        {!isDefault(filters) && (
          <button type="button" onClick={reset} className="focus-ring h-9 rounded-lg px-3 text-sm text-accent-ink hover:bg-surface-2">
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
