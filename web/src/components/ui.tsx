import * as Tooltip from "@radix-ui/react-tooltip";
import { type ReactNode, useState } from "react";
import { isNum, signedPct } from "../data/format";
import type { Nullable } from "../data/types";

export function Select<T extends string>({
  value, onChange, options, label, className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-muted ${className}`}>
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="focus-ring h-9 rounded-lg border border-line bg-surface px-2.5 pr-8 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function Info({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label="About this figure"
          className="focus-ring inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.2v4M8 4.8v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-relaxed text-ink-2 shadow-lg"
        >
          {children}
          <Tooltip.Arrow className="fill-[var(--surface-1)]" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Delta({ value, unit = "%", goodWhenUp = true, neutral = false, label }: {
  value: Nullable<number> | undefined; unit?: "%" | "pp"; goodWhenUp?: boolean; neutral?: boolean; label: string;
}) {
  if (!isNum(value)) return <span className="text-muted">— {label}</span>;
  const up = value > 0;
  const good = value === 0 || neutral ? null : up === goodWhenUp;
  const color = good === null ? "text-ink-2" : good ? "text-good" : "text-bad";
  const text = unit === "pp" ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)} pp` : signedPct(value);
  return (
    <span className="whitespace-nowrap">
      <span className={`font-medium ${color}`}>
        <span aria-hidden>{value > 0 ? "▲" : value < 0 ? "▼" : "●"}</span> {text}
      </span>{" "}
      <span className="text-muted">{label}</span>
    </span>
  );
}

export function KpiCard({
  label, value, deltas, source, loading,
}: {
  label: string;
  value: ReactNode;
  deltas?: ReactNode[];
  source: string;
  loading?: boolean;
}) {
  return (
    <div className="card flex min-w-0 flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-2">
        <span>{label}</span>
        <Info>{source}</Info>
      </div>
      <div className={`text-2xl font-semibold tracking-tight text-ink ${loading ? "opacity-40" : ""}`}>{value}</div>
      {deltas && <div className="flex flex-col gap-0.5 text-xs">{deltas.map((d, i) => <div key={i}>{d}</div>)}</div>}
    </div>
  );
}

export function ChartCard({
  title, caption, source, children, actions, table, className = "",
}: {
  title: string;
  caption: string;
  source: string;
  children: ReactNode;
  actions?: ReactNode;
  table?: () => ReactNode;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card flex min-w-0 flex-col p-4 ${className}`} aria-label={title}>
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-2">{caption}</p>
        </div>
        <div className="flex items-center gap-1">
          {actions}
          {table && (
            <button
              type="button"
              onClick={() => setShowTable((s) => !s)}
              className="focus-ring rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
              aria-pressed={showTable}
            >
              {showTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1">{showTable && table ? <div className="max-h-80 overflow-auto">{table()}</div> : children}</div>
      <footer className="mt-2 text-[11px] text-muted">{source}</footer>
    </section>
  );
}

export function DataTable<T>({
  rows, columns, maxRows, rowKey, onRowClick,
}: {
  rows: T[];
  columns: { key: string; label: string; render: (r: T) => ReactNode; align?: "left" | "right"; sort?: (r: T) => number | string | null }[];
  maxRows?: number;
  rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [desc, setDesc] = useState(true);
  const col = columns.find((c) => c.key === sortKey);
  const sorted = col?.sort
    ? [...rows].sort((a, b) => {
        const x = col.sort!(a);
        const y = col.sort!(b);
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
      })
    : rows;
  const shown = maxRows ? sorted.slice(0, maxRows) : sorted;
  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 bg-surface">
        <tr className="border-b border-line text-left text-xs text-ink-2">
          {columns.map((c) => (
            <th key={c.key} scope="col" className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
              {c.sort ? (
                <button
                  type="button"
                  className="focus-ring inline-flex items-center gap-1 hover:text-ink"
                  onClick={() => { if (sortKey === c.key) setDesc(!desc); else { setSortKey(c.key); setDesc(true); } }}
                >
                  {c.label}
                  <span aria-hidden className="text-muted">{sortKey === c.key ? (desc ? "↓" : "↑") : "↕"}</span>
                </button>
              ) : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((r, i) => (
          <tr
            key={`${rowKey(r)}-${i}`}
            className={`border-b border-line/50 ${onRowClick ? "cursor-pointer hover:bg-surface-2" : ""}`}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            {columns.map((c) => (
              <td key={c.key} className={`tabular px-2 py-1.5 ${c.align === "right" ? "text-right" : ""}`}>{c.render(r)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "warning" | "critical" | "good" | "accent"; children: ReactNode }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    warning: "bg-[color-mix(in_srgb,var(--status-warning)_20%,transparent)] text-ink",
    critical: "bg-[color-mix(in_srgb,var(--status-critical)_18%,transparent)] text-ink",
    good: "bg-[color-mix(in_srgb,var(--status-good)_18%,transparent)] text-ink",
    accent: "bg-[var(--accent-wash)] text-accent-ink",
  };
  const icon = { neutral: null, warning: "⚠", critical: "!", good: "✓", accent: null }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

export function Skeleton({ height = 200 }: { height?: number }) {
  return <div className="animate-pulse rounded-lg bg-surface-2" style={{ height }} />;
}

export function PageHeader({ title, purpose, children }: { title: string; purpose: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-ink-2">{purpose}</p>
      </div>
      {children}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">{children}</div>;
}
