import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
type Target = 'body' | 'query' | 'params';
/**
 * Validates req.body / req.query / req.params against a Zod schema.
 *
 * Express 5 note: `req.query` became a getter-only property in Express 5,
 * so we can't re-assign the parsed result directly. For 'query' targets,
 * we merge Zod's coerced/transformed output field-by-field instead.
 */
export declare function validate(schema: ZodSchema, target?: Target): (req: Request, _res: Response, next: NextFunction) => void;
export {};
//# sourceMappingURL=validate.middleware.d.ts.map