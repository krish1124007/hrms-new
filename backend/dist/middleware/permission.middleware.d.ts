import type { Request, Response, NextFunction } from 'express';
export declare function requirePermission(...required: string[]): (req: Request, _res: Response, next: NextFunction) => void;
/** Passes when the caller holds at least one of `anyOf` (or `*`). */
export declare function requireAnyPermission(...anyOf: string[]): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=permission.middleware.d.ts.map