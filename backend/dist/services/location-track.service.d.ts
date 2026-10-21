/**
 * Live location tracking — the one ingest and the rules every tracking read
 * shares.
 *
 * Both upload URLs (`POST /field/tracking/batch` and the older
 * `POST /attendance/tracking/batch` the shipped mobile app still calls) go
 * through `recordLocationBatch`: one schema, one gate, one store, one
 * broadcast.
 *
 * The gate ("field staff, consented and clocked in"):
 *   • field staff — only employees HR has flagged `isFieldStaff` are tracked
 *     at all (holding a `field-sales.*` permission does not make anyone field
 *     staff — HR managers hold one to run the module). Otherwise 403
 *     `NOT_FIELD_STAFF`.
 *   • consent — live tracking is switched on in the attendance config
 *     (`AttendanceConfig.liveTracking.enabled`, the company's tracking
 *     policy the employee works under). Off → 403 `TRACKING_DISABLED`.
 *   • clocked in — the employee's attendance day in progress has a check-in
 *     and no check-out (today's row, or a night shift's row from yesterday
 *     still in progress — the same rule as the attendance "today" card).
 *     Otherwise 403 `NOT_CLOCKED_IN`.
 * The legacy URL answers a failed gate with 200 `{ ignored: true }` instead
 * (shipped apps poll it and must not see errors). Fixes recorded more than
 * 24 h ago are dropped from a batch, not refused with it.
 *
 * Visibility for every read: `field-sales.manage` sees every rep; anyone
 * else sees themselves and their direct reports — and only field staff's
 * fixes are ever shown (rows stored for anyone else before this gate
 * existed stay hidden).
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
export declare const MAX_POINTS_PER_BATCH = 200;
/** Fixes recorded longer ago than this are dropped from the batch (not stored). */
export declare const MAX_POINT_AGE_MS: number;
/** The live map shows each rep's newest fix of this window. */
export declare const LIVE_WINDOW_MS: number;
/**
 * `{ points: [{ lat, lng, accuracy, speed?, heading?, recordedAt }] }`, 1–200
 * points. `timestamp` is accepted for `recordedAt` (older clients). Points
 * recorded more than 24 h ago are dropped at ingest — a phone that was
 * offline for a day still delivers the rest of its queue.
 */
export declare const trackingBatchSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodEffects<z.ZodObject<{
        lat: z.ZodEffects<z.ZodNumber, number, unknown>;
        lng: z.ZodEffects<z.ZodNumber, number, unknown>;
        /** Metres. */
        accuracy: z.ZodEffects<z.ZodNumber, number, unknown>;
        speed: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        heading: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        altitude: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        /** When the device took the fix. */
        recordedAt: z.ZodEffects<z.ZodOptional<z.ZodDate>, Date | undefined, unknown>;
        /** The shipped mobile app's name for `recordedAt`. */
        timestamp: z.ZodEffects<z.ZodOptional<z.ZodDate>, Date | undefined, unknown>;
        activity: z.ZodOptional<z.ZodEnum<["still", "walking", "running", "in_vehicle"]>>;
        battery: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        isCharging: z.ZodOptional<z.ZodBoolean>;
        networkType: z.ZodOptional<z.ZodString>;
        isOffline: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy: number;
        recordedAt?: Date | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }, {
        recordedAt?: unknown;
        lat?: unknown;
        lng?: unknown;
        accuracy?: unknown;
        timestamp?: unknown;
        speed?: unknown;
        altitude?: unknown;
        heading?: unknown;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: unknown;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }>, {
        recordedAt: Date;
        lat: number;
        lng: number;
        accuracy: number;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }, {
        recordedAt?: unknown;
        lat?: unknown;
        lng?: unknown;
        accuracy?: unknown;
        timestamp?: unknown;
        speed?: unknown;
        altitude?: unknown;
        heading?: unknown;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: unknown;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    points: {
        recordedAt: Date;
        lat: number;
        lng: number;
        accuracy: number;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }[];
}, {
    points: {
        recordedAt?: unknown;
        lat?: unknown;
        lng?: unknown;
        accuracy?: unknown;
        timestamp?: unknown;
        speed?: unknown;
        altitude?: unknown;
        heading?: unknown;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: unknown;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }[];
}>;
export type TrackingBatch = z.output<typeof trackingBatchSchema>;
export type TrackingPoint = TrackingBatch['points'][number];
interface TrackedEmployee {
    _id: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    profileImage?: string;
    reportingManager?: Types.ObjectId | null;
    shift?: unknown;
    isFieldStaff?: boolean;
}
/** The 403 codes of the tracking gate — the legacy URL answers these with 200 `{ ignored: true }`. */
export declare const TRACKING_GATE_CODES: ReadonlySet<string>;
/** Of `employeeIds`, the ones HR has flagged as field staff (hex ids). */
export declare function fieldStaffAmong(employeeIds: readonly unknown[]): Promise<Set<string>>;
/**
 * Whether the employee is clocked in at `now`: today's attendance row has a
 * check-in and no check-out, or — after midnight on a night shift — the
 * latest open check-in of the last 36 h is still in progress.
 */
