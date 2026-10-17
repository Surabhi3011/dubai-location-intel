import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/; override with BASE_PATH for other hosts.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/dubai-location-intel/",
  plugins: [react()],
  optimizeDeps: { exclude: ["@duckdb/duckdb-wasm"] },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "zustand"],
        },
      },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
