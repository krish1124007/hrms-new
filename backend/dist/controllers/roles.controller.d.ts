import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createRoleSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodDefault<z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>, string[], string[]>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    permissions: string[];
    description?: string | undefined;
}, {
    name: string;
    permissions?: string[] | undefined;
    description?: string | undefined;
}>;
export declare const updateRoleSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    permissions: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    permissions?: string[] | undefined;
    description?: string | undefined;
}, {
    name?: string | undefined;
    permissions?: string[] | undefined;
    description?: string | undefined;
}>;
export declare function listRoles(_req: Request, res: Response): Promise<void>;
/** True for a role whose holders administer logins, roles or the system (or hold `*`). */
export declare function isPrivilegedRole(permissions: readonly string[]): boolean;
/**
 * `GET /roles/assignable` — every role, for a role picker (employee onboarding,
 * the employee profile's App access card), without the permission lists:
 * `{ _id, name, slug, description, isSystem, assignable, fieldAccess,
 * fieldManage, privileged }`. `assignable` is false for a role carrying a
 * permission the caller does not hold (assigning it would answer 403);
 * `fieldAccess` says whether it opens Field Visits (`field.view`: own records,
 * plus direct reports'), `fieldManage` whether it sees everybody's
 * (`field.manage`); `privileged` marks admin-like roles (`*`, users.*,
 * roles.*, settings.*, backups.manage).
 */
export declare function listAssignableRoles(req: Request, res: Response): Promise<void>;
export declare function createRole(req: Request, res: Response): Promise<void>;
export declare function getRole(req: Request, res: Response): Promise<void>;
export declare function updateRole(req: Request, res: Response): Promise<void>;
export declare function deleteRole(req: Request, res: Response): Promise<void>;
export declare function listPermissions(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=roles.controller.d.ts.map