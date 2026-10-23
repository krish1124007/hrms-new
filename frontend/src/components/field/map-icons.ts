import L from 'leaflet';
// Bundled by Vite (hashed into dist/assets) — never fetched from a CDN.
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Leaflet guesses its image path from its own CSS URL, which a bundler breaks;
// point the default icon at the bundled copies instead.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export const defaultIcon = new L.Icon.Default();

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

const siteIconCache = new Map<string, L.DivIcon>();

/** A site pin: a small dot; grey once it has gone a month without a visit. */
export function siteIcon(opts: { stale?: boolean; selected?: boolean } = {}): L.DivIcon {
  const key = `${opts.stale ? 1 : 0}${opts.selected ? 1 : 0}`;
  const hit = siteIconCache.get(key);
  if (hit) return hit;
  const bg = opts.stale ? '#94a3b8' : '#0d9488';
  const size = opts.selected ? 20 : 16;
  const icon = L.divIcon({
    className: 'field-site-icon',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
  siteIconCache.set(key, icon);
  return icon;
}

function pointIcon(kind: 'in' | 'out'): L.DivIcon {
  const bg = kind === 'in' ? '#16a34a' : '#dc2626';
  return L.divIcon({
    className: 'field-visit-point-icon',
    html: `<div style="padding:2px 6px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);font:700 11px/1.2 system-ui,sans-serif">${kind === 'in' ? 'In' : 'Out'}</div>`,
    iconSize: [34, 20],
    iconAnchor: [17, 10],
    popupAnchor: [0, -10],
  });
}

/** A visit's check-in (green "In") and check-out (red "Out") points. */
export const checkInIcon: L.DivIcon = pointIcon('in');
export const checkOutIcon: L.DivIcon = pointIcon('out');
