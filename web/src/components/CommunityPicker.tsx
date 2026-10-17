import * as Popover from "@radix-ui/react-popover";
import { useMemo, useState } from "react";
import { useCommunities } from "../data/loaders";
import type { Community } from "../data/types";

export function searchCommunities(list: Community[], q: string, limit = 50): Community[] {
  const s = q.trim().toLowerCase();
  const pool = list.filter((c) => c.active || c.sales_12m > 0);
  if (!s) return [...pool].sort((a, b) => b.sales_12m - a.sales_12m).slice(0, limit);
  return pool
    .map((c) => {
      const hay = [c.community_name, ...(c.aliases ?? [])].map((x) => x.toLowerCase());
      const score = hay.some((h) => h.startsWith(s)) ? 2 : hay.some((h) => h.includes(s)) ? 1 : 0;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.c.sales_12m - a.c.sales_12m)
    .slice(0, limit)
    .map((x) => x.c);
}

export function matchedAlias(c: Community, q: string): string | null {
  const s = q.trim().toLowerCase();
  if (!s || c.community_name.toLowerCase().includes(s)) return null;
  return c.aliases?.find((a) => a.toLowerCase().includes(s)) ?? null;
}

export function CommunityPicker({
  value, onChange, max = 10, label = "Communities",
}: { value: string[]; onChange: (ids: string[]) => void; max?: number; label?: string }) {
  const { data = [] } = useCommunities();
  const [q, setQ] = useState("");
  const results = useMemo(() => searchCommunities(data, q), [data, q]);
  const names = new Map(data.map((c) => [c.community_id, c.community_name]));
  const summary = value.length === 0 ? "All communities" : value.length === 1 ? names.get(value[0]) : `${value.length} communities`;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : value.length < max ? [...value, id] : value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="focus-ring flex h-9 max-w-[16rem] items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
        >
          <span className="truncate">{summary}</span>
          <span aria-hidden className="text-muted">▾</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-80 rounded-xl border border-line bg-surface p-2 shadow-xl"
        >
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search, e.g. JVC, Dubai Marina, Business Bay"
            aria-label="Search communities"
            className="focus-ring mb-2 h-9 w-full rounded-lg border border-line bg-page px-2.5 text-sm text-ink placeholder:text-muted"
          />
          <ul className="max-h-72 overflow-auto" role="listbox" aria-multiselectable>
            {results.map((c) => {
              const alias = matchedAlias(c, q);
              const selected = value.includes(c.community_id);
              return (
                <li key={c.community_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggle(c.community_id)}
                    className="focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "border-accent bg-accent text-white" : "border-line"}`} aria-hidden>
                      {selected ? "✓" : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">
                      {c.community_name}
                      {alias && <span className="text-muted"> · {alias}</span>}
                    </span>
                    <span className="tabular text-xs text-muted">{c.sales_12m.toLocaleString()}</span>
                  </button>
                </li>
              );
            })}
            {results.length === 0 && <li className="px-2 py-3 text-sm text-muted">No communities match “{q}”.</li>}
          </ul>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="focus-ring mt-2 w-full rounded-lg py-1.5 text-xs text-ink-2 hover:bg-surface-2">
              Clear selection
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
