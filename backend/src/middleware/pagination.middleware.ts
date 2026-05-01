import type { Request, Response, NextFunction } from 'express';

/**
 * Enforce sane pagination defaults on every list endpoint.
 *
 * - Clamps `limit` to a hard maximum (default 100, override per-route)
 * - Clamps `page` to >= 1
 * - Supplies defaults if missing
 *
 * Prevents DoS via `?limit=999999999` which could return entire collections,
 * exhaust memory, and block the event loop.
 */
export function enforcePagination(options: { defaultLimit?: number; maxLimit?: number } = {}) {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  return (req: Request, _res: Response, next: NextFunction): void => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = { ...(req.query as any) };

    let page = parseInt(String(q.page ?? '1'), 10);
    if (!Number.isFinite(page) || page < 1) page = 1;

    let limit = parseInt(String(q.limit ?? defaultLimit), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;

    q.page = page;
    q.limit = limit;

    // Express 5: `req.query` is a getter that returns a freshly-parsed
    // object on each access — mutating it is a no-op. Override the getter
    // with a concrete value so the clamped values survive downstream.
    Object.defineProperty(req, 'query', {
      value: q,
      writable: true,
      configurable: true,
      enumerable: true,
    });

    next();
  };
}

/** Global pagination enforcer — applied once at the top of the router chain. */
export const paginationGuard = enforcePagination();
