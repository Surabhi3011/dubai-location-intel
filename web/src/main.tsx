import * as Tooltip from "@radix-ui/react-tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Skeleton } from "./components/ui";
import MarketPulse from "./pages/MarketPulse";
import "./styles/index.css";

// Map-heavy and DuckDB-heavy pages are code-split so the first view stays light.
const Explorer = lazy(() => import("./pages/Explorer"));
const Rental = lazy(() => import("./pages/Rental"));
const Supply = lazy(() => import("./pages/Supply"));
const SiteAnalyst = lazy(() => import("./pages/SiteAnalyst"));
const Screener = lazy(() => import("./pages/Screener"));
const About = lazy(() => import("./pages/About"));

const page = (el: JSX.Element) => <Suspense fallback={<div className="p-6"><Skeleton height={400} /></div>}>{el}</Suspense>;

// HashRouter avoids 404s on refresh under GitHub Pages.
const router = createHashRouter([
  {
    element: <Layout />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/", element: <MarketPulse /> },
      { path: "/explorer", element: page(<Explorer />) },
      { path: "/rental", element: page(<Rental />) },
      { path: "/supply", element: page(<Supply />) },
      { path: "/site", element: page(<SiteAnalyst />) },
      { path: "/screener", element: page(<Screener />) },
      { path: "/about", element: page(<About />) },
    ],
  },
]);

function ErrorPage() {
  return (
    <div className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-2">This view hit an error. Try reloading, or go back to the <a className="underline" href="#/">Market Pulse</a>.</p>
    </div>
  );
}

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Tooltip.Provider>
        <RouterProvider router={router} />
      </Tooltip.Provider>
    </QueryClientProvider>
  </StrictMode>,
);
