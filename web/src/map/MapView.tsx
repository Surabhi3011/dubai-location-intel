import type { Layer, PickingInfo } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useEffect, useRef } from "react";
import { useTokens } from "../charts/theme";

const STYLE = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

export const DUBAI_VIEW = {
  bounds: [[54.98, 24.9], [55.58, 25.33]] as [[number, number], [number, number]],
};

export interface MapViewProps {
  layers: (Layer | false | null | undefined)[];
  onClick?: (info: PickingInfo, lngLat: [number, number]) => void;
  getTooltip?: (info: PickingInfo) => string | null;
  pitch?: number;
  flyTo?: { center: [number, number]; zoom?: number } | null;
  className?: string;
  children?: ReactNode;
  cursor?: string;
  /** Embedded maps on scrolling pages: require Ctrl/⌘ + scroll to zoom. */
  cooperative?: boolean;
}

/** MapLibre basemap (no token) with a deck.gl overlay for data layers. */
export function MapView({ layers, onClick, getTooltip, pitch = 0, flyTo, className = "", children, cursor, cooperative = false }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const t = useTokens();
  const handlers = useRef({ onClick, getTooltip });
  handlers.current = { onClick, getTooltip };

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: t.dark ? STYLE.dark : STYLE.light,
      bounds: DUBAI_VIEW.bounds,
      fitBoundsOptions: { padding: 20 },
      minZoom: 8,
      maxZoom: 17,
      maxBounds: [[54.4, 24.4], [56.6, 25.75]],
      attributionControl: { compact: true },
      dragRotate: true,
      cooperativeGestures: cooperative,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    const ov = new MapboxOverlay({
      interleaved: false,
      layers: [],
      onClick: (info) => {
        const lngLat = (info.coordinate ?? [0, 0]) as [number, number];
        handlers.current.onClick?.(info, lngLat);
      },
      getTooltip: (info) => {
        const html = handlers.current.getTooltip?.(info);
        return html
          ? {
              html,
              style: {
                background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)",
                borderRadius: "8px", padding: "8px 10px", fontSize: "12px", boxShadow: "0 4px 16px rgba(0,0,0,.15)",
                fontFamily: "system-ui, sans-serif", maxWidth: "260px",
              },
            }
          : null;
      },
    });
    m.addControl(ov as unknown as maplibregl.IControl);
    map.current = m;
    overlay.current = ov;
    return () => { m.remove(); map.current = null; overlay.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstStyle = useRef(true);
  useEffect(() => {
    if (firstStyle.current) { firstStyle.current = false; return; }
    map.current?.setStyle(t.dark ? STYLE.dark : STYLE.light, { diff: false });
  }, [t.dark]);
  useEffect(() => { overlay.current?.setProps({ layers: layers.filter(Boolean) as Layer[] }); }, [layers]);
  useEffect(() => { map.current?.easeTo({ pitch, duration: 600 }); }, [pitch]);
  useEffect(() => {
    if (flyTo) map.current?.flyTo({ center: flyTo.center, zoom: flyTo.zoom ?? 12.5, duration: 900 });
  }, [flyTo]);
  useEffect(() => {
    const canvas = map.current?.getCanvas();
    if (canvas) canvas.style.cursor = cursor ?? "";
  }, [cursor]);

  return (
    <div className={`relative ${className}`}>
      {/* maplibre sets position:relative on its container, so it needs a sized absolute parent. */}
      <div className="absolute inset-0">
        <div ref={container} className="h-full w-full" aria-label="Map of Dubai" role="region" />
      </div>
      {children}
    </div>
  );
}

export function MapLegend({ title, stops, note }: { title: string; stops: { color: string; label: string }[]; note?: string }) {
  return (
    <div className="pointer-events-auto rounded-xl border border-line bg-surface p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-1.5 font-medium text-ink">{title}</div>
      <ul className="flex flex-col gap-1">
        {stops.map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-ink-2">
            <span className="h-3 w-5 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="tabular">{s.label}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted">
          <span className="h-3 w-5 rounded-sm border border-dashed border-line" aria-hidden /> Insufficient data
        </li>
      </ul>
      {note && <p className="mt-1.5 max-w-[14rem] text-muted">{note}</p>}
    </div>
  );
}
