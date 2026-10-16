import type { Request, Response, NextFunction } from 'express';
/**
 * Wraps every request in an AsyncLocalStorage scope so the
 * tenantPlugin and other helpers can read tenantId/userId
 * without explicit threading.
 */
export declare function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=request-context.middleware.d.ts.map