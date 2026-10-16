import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const listAuditLogsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    action: z.ZodOptional<z.ZodEnum<["create", "update", "delete", "login", "logout", "export", "import", "failure"]>>;
    entity: z.ZodOptional<z.ZodString>;
    entityId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    to?: string | undefined;
    search?: string | undefined;
    userId?: string | undefined;
    from?: string | undefined;
    action?: "create" | "delete" | "update" | "login" | "logout" | "export" | "import" | "failure" | undefined;
    entity?: string | undefined;
    entityId?: string | undefined;
}, {
    limit?: number | undefined;
    to?: string | undefined;
    page?: number | undefined;
    search?: string | undefined;
    userId?: string | undefined;
    from?: string | undefined;
    action?: "create" | "delete" | "update" | "login" | "logout" | "export" | "import" | "failure" | undefined;
    entity?: string | undefined;
    entityId?: string | undefined;
}>;
export declare function listAuditLogs(req: Request, res: Response): Promise<void>;
export declare function getAuditLog(req: Request, res: Response): Promise<void>;
/** Distinct entity names — used by the frontend filter dropdown. */
export declare function listAuditEntities(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=audit-log.controller.d.ts.map