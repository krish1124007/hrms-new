import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map-icons';
import { INDIA_CENTER, INDIA_ZOOM, MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '@/lib/map-config';
import { cn } from '@/lib/utils';

interface MapCanvasProps {
  height?: number | string;
  center?: [number, number];
  zoom?: number;
  className?: string;
  /** Draw vector layers (routes) on one canvas instead of SVG nodes — for thousands of points. */
  preferCanvas?: boolean;
  children?: ReactNode;
}

/**
 * Leaflet measures its container once; when the box changes size later (a
 * tab shown, the sidebar collapsed, the window resized) tiles stay grey
 * until it is told to measure again.
 */
function InvalidateOnResize(): null {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

/**
 * Every field map's frame: Leaflet with the configured tile server
 * (`VITE_MAP_TILE_URL`, OpenStreetMap by default) and bundled marker icons.
 */
export function MapCanvas({
  height = 480,
  center = INDIA_CENTER,
  zoom = INDIA_ZOOM,
  className,
  preferCanvas = false,
  children,
}: MapCanvasProps): ReactElement {
  return (
    <div
      className={cn('relative z-0 overflow-hidden rounded-lg border border-border', className)}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
        preferCanvas={preferCanvas}
      >
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />
        <InvalidateOnResize />
        {children}
      </MapContainer>
    </div>
  );
}

/**
 * Fit the map to `points` when the set of points changes (by `signature`,
 * so a moving marker does not yank the view on every update).
 */
export function FitBounds({
  points,
  signature,
  maxZoom = 16,
}: {
  points: Array<[number, number]>;
  /** Changes when the view should re-fit; defaults to the count of points. */
  signature?: string;
  maxZoom?: number;
}): null {
  const map = useMap();
  const last = useRef<string | null>(null);
  const sig = signature ?? String(points.length);
  useEffect(() => {
    if (sig === last.current || points.length === 0) return;
    last.current = sig;
    if (points.length === 1) {
      map.setView(points[0], Math.min(14, maxZoom), { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom });
  }, [sig, points, map, maxZoom]);
  return null;
}
