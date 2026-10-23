import { Types } from 'mongoose';
import { z } from 'zod';
export type RoutePointKind = 'day_in' | 'visit_in' | 'visit_out' | 'day_out';
export interface RoutePoint {
    lat: number;
    lng: number;
    at: Date;
    kind: RoutePointKind;
    siteName?: string;
    /** Visit points: the visit (internal — not part of the public point). */
    visitId?: string;
}
export interface RouteLeg {
    fromIndex: number;
    toIndex: number;
    distanceM: number;
    estimated: boolean;
}
export interface DayRoute {
    date: string;
    points: RoutePoint[];
    legs: RouteLeg[];
    totalKm: number;
    estimated: boolean;
}
/** A route that fell back while Google is configured is measured again after this long. */
export declare const ROUTE_RETRY_AFTER_MS: number;
/** A visit's own check-in → check-out leg shorter than this is not travel. */
export declare const SAME_VISIT_MIN_LEG_M = 50;
/** A `YYYY-MM-DD` calendar date that exists. */
export declare const dateKeySchema: z.ZodEffects<z.ZodString, string, string>;
export interface FieldDay {
    /** `YYYY-MM-DD`. */
    date: string;
    /** Attendance day label: UTC midnight of the date. */
    label: Date;
    /** `[from, to)`: the instants of the IST day. */
    from: Date;
    to: Date;
}
/** The IST day `date` names (default: today). */
export declare function fieldDay(date?: string): FieldDay;
/** The IST calendar date (`YYYY-MM-DD`) an instant falls on. */
export declare function istDate(at: Date): string;
/** Calendar days from `from` to `to` inclusive (both `YYYY-MM-DD`). */
export declare function daysBetween(from: string, to: string): number;
interface Fix {
    lat?: number;
    lng?: number;
    accuracy?: number;
}
interface Punch {
    time?: Date;
    location?: Fix | null;
}
export interface DaySite {
    _id: Types.ObjectId;
    name?: string;
    type?: string;
    radiusM?: number;
    location?: {
        coordinates?: number[];
    } | null;
}
/** A lean visit with its site populated (null when the site record is gone). */
export interface DayVisit {
    _id: Types.ObjectId;
    employeeId: Types.ObjectId;
    siteId: DaySite | null;
    purpose?: string;
    status: string;
    plannedDate?: Date;
    checkIn?: (Punch & {
        distanceM?: number;
        capturedAt?: Date;
        receivedAt?: Date;
    }) | null;
    checkOut?: (Punch & {
        distanceM?: number;
    }) | null;
    durationMinutes?: number;
    flags?: Record<string, boolean>;
    report?: Record<string, unknown> | null;
}
export interface FieldDayData {
    /** Hex Employee `_id`. */
    employeeId: string;
    date: string;
    attendance: {
        checkIn?: Punch | null;
        checkOut?: Punch | null;
    } | null;
    /** Checked in on that day, not cancelled, oldest check-in first. */
    visits: DayVisit[];
}
export declare const dayKey: (employeeId: string, date: string) => string;
/** Populate for a visit's site — kept even when the site was deleted since. */
export declare const VISIT_SITE_POPULATE: {
    path: string;
    select: string;
    options: {
        withDeleted: boolean;
    };
};
/**
 * The attendance rows and checked-in visits of `employeeIds` (or everybody)
 * for every IST day from `from` to `to`, one entry per employee and day
 * that has either — or, with `visitDaysOnly`, per employee and day with a
 * visit (field days; attendance-only office days are left out).
 */
export declare function loadFieldDays(opts: {
    employeeIds: Types.ObjectId[] | 'all';
    from: string;
    to: string;
    visitDaysOnly?: boolean;
}): Promise<FieldDayData[]>;
/** `{ lat, lng }` of a usable GPS fix, else null (absent, not finite, out of range or the 0,0 placeholder). */
export declare function fixOf(location: Fix | null | undefined): {
    lat: number;
    lng: number;
} | null;
/** The day's check-in/out points with a GPS fix, sorted by time. */
export declare function dayPointsOf(day: Pick<FieldDayData, 'attendance' | 'visits'> | null | undefined): RoutePoint[];
/** A point as the API shows it: `{ lat, lng, at, kind, siteName? }`. */
export declare function publicPoint(p: RoutePoint): {
    lat: number;
    lng: number;
    at: Date;
    kind: RoutePointKind;
    siteName?: string;
};
/** A route as the API shows it (`GET /field/route/:employeeId`). */
export declare function publicRoute(route: DayRoute): {
    date: string;
    points: {
        lat: number;
        lng: number;
        at: Date;
        kind: RoutePointKind;
        siteName?: string;
    }[];
    legs: RouteLeg[];
    totalKm: number;
    estimated: boolean;
};
/** Metres → km, two decimals. */
export declare const metresToKm: (metres: number) => number;
/** The consecutive point pairs that are travel (a visit's own leg under 50 m is not). */
export declare function travelSegments(points: RoutePoint[]): Array<{
    fromIndex: number;
    toIndex: number;
}>;
/** Measure the travel legs between `points` (Google, or the estimate). */
export declare function measureLegs(points: RoutePoint[]): Promise<RouteLeg[]>;
/**
 * Day routes for many employee-days at once (keyed `employeeId|date`):
 * cached legs where the points are unchanged, measured (and cached) otherwise.
 */
export declare function measureDays(days: ReadonlyArray<{
    employeeId: string;
    date: string;
    points: RoutePoint[];
}>): Promise<Map<string, DayRoute>>;
/** One employee's day: its raw data, points and measured route. */
export declare function dayRoute(employeeId: Types.ObjectId | string, date: string): Promise<{
    data: FieldDayData;
    route: DayRoute;
}>;
export {};
//# sourceMappingURL=field-route.service.d.ts.map