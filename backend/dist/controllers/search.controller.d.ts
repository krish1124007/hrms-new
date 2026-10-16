import type { Request, Response } from 'express';
import { z } from 'zod';
/**
 * Global search — hits multiple Meilisearch indexes in parallel and merges
 * results. Powers the `Cmd+K` command palette on the web + the global
 * search bar on mobile.
 *
 *   GET /api/v1/search?q=priya&entities=employees,customers&limit=10
 *
 * Returns per-entity hits so the frontend can group them ("Employees",
 * "Customers") without a second round-trip.
 *
 * Tenant filter is enforced server-side by `services/search.service.ts` —
 * this controller can't accidentally leak cross-tenant matches even if
 * a caller tries to pass `filter=tenantId=other`.
 */
export declare const searchQuerySchema: z.ZodObject<{
    q: z.ZodString;
    entities: z.ZodEffects<z.ZodOptional<z.ZodString>, ("documents" | "employees" | "customers" | "leads" | "deals" | "products" | "tickets")[], string | undefined>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    q: string;
    entities: ("documents" | "employees" | "customers" | "leads" | "deals" | "products" | "tickets")[];
}, {
    q: string;
    limit?: number | undefined;
    entities?: string | undefined;
}>;
export declare function globalSearch(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=search.controller.d.ts.map