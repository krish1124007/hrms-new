import L from 'leaflet';
import type { TeamMemberStatus } from '@/lib/field-reports.api';
import type { RoutePointKind } from '@/lib/field-route';
import { initials } from './map-icons';

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export const STATUS_COLOURS: Record<TeamMemberStatus, string> = {
  at_site: '#16a34a',
  between_sites: '#f59e0b',
  day_ended: '#64748b',
  not_started: '#cbd5e1',
};

const statusIconCache = new Map<string, L.DivIcon>();
const STATUS_ICON_CACHE_MAX = 500;

/**
 * A round badge with the person's initials, coloured by status (green at a
 * site, amber between sites, slate when the day has ended). Cached per look,
 * so each 60 s refresh hands every marker the same icon object and Leaflet
 * does not rebuild its DOM.
 */
export function statusIcon(name: string, status: TeamMemberStatus, selected = false): L.DivIcon {
  const key = `${initials(name)}|${status}|${selected ? 1 : 0}`;
  const hit = statusIconCache.get(key);
  if (hit) return hit;
  if (statusIconCache.size >= STATUS_ICON_CACHE_MAX) statusIconCache.clear();
  const bg = STATUS_COLOURS[status] ?? '#64748b';
  const ring = selected ? '0 0 0 3px #0f172a' : '0 1px 4px rgba(0,0,0,.35)';
  const icon = L.divIcon({
    className: 'field-team-icon',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:${ring};display:flex;align-items:center;justify-content:center;font:600 12px/1 system-ui,sans-serif">${escapeHtml(initials(name))}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
  statusIconCache.set(key, icon);
  return icon;
}

export const POINT_COLOURS: Record<RoutePointKind, string> = {
  day_in: '#2563eb',
  visit_in: '#16a34a',
  visit_out: '#0d9488',
  day_out: '#7c3aed',
};

/** The n-th check-in/out point of a day, coloured by its kind. */
export function pointIcon(n: number, kind: RoutePointKind): L.DivIcon {
  const bg = POINT_COLOURS[kind] ?? '#64748b';
  return L.divIcon({
    className: 'field-point-icon',
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:${bg};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 11px/1 system-ui,sans-serif">${n}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}
