import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationAppError } from '../lib/errors.js';

type Target = 'body' | 'query' | 'params';

/**
 * Validates req.body / req.query / req.params against a Zod schema.
 *
 * Express 5 note: `req.query` became a getter-only property in Express 5,
 * so we can't re-assign the parsed result directly. For 'query' targets,
 * we merge Zod's coerced/transformed output field-by-field instead.
 */
export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const zerr = result.error as ZodError;
      const details = zerr.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      }));
      return next(new ValidationAppError('Validation failed', details));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = req[target] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = result.data as any;

    if (target === 'query') {
      // Express 5: req.query is a getter, mutate in place instead of re-assigning
      if (current && typeof current === 'object') {
        // Clear existing keys first, then copy parsed values
        for (const k of Object.keys(current)) delete current[k];
        Object.assign(current, parsed);
      }
    } else {
      // body & params can be reassigned normally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[target] = parsed;
    }

    next();
  };
}
