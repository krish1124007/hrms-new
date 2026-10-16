import type { Request, Response, NextFunction, RequestHandler } from 'express';
/**
 * Wraps an async route handler so thrown errors are forwarded
 * to Express's error middleware instead of becoming unhandled
 * promise rejections.
 */
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler;
//# sourceMappingURL=async-handler.d.ts.map