import { expect, test } from "@playwright/test";

// Smoke tests: every page renders, the map loads, filters update the KPI cards.
const pages = [
  ["#/", "Market Pulse"],
  ["#/explorer", "Community Explorer"],
  ["#/rental", "Rental & Yield Analyzer"],
  ["#/supply", "Supply Pipeline & Developer Tracker"],
  ["#/site", "AI Site Analyst"],
  ["#/screener", "Investment Screener"],
  ["#/about", "About & Data"],
] as const;

for (const [path, heading] of pages) {
  test(`renders ${heading}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByText(heading).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("map canvas loads on the explorer", async ({ page }) => {
  await page.goto("#/explorer");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible({ timeout: 20_000 });
});

test("filters update KPI cards via DuckDB-WASM", async ({ page }) => {
  await page.goto("#/");
  const card = page.locator("section, div").filter({ hasText: /^Sales transactions/ }).first();
  const before = await card.innerText();
  await page.getByLabel("Property type").selectOption("villa");
  await expect(card).not.toHaveText(before, { timeout: 30_000 });
});
