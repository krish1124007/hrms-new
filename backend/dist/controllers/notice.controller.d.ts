import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createNoticeSchema: z.ZodObject<{
    title: z.ZodString;
    content: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["normal", "important", "urgent"]>>;
    /** Restrict visibility to these departments. Empty array = all employees. */
    departments: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isPinned: z.ZodDefault<z.ZodBoolean>;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodDefault<z.ZodNumber>;
        mimeType: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        url: string;
        mimeType: string;
    }, {
        name: string;
        url: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    content: string;
    attachments: {
        name: string;
        size: number;
        url: string;
        mimeType: string;
    }[];
    isPinned: boolean;
    priority: "urgent" | "normal" | "important";
    departments: string[];
    expiresAt?: Date | undefined;
}, {
    title: string;
    content: string;
    attachments?: {
        name: string;
        url: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }[] | undefined;
    expiresAt?: Date | undefined;
    isPinned?: boolean | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
    departments?: string[] | undefined;
}>;
export declare const updateNoticeSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodEnum<["normal", "important", "urgent"]>>>;
    departments: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    expiresAt: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    isPinned: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    attachments: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodDefault<z.ZodNumber>;
        mimeType: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        url: string;
        mimeType: string;
    }, {
        name: string;
        url: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    content?: string | undefined;
    attachments?: {
        name: string;
        size: number;
        url: string;
        mimeType: string;
    }[] | undefined;
    expiresAt?: Date | undefined;
    isPinned?: boolean | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
    departments?: string[] | undefined;
}, {
    title?: string | undefined;
    content?: string | undefined;
    attachments?: {
        name: string;
        url: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }[] | undefined;
    expiresAt?: Date | undefined;
    isPinned?: boolean | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
    departments?: string[] | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["normal", "important", "urgent"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
}>;
export declare function listNotices(req: Request, res: Response): Promise<void>;
export declare function createNotice(req: Request, res: Response): Promise<void>;
export declare function getNotice(req: Request, res: Response): Promise<void>;
export declare function updateNotice(req: Request, res: Response): Promise<void>;
export declare function deleteNotice(req: Request, res: Response): Promise<void>;
export declare function acknowledgeNotice(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=notice.controller.d.ts.map