export declare function isClockedIn(employee: TrackedEmployee, now: Date): Promise<boolean>;
/**
 * 403 `NOT_FIELD_STAFF` / `TRACKING_DISABLED` / `NOT_CLOCKED_IN` unless the
 * employee may be tracked now. `user` is the employee's login (populated role).
 */
export declare function assertMayTrack(employee: TrackedEmployee, _user: {
    role?: unknown;
    customPermissions?: string[];
} | null | undefined, now: Date): Promise<void>;
export declare function employeeName(e: {
    firstName?: string;
    lastName?: string;
} | null | undefined): string;
/**
 * Store a batch of the caller's fixes and broadcast the newest one. Each fix
 * keeps the device's `recordedAt` (as `timestamp`, clamped to now if the
 * phone's clock runs ahead) and gets the server's `receivedAt`, which
 * retention keys on. Fixes recorded more than 24 h ago are dropped. Returns
 * how many were stored and how many dropped.
 */
export declare function recordLocationBatch(req: Request, points: TrackingPoint[]): Promise<{
    ingested: number;
    dropped: number;
}>;
/**
 * Employee ids whose locations and visits the caller may see: `null` for a
 * `field-sales.manage` holder (everyone), else their own plus their direct
 * reports' (empty without an employee record).
 */
export declare function visibleRepIds(req: Request): Promise<Types.ObjectId[] | null>;
/** 403 `NOT_YOUR_REPORT` unless the caller may see `employeeId`'s locations. */
export declare function assertCanSeeRep(req: Request, employeeId: string): Promise<void>;
/** A `YYYY-MM-DD` calendar date that exists. */
export declare const dateKeySchema: z.ZodEffects<z.ZodString, string, string>;
/**
 * The instants of a business-timezone (IST) calendar day: `[from, to)`.
 * Defaults to today's business day.
 */
export declare function businessDayRange(dateKey?: string): {
    date: string;
    from: Date;
    to: Date;
};
/** Lower bound on check-in for a visit to count as the rep's current visit. */
export declare function openVisitSince(now?: Date): Date;
/** A lean visit with `clientId` populated (`name location`), or null when the client is gone. */
export interface VisitLike {
    _id: Types.ObjectId;
    employeeId: unknown;
    clientId: unknown;
    checkIn?: {
        time?: Date;
        location?: {
            lat?: number;
            lng?: number;
        };
    } | null;
    checkOut?: {
        time?: Date;
    } | null;
    status?: string;
    purpose?: string;
}
/**
 * A visit as a map pin: where the rep checked in, else the client's own
 * location (`lat`/`lng` null when neither is known).
 */
export declare function visitPin(v: VisitLike): {
    visitId: string;
    employeeId: string | null;
    clientId: string | null;
    clientName: string | null;
    lat: number | null;
    lng: number | null;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    status: string | null;
    purpose: string | null;
};
export {};
//# sourceMappingURL=location-track.service.d.ts.map