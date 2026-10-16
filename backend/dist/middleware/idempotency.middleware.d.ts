import type { Request, Response, NextFunction } from 'express';
export declare function idempotent(ttlSeconds?: number): (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=idempotency.middleware.d.ts.map