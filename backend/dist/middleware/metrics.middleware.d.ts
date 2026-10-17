import type { Request, Response, NextFunction } from 'express';
/**
 * Observe every request's duration + outcome.
 *
 * Uses `res.on('finish')` rather than wrapping `res.end` — cleaner, and
 * fires even for streamed responses (e.g. the GDPR export download).
 */
export declare function metricsMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=metrics.middleware.d.ts.map