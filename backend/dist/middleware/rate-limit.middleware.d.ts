import type { Request, Response, NextFunction } from 'express';
export declare const userRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Strict rate limit for auth endpoints.
 * Blocks after 10 tries in 15 minutes per IP.
 */
export declare const authRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function trackLoginFailure(email: string): Promise<number>;
export declare function clearLoginFailures(email: string): Promise<void>;
export declare function isAccountLocked(email: string): Promise<boolean>;
export declare function lockAccount(email: string, minutes?: number): Promise<void>;
export declare function getLockTTL(email: string): Promise<number>;
//# sourceMappingURL=rate-limit.middleware.d.ts.map