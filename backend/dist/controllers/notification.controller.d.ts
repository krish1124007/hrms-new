import type { Request, Response } from 'express';
import { z } from 'zod';
/**
 * Per-user notification inbox.
 *
 * All endpoints scope by `tenantId` (auto via plugin) AND `userId` (from
 * the authenticated caller) — notifications are never visible across
 * users, even within the same tenant.
 */
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    unreadOnly: z.ZodEffects<z.ZodOptional<z.ZodEnum<["true", "false"]>>, boolean, "true" | "false" | undefined>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    unreadOnly: boolean;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    unreadOnly?: "true" | "false" | undefined;
}>;
export declare function listNotifications(req: Request, res: Response): Promise<void>;
export declare function getUnreadCount(req: Request, res: Response): Promise<void>;
export declare function markRead(req: Request, res: Response): Promise<void>;
export declare function markAllRead(req: Request, res: Response): Promise<void>;
export declare function deleteNotification(req: Request, res: Response): Promise<void>;
export declare const registerDeviceSchema: z.ZodObject<{
    token: z.ZodString;
    platform: z.ZodEnum<["ios", "android"]>;
    deviceName: z.ZodOptional<z.ZodString>;
    osVersion: z.ZodOptional<z.ZodString>;
    appVersion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    token: string;
    platform: "ios" | "android";
    appVersion?: string | undefined;
    deviceName?: string | undefined;
    osVersion?: string | undefined;
}, {
    token: string;
    platform: "ios" | "android";
    appVersion?: string | undefined;
    deviceName?: string | undefined;
    osVersion?: string | undefined;
}>;
/**
 * Upsert the caller's device row so subsequent push events route here.
 * Uses `{ token }` as the unique key — if the same token shows up under
 * a different user (account switch on the same phone), the row is
 * re-assigned to the new user, not duplicated.
 */
export declare function registerDevice(req: Request, res: Response): Promise<void>;
export declare function unregisterDevice(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=notification.controller.d.ts.map