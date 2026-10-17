import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const batchSchema: z.ZodObject<{
    points: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodOptional<z.ZodDate>;
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
        speed: z.ZodOptional<z.ZodNumber>;
        altitude: z.ZodOptional<z.ZodNumber>;
        heading: z.ZodOptional<z.ZodNumber>;
        activity: z.ZodOptional<z.ZodEnum<["still", "walking", "running", "in_vehicle"]>>;
        battery: z.ZodOptional<z.ZodNumber>;
        isCharging: z.ZodOptional<z.ZodBoolean>;
        networkType: z.ZodOptional<z.ZodString>;
        isOffline: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
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
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    points: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
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
        lat: number;
        lng: number;
        accuracy?: number | undefined;
        timestamp?: Date | undefined;
        speed?: number | undefined;
        altitude?: number | undefined;
        heading?: number | undefined;
        activity?: "still" | "walking" | "running" | "in_vehicle" | undefined;
        battery?: number | undefined;
        isCharging?: boolean | undefined;
        networkType?: string | undefined;
        isOffline?: boolean | undefined;
    }[];
}>;
export declare const historyQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    date?: Date | undefined;
}, {
    date?: Date | undefined;
}>;
export declare function ingestBatch(req: Request, res: Response): Promise<void>;
export declare function liveTracking(req: Request, res: Response): Promise<void>;
export declare function trackingHistory(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-tracking.controller.d.ts.map