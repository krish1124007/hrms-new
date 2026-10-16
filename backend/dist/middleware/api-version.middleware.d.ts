import type { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            apiVersion?: number;
        }
    }
}
export declare function apiVersionMiddleware(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=api-version.middleware.d.ts.map