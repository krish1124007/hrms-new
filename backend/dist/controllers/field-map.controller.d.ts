/**
 * Read-only map pins for the field web map: the day's visits and the clients
 * inside the visible map area.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
/** Most pins one map request returns. */
export declare const CLIENTS_MAP_LIMIT = 500;
export declare const VISITS_MAP_LIMIT = 1000;
export declare const visitsMapQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
    employeeId?: string | undefined;
}, {
    date?: string | undefined;
    employeeId?: string | undefined;
}>;
export declare const clientsMapQuerySchema: z.ZodObject<{
    bbox: z.ZodOptional<z.ZodEffects<z.ZodString, {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
    }, string>>;
}, "strip", z.ZodTypeAny, {
    bbox?: {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
    } | undefined;
}, {
    bbox?: string | undefined;
}>;
/**
 * `GET /field/visits/map?date=YYYY-MM-DD&employeeId=` — visits checked in on
 * that IST day (default today) that have a location, for the reps the caller
 * may see (`employeeId` narrows to one; 403 when that rep is not visible).
 * Each pin: `{ visitId, employeeId, employeeName, clientId, clientName, lat,
 * lng, checkInAt, checkOutAt, status, purpose }`. At most 1 000, `truncated`
 * says whether more exist.
 */
export declare function visitsMap(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/clients/map?bbox=minLng,minLat,maxLng,maxLat` — clients with a
 * location inside the box (every located client without `bbox`), by name, at
 * most 500: `{ _id, name, category, status, lat, lng, address, assignedTo:
 * { _id, firstName, lastName } | null, lastVisitDate }`; `truncated` says
 * whether more exist.
 */
export declare function clientsMap(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-map.controller.d.ts.map