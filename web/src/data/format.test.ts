import { describe, expect, it } from "vitest";
import { periodWindows } from "../state/filters";
import { aed, km, percentileOf, signedPct, toCsv } from "./format";
import { filterWhere } from "./duckdb";
import { haversine, median } from "./site";

describe("format", () => {
  it("formats AED compactly", () => {
    expect(aed(1_234_567)).toBe("AED 1.2M");
    expect(aed(298_523_296_169)).toBe("AED 299B");
    expect(aed(67_000)).toBe("AED 67.0K");
    expect(aed(null)).toBe("—");
  });
  it("formats signed percentages and distances", () => {
    expect(signedPct(5.24)).toBe("+5.2%");
    expect(signedPct(-3)).toBe("−3.0%");
    expect(km(660)).toBe("660 m");
    expect(km(5800)).toBe("5.8 km");
  });
  it("ranks percentiles in either direction", () => {
    const sorted = [100, 200, 300, 400, 500];
    expect(percentileOf(sorted, 500, true)).toBe(100);
    expect(percentileOf(sorted, 100, true)).toBe(0);
    expect(percentileOf(sorted, 100, false)).toBe(100);
  });
  it("escapes CSV", () => {
    expect(toCsv([{ a: "x,y", b: 'say "hi"', c: null }])).toBe('a,b,c\n"x,y","say ""hi""",');
  });
});

describe("periods", () => {
  it("anchors rolling windows on the last full month", () => {
    const w = periodWindows("12m", "2026-09-01", "2026-10-05");
    expect(w.current).toMatchObject({ start: "2025-10-01", end: "2026-10-01" });
    expect(w.previous).toMatchObject({ start: "2024-10-01", end: "2025-10-01" });
    expect(w.months).toBe(12);
  });
  it("builds YTD and year windows", () => {
    expect(periodWindows("ytd", "2026-09-01", "2026-10-05").current).toMatchObject({ start: "2026-01-01", end: "2026-10-01" });
    expect(periodWindows("2025", "2026-09-01", "2026-10-05").current).toMatchObject({ start: "2025-01-01", end: "2026-01-01" });
    expect(periodWindows("3m", "2026-09-01", "2026-10-05").yearAgo).toMatchObject({ start: "2025-07-01", end: "2025-10-01" });
  });
});

describe("sql filters", () => {
  it("builds a where clause and escapes quotes", () => {
    const w = filterWhere({ period: "12m", type: "villa", beds: "4", market: "all", band: "all", communities: ["681", "x'y"] });
    expect(w).toBe("where ptype = 'villa' and rooms >= 4 and community_id in ('681','x''y')");
    expect(filterWhere({ period: "12m", type: "all", beds: "all", market: "all", band: "all", communities: [] })).toBe("");
  });
});

describe("geo", () => {
  it("measures distance in metres", () => {
    // Burj Khalifa to Dubai Mall metro: ~1 km
    const d = haversine(55.2744, 25.1972, 55.2697, 25.2014);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(900);
  });
  it("computes medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3, null])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
