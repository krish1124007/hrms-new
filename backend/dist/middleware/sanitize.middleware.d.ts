import type { Request, Response, NextFunction } from 'express';
/**
 * Global input sanitizer.
 *
 * - Strips MongoDB operators (`$ne`, `$gt`, dotted-path attacks) from
 *   every request body and query parameter.
 * - HTML sanitization is NOT applied here — it's opt-in at the controller
 *   level via `sanitizeRich/Basic/Strict` helpers, because per-field context
 *   matters (a "notice content" needs rich HTML; a "name" should be strict).
 */
export declare function sanitizeInputs(req: Request, _res: Response, next: NextFunction): void;
//# sourceMappingURL=sanitize.middleware.d.ts.map