import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173/dubai-location-intel/" },
  webServer: { command: "npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
});
