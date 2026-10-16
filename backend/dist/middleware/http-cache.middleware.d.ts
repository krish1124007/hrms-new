import type { Request, Response, NextFunction, RequestHandler } from 'express';
export interface CacheOptions {
    /** Seconds the browser can serve the cached copy without re-validating. */
    maxAge?: number | string;
    /** Seconds to keep serving stale while revalidating in background. */
    staleWhileRevalidate?: number | string;
    /** Only cache 200 + 304. Defaults to true. */
    successOnly?: boolean;
}
/**
 * Convenience: `cacheFor('5m')` → 5 min cache, 1 min SWR.
 */
export declare function cacheFor(duration: string, opts?: CacheOptions): RequestHandler;
/**
 * `noStore` — opposite of cacheFor. Explicit opt-out for endpoints that
 * should never be cached (e.g. real-time dashboards, auth status).
 */
export declare function noStore(_req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=http-cache.middleware.d.ts.map