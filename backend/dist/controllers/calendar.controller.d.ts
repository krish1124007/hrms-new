import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createEventSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startDate: z.ZodDate;
    endDate: z.ZodDate;
    isAllDay: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    attendees: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    startDate: Date;
    endDate: Date;
    title: string;
    isAllDay: boolean;
    attendees: string[];
    description?: string | undefined;
    location?: string | undefined;
    color?: string | undefined;
}, {
    startDate: Date;
    endDate: Date;
    title: string;
    description?: string | undefined;
    location?: string | undefined;
    color?: string | undefined;
    isAllDay?: boolean | undefined;
    attendees?: string[] | undefined;
}>;
export declare const updateEventSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    startDate: z.ZodOptional<z.ZodDate>;
    endDate: z.ZodOptional<z.ZodDate>;
    isAllDay: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    location: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    attendees: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    title?: string | undefined;
    location?: string | undefined;
    color?: string | undefined;
    isAllDay?: boolean | undefined;
    attendees?: string[] | undefined;
}, {
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    title?: string | undefined;
    location?: string | undefined;
    color?: string | undefined;
    isAllDay?: boolean | undefined;
    attendees?: string[] | undefined;
}>;
export declare const listEventsQuerySchema: z.ZodObject<{
    start: z.ZodOptional<z.ZodDate>;
    end: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    start?: Date | undefined;
    end?: Date | undefined;
}, {
    start?: Date | undefined;
    end?: Date | undefined;
}>;
export declare function listEvents(req: Request, res: Response): Promise<void>;
export declare function createEvent(req: Request, res: Response): Promise<void>;
export declare function getEvent(req: Request, res: Response): Promise<void>;
export declare function updateEvent(req: Request, res: Response): Promise<void>;
export declare function deleteEvent(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=calendar.controller.d.ts.map