/**
 * Map settings, read once from the build environment.
 *
 * - `VITE_MAP_TILE_URL`: the tile server (a Leaflet URL template). Defaults to
 *   OpenStreetMap; point it at an internal tile cache for offices that block
 *   openstreetmap.org. `VITE_MAP_TILE_ATTRIBUTION` overrides the credit line.
 * - `VITE_GEOCODE_URL`: a Nominatim-compatible search endpoint for "find an
 *   address" boxes. Empty (the default) hides the feature — nothing is sent
 *   to a third party unless an operator opts in.
 */

const env = import.meta.env;

export const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_TILE_URL: string = env.VITE_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
export const MAP_TILE_ATTRIBUTION: string =
  env.VITE_MAP_TILE_ATTRIBUTION?.trim() || DEFAULT_ATTRIBUTION;

/** Geocoding search endpoint (`?format=json&limit=1&q=` is appended), or '' when off. */
export const GEOCODE_URL: string = env.VITE_GEOCODE_URL?.trim() ?? '';

/** Centre of India — the opening view before any pin is known. */
export const INDIA_CENTER: [number, number] = [22.9734, 78.6569];
export const INDIA_ZOOM = 5;

/**
 * A Leaflet bounds string clamped to what the API accepts
 * (`minLng,minLat,maxLng,maxLat` within ±180 / ±90). Zoomed far out, Leaflet
 * reports longitudes beyond ±180 as the world repeats.
 */
export function clampBBox(minLng: number, minLat: number, maxLng: number, maxLat: number): string {
  const c = (v: number, lim: number): number => Math.max(-lim, Math.min(lim, v));
  const round = (v: number): number => Math.round(v * 1e5) / 1e5;
  return [c(minLng, 180), c(minLat, 90), c(maxLng, 180), c(maxLat, 90)].map(round).join(',');
}

/** Look up an address; `null` when nothing matched. Throws when geocoding is off. */
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!GEOCODE_URL) throw new Error('Address search is not configured');
  const sep = GEOCODE_URL.includes('?') ? '&' : '?';
  const res = await fetch(`${GEOCODE_URL}${sep}format=json&limit=1&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(data) || data.length === 0) return null;
  return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
}
