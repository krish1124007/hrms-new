import type { VehicleType } from './field.api';
import { formatNumber } from './format';

/**
 * Day routes and travel allowance (the km between a day's check-in/out
 * points). The server measures the legs and totals them; these helpers
 * only label them and apply the claim rules the server enforces too.
 */

export type RoutePointKind = 'day_in' | 'visit_in' | 'visit_out' | 'day_out';

/**
 * A check-in/out point of a day, as every route the server returns lists it
 * (route, team status `lastPoint`, travel day, daily report, travel claim).
 * Only points with a GPS fix are listed.
 */
export interface RoutePoint {
  lat: number;
  lng: number;
  at: string;
  kind: RoutePointKind;
  /** Visit points only. */
  siteName?: string;
}

/**
 * The measured distance between two of the day's points (indices into its
 * `points`). Legs the server skipped (a visit's own check-in → check-out
 * under 50 m) are simply absent.
 */
export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  /** Straight line × 1.3 because road distance was unavailable. */
  estimated: boolean;
}

export const POINT_KIND_LABEL: Record<RoutePointKind, string> = {
  day_in: 'Day check-in',
  visit_in: 'Visit check-in',
  visit_out: 'Visit check-out',
  day_out: 'Day check-out',
};

export function pointKindLabel(kind: RoutePointKind): string {
  return POINT_KIND_LABEL[kind];
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

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  bike: 'Two-wheeler',
  car: 'Car',
  other: 'Other',
};

/** `50 km · Two-wheeler` — a travel claim in a few words. */
export function travelSummary(travel: { claimedKm: number; vehicleType: VehicleType }): string {
  const km = formatNumber(travel.claimedKm, { maximumFractionDigits: 1 });
  return `${km} km · ${VEHICLE_LABEL[travel.vehicleType]}`;
}
