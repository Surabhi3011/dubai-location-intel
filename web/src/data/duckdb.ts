/**
 * DuckDB-WASM, loaded only when a view needs filtered queries over row-level sales.
 * The sales file (~6.5 MB parquet) is fetched once and queried in the browser.
 */
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { useQuery } from "@tanstack/react-query";
import type { Filters, Window } from "../state/filters";
import { dataUrl } from "./loaders";

let conn: Promise<AsyncDuckDBConnection> | null = null;

async function init(): Promise<AsyncDuckDBConnection> {
  const duckdb = await import("@duckdb/duckdb-wasm");
  const [mvpWasm, mvpWorker, ehWasm, ehWorker] = await Promise.all([
    import("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url"),
    import("@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url"),
    import("@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url"),
    import("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url"),
  ]);
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm.default, mainWorker: mvpWorker.default },
    eh: { mainModule: ehWasm.default, mainWorker: ehWorker.default },
  });
  const worker = new Worker(bundle.mainWorker!);
  const db: AsyncDuckDB = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const buf = new Uint8Array(await (await fetch(dataUrl("sales_detail.parquet"))).arrayBuffer());
  await db.registerFileBuffer("sales.parquet", buf);
  const c = await db.connect();
  await c.query("create table sales as select * from read_parquet('sales.parquet')");
  return c;
}

export function getConnection() {
  if (!conn) conn = init().catch((e) => { conn = null; throw e; });
  return conn;
}

export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const c = await getConnection();
  const table = await c.query(query);
  return table.toArray().map((row) => {
    const o = row.toJSON() as Record<string, unknown>;
    for (const k in o) {
      const v = o[k];
      if (typeof v === "bigint") o[k] = Number(v);
      else if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
        // Arrow decimals / HUGEINT arrive as wrapper objects; cast sums to double in SQL to avoid them.
        const n = Number(String(v));
        if (Number.isFinite(n)) o[k] = n;
      }
    }
    return o as T;
  });
}

/** React hook: run a query when `enabled`, cached by key. */
export function useSql<T = Record<string, unknown>>(key: unknown[], query: string | null) {
  return useQuery({
    queryKey: ["sql", ...key, query],
    queryFn: () => sql<T>(query!),
    enabled: !!query,
    staleTime: Infinity,
  });
}

const esc = (s: string) => s.replace(/'/g, "''");

/** WHERE clause for every global filter except period. */
export function filterWhere(f: Filters, extra: string[] = []): string {
  const w: string[] = [...extra];
  if (f.type !== "all") w.push(`ptype = '${f.type}'`);
  if (f.market !== "all") w.push(`market = '${f.market}'`);
  if (f.beds !== "all") w.push(f.beds === "4" ? "rooms >= 4" : `rooms = ${Number(f.beds)}`);
  if (f.band !== "all") w.push(`price_band = '${esc(f.band)}'`);
  if (f.communities.length) w.push(`community_id in (${f.communities.map((c) => `'${esc(c)}'`).join(",")})`);
  return w.length ? `where ${w.join(" and ")}` : "";
}

export const inWindow = (w: Window) => `date >= date '${w.start}' and date < date '${w.end}'`;
