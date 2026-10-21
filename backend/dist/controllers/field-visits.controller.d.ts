import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createVisitSchema: z.ZodObject<{
    /** Honoured only for a field manager (plan a visit for a rep). */
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    clientId: z.ZodEffects<z.ZodString, string, string>;
    purpose: z.ZodDefault<z.ZodEffects<z.ZodEnum<["sales", "service", "collection", "followup", "delivery", "other"]>, "collection" | "service" | "other" | "sales" | "followup" | "delivery", unknown>>;
    isPlanned: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
    /** A visit is planned here; check-in starts it. */
    status: z.ZodDefault<z.ZodLiteral<"scheduled">>;
    meetingWith: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "scheduled";
    clientId: string;
    purpose: "collection" | "service" | "other" | "sales" | "followup" | "delivery";
    isPlanned: boolean;
    employeeId?: string | undefined;
    notes?: string | undefined;
    meetingWith?: string | undefined;
}, {
    clientId: string;
    status?: "scheduled" | undefined;
    employeeId?: string | undefined;
    notes?: string | undefined;
    purpose?: unknown;
    meetingWith?: string | undefined;
    isPlanned?: boolean | undefined;
}>;
export declare const updateVisitSchema: z.ZodObject<{
    purpose: z.ZodOptional<z.ZodEffects<z.ZodEnum<["sales", "service", "collection", "followup", "delivery", "other"]>, "collection" | "service" | "other" | "sales" | "followup" | "delivery", unknown>>;
    notes: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodEffects<z.ZodEnum<["positive", "negative", "neutral", "followup_required"]>, "positive" | "negative" | "neutral" | "followup_required", unknown>>;
    nextFollowUpDate: z.ZodOptional<z.ZodDate>;
    followUpDate: z.ZodOptional<z.ZodDate>;
    status: z.ZodOptional<z.ZodEnum<["scheduled", "in_progress", "completed", "cancelled"]>>;
    photos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    productsDiscussed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    meetingWith: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    notes?: string | undefined;
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | "delivery" | undefined;
    nextFollowUpDate?: Date | undefined;
    photos?: string[] | undefined;
    meetingWith?: string | undefined;
    productsDiscussed?: string[] | undefined;
    followUpDate?: Date | undefined;
}, {
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    outcome?: unknown;
    notes?: string | undefined;
    purpose?: unknown;
    nextFollowUpDate?: Date | undefined;
    photos?: string[] | undefined;
    meetingWith?: string | undefined;
    productsDiscussed?: string[] | undefined;
    followUpDate?: Date | undefined;
}>;
/**
 * Web shape `{ clientId, purpose, checkIn: { location, photo, address } }`; the
 * mobile app's flat `{ clientId, purpose, location, photo, notes }` is
 * accepted too. `visitId` starts a planned visit instead of creating one.
 */
export declare const checkInSchema: z.ZodObject<{
    clientId: z.ZodEffects<z.ZodString, string, string>;
    visitId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    purpose: z.ZodDefault<z.ZodEffects<z.ZodEnum<["sales", "service", "collection", "followup", "delivery", "other"]>, "collection" | "service" | "other" | "sales" | "followup" | "delivery", unknown>>;
    isPlanned: z.ZodOptional<z.ZodBoolean>;
    checkIn: z.ZodOptional<z.ZodObject<{
        location: z.ZodOptional<z.ZodObject<{
            lat: z.ZodNumber;
            lng: z.ZodNumber;
            accuracy: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }>>;
        photo: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }, {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }>>;
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>>;
    photo: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    purpose: "collection" | "service" | "other" | "sales" | "followup" | "delivery";
    address?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    checkIn?: {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    } | undefined;
    notes?: string | undefined;
    isPlanned?: boolean | undefined;
    visitId?: string | undefined;
}, {
    clientId: string;
    address?: string | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    checkIn?: {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    } | undefined;
    notes?: string | undefined;
    purpose?: unknown;
    isPlanned?: boolean | undefined;
    visitId?: string | undefined;
}>;
/**
 * Web `{ checkOut: {...}, notes, outcome }`; mobile flat `{ location, photo,
 * outcome, followUpDate, ... }`. `notes` here are stored as `checkOut.notes`
 * (the visit's own `notes` stay the check-in notes).
 */
export declare const checkOutSchema: z.ZodObject<{
    checkOut: z.ZodOptional<z.ZodObject<{
        location: z.ZodOptional<z.ZodObject<{
            lat: z.ZodNumber;
            lng: z.ZodNumber;
            accuracy: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }, {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        }>>;
        photo: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }, {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }>>;
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>>;
    photo: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodEffects<z.ZodEnum<["positive", "negative", "neutral", "followup_required"]>, "positive" | "negative" | "neutral" | "followup_required", unknown>>;
    nextFollowUpDate: z.ZodOptional<z.ZodDate>;
    followUpDate: z.ZodOptional<z.ZodDate>;
    productsDiscussed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    address?: string | undefined;
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    checkOut?: {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    } | undefined;
    notes?: string | undefined;
    nextFollowUpDate?: Date | undefined;
    productsDiscussed?: string[] | undefined;
    followUpDate?: Date | undefined;
}, {
    address?: string | undefined;
    outcome?: unknown;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    photo?: string | undefined;
    checkOut?: {
        address?: string | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    } | undefined;
    notes?: string | undefined;
    nextFollowUpDate?: Date | undefined;
    productsDiscussed?: string[] | undefined;
    followUpDate?: Date | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    clientId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    status: z.ZodOptional<z.ZodEnum<["scheduled", "in_progress", "completed", "cancelled"]>>;
    purpose: z.ZodOptional<z.ZodEffects<z.ZodEnum<["sales", "service", "collection", "followup", "delivery", "other"]>, "collection" | "service" | "other" | "sales" | "followup" | "delivery", unknown>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | "delivery" | undefined;
}, {
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    purpose?: unknown;
}>;
export declare function listVisits(req: Request, res: Response): Promise<void>;
/** The caller's visits today (IST); a field manager without an employee record sees everyone's. */
export declare function todayVisits(req: Request, res: Response): Promise<void>;
export declare function getVisit(req: Request, res: Response): Promise<void>;
/** Plan a visit (status `scheduled`); the rep starts it with check-in. */
export declare function createVisit(req: Request, res: Response): Promise<void>;
export declare function updateVisit(req: Request, res: Response): Promise<void>;
export declare function deleteVisit(req: Request, res: Response): Promise<void>;
/**
 * Start a visit at a client. Stores how far the check-in fix was from the
 * client's pin and flags it (`locationMismatch`) beyond FIELD_VISIT_RADIUS_M;
 * a check-in without a fix at a client that has a pin is flagged
 * `locationMissing` — flags for the manager, never a refusal.
 */
export declare function checkIn(req: Request, res: Response): Promise<void>;
/** Close an open visit — once, and only after its check-in. */
export declare function checkOut(req: Request, res: Response): Promise<void>;
/** A rep's visits on one IST day (`?date=YYYY-MM-DD`, default today). */
export declare function visitTimeline(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-visits.controller.d.ts.map