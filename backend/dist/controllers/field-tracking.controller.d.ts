import type { Request, Response } from 'express';
import { z } from 'zod';
/** The one ingest schema, shared with `POST /attendance/tracking/batch`. */
export declare const batchSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodEffects<z.ZodObject<{
        lat: z.ZodEffects<z.ZodNumber, number, unknown>;
        lng: z.ZodEffects<z.ZodNumber, number, unknown>;
        accuracy: z.ZodEffects<z.ZodNumber, number, unknown>;
        speed: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        heading: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        altitude: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
        recordedAt: z.ZodEffects<z.ZodOptional<z.ZodDate>, Date | undefined, unknown>;
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
export declare const trailQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
}, {
    date?: string | undefined;
}>;
/**
 * `POST /field/tracking/batch` — field-staff + consented + clocked-in gate,
 * store, broadcast; see `services/location-track.service.ts`.
 * 201 `{ ingested, dropped }` (`dropped`: fixes more than 24 h old).
 */
export declare function ingestBatch(req: Request, res: Response): Promise<void>;
/**
 * `POST /attendance/tracking/batch` — the URL shipped mobile builds poll for
 * every signed-in user. The same ingest, but a failed gate (not field staff,
 * tracking off, not clocked in) is 200 `{ ignored: true }`, never an error.
 */
export declare function ingestLegacyBatch(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/tracking/live` — each visible rep's newest fix of the last 2 h:
 * `{ employeeId, employeeCode, name, avatar, lat, lng, accuracy, speed,
 * heading, battery, recordedAt, onVisit: { visitId, clientId, clientName } | null }`.
 */
export declare function liveTracking(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/tracking/:employeeId/trail?date=YYYY-MM-DD` (also the older
 * `GET /field/tracking/history/:employeeId`) — the rep's fixes on that IST
 * day, oldest first, and that day's visits (by check-in time). Default: today.
 */
export declare function trackingTrail(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-tracking.controller.d.ts.map