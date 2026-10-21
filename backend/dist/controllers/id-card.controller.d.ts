import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTemplateSchema: z.ZodObject<{
    name: z.ZodString;
    layout: z.ZodDefault<z.ZodEnum<["horizontal", "vertical"]>>;
    fields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    backgroundColor: z.ZodDefault<z.ZodString>;
    textColor: z.ZodDefault<z.ZodString>;
    logo: z.ZodOptional<z.ZodString>;
    template: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    layout: "horizontal" | "vertical";
    fields: string[];
    backgroundColor: string;
    textColor: string;
    logo?: string | undefined;
    template?: Record<string, unknown> | undefined;
}, {
    name: string;
    layout?: "horizontal" | "vertical" | undefined;
    fields?: string[] | undefined;
    backgroundColor?: string | undefined;
    textColor?: string | undefined;
    logo?: string | undefined;
    template?: Record<string, unknown> | undefined;
}>;
export declare const updateTemplateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    layout: z.ZodOptional<z.ZodDefault<z.ZodEnum<["horizontal", "vertical"]>>>;
    fields: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    backgroundColor: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    textColor: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    logo: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    template: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    layout?: "horizontal" | "vertical" | undefined;
    fields?: string[] | undefined;
    backgroundColor?: string | undefined;
    textColor?: string | undefined;
    logo?: string | undefined;
    template?: Record<string, unknown> | undefined;
}, {
    name?: string | undefined;
    layout?: "horizontal" | "vertical" | undefined;
    fields?: string[] | undefined;
    backgroundColor?: string | undefined;
    textColor?: string | undefined;
    logo?: string | undefined;
    template?: Record<string, unknown> | undefined;
}>;
export declare function listTemplates(_req: Request, res: Response): Promise<void>;
export declare function createTemplate(req: Request, res: Response): Promise<void>;
export declare function updateTemplate(req: Request, res: Response): Promise<void>;
/**
 * GET /api/v1/id-cards/verify/:code — PUBLIC. This is what a QR scan lands on.
 *
 * Deliberately minimal: enough for a guard or visitor to confirm the person in
 * front of them holds a genuine, currently-active card, and nothing more. No
 * email, phone, address, salary or bank details — a scan is not a login.
 */
export declare function verifyIdCard(req: Request, res: Response): Promise<void>;
/**
 * GET /api/v1/id-cards/my — the caller's own card.
 *
 * There is no id parameter by design: the employee is resolved from the
 * authenticated user, so this route cannot return anybody else's card no
 * matter what the client sends.
 */
export declare function myIdCard(req: Request, res: Response): Promise<void>;
/**
 * GET /api/v1/id-cards/generate/:employeeId — any employee's card, for HR.
 *
 * Previously this populated `departmentId`/`designationId`, which are not
 * fields on the Employee schema — Mongoose 8 rejects unknown populate paths,
 * so the route always failed. It also had no permission guard at all.
 */
export declare function generateIdCard(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=id-card.controller.d.ts.map