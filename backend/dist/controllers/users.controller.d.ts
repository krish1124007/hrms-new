import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const inviteUserSchema: z.ZodObject<{
    email: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    roleId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
}, {
    email: string;
    firstName: string;
    lastName: string;
    roleId: string;
}>;
export declare const updateUserSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    avatar: z.ZodOptional<z.ZodString>;
    roleId: z.ZodOptional<z.ZodString>;
    customPermissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    avatar?: string | undefined;
    customPermissions?: string[] | undefined;
    roleId?: string | undefined;
}, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    avatar?: string | undefined;
    customPermissions?: string[] | undefined;
    roleId?: string | undefined;
}>;
export declare const updateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["active", "inactive"]>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "inactive";
}, {
    status: "active" | "inactive";
}>;
export declare const setPasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive", "invited"]>>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    status?: "active" | "inactive" | "invited" | undefined;
    search?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    status?: "active" | "inactive" | "invited" | undefined;
    page?: number | undefined;
    search?: string | undefined;
}>;
export declare function listUsers(req: Request, res: Response): Promise<void>;
export declare function inviteUser(req: Request, res: Response): Promise<void>;
export declare function getUser(req: Request, res: Response): Promise<void>;
export declare function updateUser(req: Request, res: Response): Promise<void>;
export declare function deleteUser(req: Request, res: Response): Promise<void>;
/**
 * Admin-driven password reset. Sets `password` on the target user (the User
 * model's pre-save hook hashes it), bumps `sessionVersion` and revokes any
 * active sessions so the target is forced to log in again with the new one.
 */
export declare function setUserPassword(req: Request, res: Response): Promise<void>;
export declare function updateUserStatus(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=users.controller.d.ts.map