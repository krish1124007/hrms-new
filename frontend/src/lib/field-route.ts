import { formatNumber } from './format';

/**
 * Day routes and travel allowance (the km between a day's check-in/out
 * points). The server measures the legs; these helpers only add them up,
 * label them and apply the claim rules the server enforces too.
 */

export type RoutePointKind = 'day_in' | 'visit_in' | 'visit_out' | 'day_out';

export interface RouteLegLike {
  distanceM: number;
  estimated: boolean;
}

export const POINT_KIND_LABEL: Record<RoutePointKind, string> = {
  day_in: 'Day check-in',
  visit_in: 'Visit check-in',
  visit_out: 'Visit check-out',
  day_out: 'Day check-out',
};

/** A label for a point kind; unknown kinds (a newer server) read as-is. */
export function pointKindLabel(kind: string): string {
  return POINT_KIND_LABEL[kind as RoutePointKind] ?? kind.replace(/_/g, ' ');
}

/** The day's distance: the sum of its legs, in km. */
export function legsTotalKm(legs: readonly RouteLegLike[]): number {
  return legs.reduce((sum, l) => sum + (Number.isFinite(l.distanceM) ? l.distanceM : 0), 0) / 1000;
}

/**
 * Road distance was unavailable for at least one leg (Google not configured
 * or failing), so the km is straight line × 1.3.
 */
export function isRouteEstimated(route: { estimated?: boolean; legs: readonly RouteLegLike[] }): boolean {
  return !!route.estimated || route.legs.some((l) => l.estimated);
}

/** The largest difference from the calculated km that needs no reason. */
export const KM_TOLERANCE = 0.05;

/**
 * Whether a claim for `claimedKm` must say why: it differs from the
 * calculated km by more than 5 % (any km at all when nothing was calculated).
 */
export function kmNeedsReason(computedKm: number, claimedKm: number | undefined): boolean {
  if (claimedKm === undefined || !Number.isFinite(claimedKm)) return false;
  if (computedKm <= 0) return claimedKm > 0;
  // A hair of slack so float noise (42 against 40 → 5.0000001 %) is not "more than 5 %".
  return Math.abs(claimedKm - computedKm) / computedKm > KM_TOLERANCE + 1e-9;
}

/** The allowance for a day: km × rate, in whole rupees (as the server books it). */
export function travelAmount(km: number, ratePerKm: number): number {
  return Math.round(km * ratePerKm);
}

/** `12.5 km` — always one decimal. */
export function formatKm(km: number): string {
  return `${formatNumber(km, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

/** `₹1,250` (paise only when there are any). */
export function formatRupees(amount: number): string {
  return `₹${formatNumber(amount, { maximumFractionDigits: 2 })}`;
}

export const VEHICLE_LABEL: Record<string, string> = {
  bike: 'Two-wheeler',
  car: 'Car',
  other: 'Other',
};

/** `50 km · Two-wheeler` — a travel claim in a few words. */
export function travelSummary(travel: { claimedKm: number; vehicleType: string }): string {
  const km = formatNumber(travel.claimedKm, { maximumFractionDigits: 1 });
  return `${km} km · ${VEHICLE_LABEL[travel.vehicleType] ?? travel.vehicleType}`;
}
