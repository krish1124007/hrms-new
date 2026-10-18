import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createVisitSchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodString;
    purpose: z.ZodDefault<z.ZodEnum<["sales", "service", "collection", "followup", "other"]>>;
    isPlanned: z.ZodDefault<z.ZodBoolean>;
    notes: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["scheduled", "in_progress", "completed", "cancelled"]>>;
    meetingWith: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "completed" | "scheduled" | "in_progress";
    clientId: string;
    purpose: "collection" | "service" | "other" | "sales" | "followup";
    isPlanned: boolean;
    employeeId?: string | undefined;
    notes?: string | undefined;
    meetingWith?: string | undefined;
}, {
    clientId: string;
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    employeeId?: string | undefined;
    notes?: string | undefined;
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | undefined;
    meetingWith?: string | undefined;
    isPlanned?: boolean | undefined;
}>;
export declare const updateVisitSchema: z.ZodObject<{
    purpose: z.ZodOptional<z.ZodEnum<["sales", "service", "collection", "followup", "other"]>>;
    notes: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodEnum<["positive", "negative", "neutral", "followup_required"]>>;
    nextFollowUpDate: z.ZodOptional<z.ZodDate>;
    status: z.ZodOptional<z.ZodEnum<["scheduled", "in_progress", "completed", "cancelled"]>>;
    photos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    productsDiscussed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    notes?: string | undefined;
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | undefined;
    nextFollowUpDate?: Date | undefined;
    photos?: string[] | undefined;
    productsDiscussed?: string[] | undefined;
}, {
    status?: "cancelled" | "completed" | "scheduled" | "in_progress" | undefined;
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    notes?: string | undefined;
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | undefined;
    nextFollowUpDate?: Date | undefined;
    photos?: string[] | undefined;
    productsDiscussed?: string[] | undefined;
}>;
export declare const checkInSchema: z.ZodObject<{
    clientId: z.ZodString;
    purpose: z.ZodDefault<z.ZodEnum<["sales", "service", "collection", "followup", "other"]>>;
    checkIn: z.ZodObject<{
        time: z.ZodOptional<z.ZodDate>;
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
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }, {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }>;
    isPlanned: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    clientId: string;
    checkIn: {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    };
    purpose: "collection" | "service" | "other" | "sales" | "followup";
    isPlanned: boolean;
}, {
    clientId: string;
    checkIn: {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    };
    purpose?: "collection" | "service" | "other" | "sales" | "followup" | undefined;
    isPlanned?: boolean | undefined;
}>;
export declare const checkOutSchema: z.ZodObject<{
    checkOut: z.ZodObject<{
        time: z.ZodOptional<z.ZodDate>;
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
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }, {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    }>;
    notes: z.ZodOptional<z.ZodString>;
    outcome: z.ZodOptional<z.ZodEnum<["positive", "negative", "neutral", "followup_required"]>>;
    productsDiscussed: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    checkOut: {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    };
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    notes?: string | undefined;
    productsDiscussed?: string[] | undefined;
}, {
    checkOut: {
        address?: string | undefined;
        time?: Date | undefined;
        location?: {
            lat: number;
            lng: number;
            accuracy?: number | undefined;
        } | undefined;
        photo?: string | undefined;
    };
    outcome?: "positive" | "negative" | "neutral" | "followup_required" | undefined;
    notes?: string | undefined;
    productsDiscussed?: string[] | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    purpose: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: string | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    purpose?: string | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    purpose?: string | undefined;
}>;
export declare function listVisits(req: Request, res: Response): Promise<void>;
export declare function todayVisits(req: Request, res: Response): Promise<void>;
export declare function getVisit(req: Request, res: Response): Promise<void>;
export declare function createVisit(req: Request, res: Response): Promise<void>;
export declare function updateVisit(req: Request, res: Response): Promise<void>;
export declare function deleteVisit(req: Request, res: Response): Promise<void>;
export declare function checkIn(req: Request, res: Response): Promise<void>;
export declare function checkOut(req: Request, res: Response): Promise<void>;
export declare function visitTimeline(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-visits.controller.d.ts.map