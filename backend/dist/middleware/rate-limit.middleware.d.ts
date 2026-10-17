import type { Request, Response, NextFunction } from 'express';
export declare const userRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
/**
 * Rate limit for auth endpoints: 100 tries in 15 minutes per IP. Per IP, not
 * per person — a whole office behind one NAT address shares the budget, so it
 * is sized for a morning of colleagues signing in. Password guessing against
 * one account is stopped separately by the per email+IP lockout below.
 */
export declare const authRateLimit: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare function trackLoginFailure(email: string, ip: string): Promise<number>;
export declare function clearLoginFailures(email: string, ip: string): Promise<void>;
export declare function isAccountLocked(email: string, ip: string): Promise<boolean>;
export declare function lockAccount(email: string, ip: string, minutes?: number): Promise<void>;
export declare function getLockTTL(email: string, ip: string): Promise<number>;
//# sourceMappingURL=rate-limit.middleware.d.ts.map