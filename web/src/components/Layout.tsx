import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { dateLabel } from "../data/format";
import { useBuildInfo } from "../data/loaders";

const NAV = [
  { to: "/", label: "Market Pulse" },
  { to: "/explorer", label: "Community Explorer" },
  { to: "/rental", label: "Rental & Yield" },
  { to: "/supply", label: "Supply Pipeline" },
  { to: "/site", label: "Site Analyst" },
  { to: "/screener", label: "Screener" },
  { to: "/about", label: "About & Data" },
];

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.dataset.theme ?? null);
  const dark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch { /* storage unavailable */ }
    setTheme(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2"
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      )}
    </button>
  );
}

export function Layout() {
  const { data: info } = useBuildInfo();
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setMenuOpen(false), [loc.pathname]);
  const fullBleed = loc.pathname === "/explorer";

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 h-14 border-b border-line bg-surface backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <NavLink to="/" className="focus-ring flex shrink-0 items-center gap-2 rounded-lg font-semibold text-ink">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="7" fill="var(--accent)" /><path d="M8 24V13l8-5 8 5v11h-5v-6h-6v6z" fill="white" /></svg>
            <span className="hidden sm:inline">Dubai Location Intelligence</span>
            <span className="sm:hidden">Dubai LI</span>
          </NavLink>
          <nav className="ml-4 hidden flex-1 items-center gap-1 overflow-x-auto lg:flex" aria-label="Pages">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={{ pathname: n.to, search: loc.search }}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `focus-ring whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm ${isActive ? "bg-[var(--accent-wash)] font-medium text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {info && (
              <span className="hidden text-xs text-muted md:inline">Data through {dateLabel(info.data_through)}</span>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 lg:hidden"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="border-b border-line bg-surface px-4 py-2 lg:hidden" aria-label="Pages">
            {NAV.map((n) => (
              <NavLink key={n.to} to={{ pathname: n.to, search: loc.search }} end={n.to === "/"}
                className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-[var(--accent-wash)] text-accent-ink" : "text-ink"}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className={fullBleed ? "flex-1" : "mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6"}>
        <Outlet />
      </main>

      {!fullBleed && (
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-[1400px] px-4 py-4 text-xs leading-relaxed text-muted sm:px-6">
            Sources: Dubai Land Department open data via dubairealestatedata.com and datadubai.ae (CC BY 4.0) ·
            Dubai Municipality community layer via Dubai Data · © OpenStreetMap contributors (ODbL).
            {info && <> Data through {dateLabel(info.data_through)}.</>} Informational only, not investment advice.
            Not affiliated with any government entity. <NavLink to="/about" className="underline hover:text-ink">Methodology & licences</NavLink>
          </div>
        </footer>
      )}
    </div>
  );
}
