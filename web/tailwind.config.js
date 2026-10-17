/** @type {import('tailwindcss').Config} */
export default {
  content: { relative: true, files: ["./index.html", "./src/**/*.{ts,tsx}"] },
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        ink: "var(--text-primary)",
        "ink-2": "var(--text-secondary)",
        muted: "var(--text-muted)",
        line: "var(--border)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        good: "var(--delta-good)",
        bad: "var(--delta-bad)",
      },
      fontFamily: { sans: ['system-ui', '-apple-system', '"Segoe UI"', "sans-serif"] },
    },
  },
  plugins: [],
};
