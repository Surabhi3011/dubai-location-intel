import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // Locally, PW_CHANNEL=msedge runs on the installed Edge instead of a downloaded Chromium.
  use: { baseURL: "http://localhost:4173/dubai-location-intel/", channel: process.env.PW_CHANNEL },
  webServer: { command: "npm run preview -- --port 4173 --strictPort", port: 4173, reuseExistingServer: true },
});
