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

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

/** A round badge with the rep's initials; amber ring while on a visit, grey when stale. */
export function repIcon(name: string, opts: { onVisit?: boolean; stale?: boolean; selected?: boolean } = {}): L.DivIcon {
  const bg = opts.stale ? '#94a3b8' : opts.onVisit ? '#f59e0b' : '#2563eb';
  const ring = opts.selected ? '0 0 0 3px #0f172a' : '0 1px 4px rgba(0,0,0,.35)';
  return L.divIcon({
    className: 'field-rep-icon',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:${ring};display:flex;align-items:center;justify-content:center;font:600 12px/1 system-ui,sans-serif">${escapeHtml(initials(name))}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

const VISIT_COLOURS: Record<string, string> = {
  completed: '#16a34a',
  in_progress: '#f59e0b',
  scheduled: '#64748b',
  cancelled: '#dc2626',
};

/** A numbered pin for the n-th visit of the day, coloured by status. */
export function visitIcon(n: number | string, status: string): L.DivIcon {
  const bg = VISIT_COLOURS[status] ?? '#64748b';
  return L.divIcon({
    className: 'field-visit-icon',
    html: `<div style="width:26px;height:26px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:${bg};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);color:#fff;font:700 11px/1 system-ui,sans-serif">${escapeHtml(String(n))}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [4, 26],
    popupAnchor: [9, -24],
  });
}

const CATEGORY_COLOURS: Record<string, string> = { A: '#16a34a', B: '#f59e0b', C: '#64748b' };

/** A small dot per client, coloured by category (A/B/C). */
export function clientIcon(category: string, inactive = false): L.DivIcon {
  const bg = inactive ? '#cbd5e1' : (CATEGORY_COLOURS[category] ?? '#64748b');
  return L.divIcon({
    className: 'field-client-icon',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${bg};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

/** The moving "you are here" dot of trail playback. */
export const playheadIcon: L.DivIcon = L.divIcon({
  className: 'field-playhead-icon',
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 4px rgba(37,99,235,.3)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});
