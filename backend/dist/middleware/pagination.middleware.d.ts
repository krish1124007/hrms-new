import type { Request, Response, NextFunction } from 'express';
/**
 * Enforce sane pagination defaults on every list endpoint.
 *
 * - Clamps `limit` to a hard maximum (default 100, override per-route)
 * - Clamps `page` to >= 1
 * - Supplies defaults if missing
 *
 * Prevents DoS via `?limit=999999999` which could return entire collections,
 * exhaust memory, and block the event loop.
 */
export declare function enforcePagination(options?: {
    defaultLimit?: number;
    maxLimit?: number;
}): (req: Request, _res: Response, next: NextFunction) => void;
/** Global pagination enforcer — applied once at the top of the router chain. */
export declare const paginationGuard: (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=pagination.middleware.d.ts.map