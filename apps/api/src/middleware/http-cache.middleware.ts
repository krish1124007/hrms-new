import type { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'node:crypto';

/**
 * HTTP cache helpers for **GET** endpoints whose response is safe to
 * cache briefly at the client/CDN level.
 *
 *   router.get('/plans', cacheFor('5m'), asyncHandler(listPlans));
 *
 * Sets `Cache-Control: private, max-age=<seconds>, stale-while-revalidate=<sws>`
 * so the browser uses the cached copy for `max-age` seconds AND keeps
 * serving it while re-validating in the background for `sws` seconds.
 *
 * Also emits a weak ETag computed from the response body so repeat
 * requests with `If-None-Match` get a 304 instead of re-downloading —
 * cheap bandwidth win for heavy list endpoints.
 *
 * Use `private` (not `public`) everywhere — all our endpoints are
 * tenant-scoped and must NEVER be cached by shared CDNs.
 */

const UNIT_MS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
function parseDuration(input: string): number {
  const m = input.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`cacheFor: invalid duration "${input}"`);
  return parseInt(m[1], 10) * UNIT_MS[m[2]];
}

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
export function cacheFor(duration: string, opts: CacheOptions = {}): RequestHandler {
  const maxAge = typeof opts.maxAge === 'string' ? parseDuration(opts.maxAge) : opts.maxAge ?? parseDuration(duration);
  const sws =
    typeof opts.staleWhileRevalidate === 'string'
      ? parseDuration(opts.staleWhileRevalidate)
      : opts.staleWhileRevalidate ?? Math.max(60, Math.floor(maxAge / 5));

  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Hook res.json → compute weak ETag from the payload + emit 304 if matched
    const origJson = res.json.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.json = ((body: any) => {
      if (opts.successOnly !== false && (res.statusCode < 200 || res.statusCode >= 300)) {
        return origJson(body);
      }
      res.setHeader(
        'Cache-Control',
        `private, max-age=${maxAge}, stale-while-revalidate=${sws}`,
      );
      try {
        const etag = 'W/"' + crypto
          .createHash('sha1')
          .update(JSON.stringify(body))
          .digest('hex')
          .slice(0, 16) + '"';
        res.setHeader('ETag', etag);
        if (req.header('if-none-match') === etag) {
          res.status(304);
          res.end();
          return res;
        }
      } catch {
        /* body not JSON-stringifiable — skip ETag */
      }
      return origJson(body);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    next();
  };
}

/**
 * `noStore` — opposite of cacheFor. Explicit opt-out for endpoints that
 * should never be cached (e.g. real-time dashboards, auth status).
 */
export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
}
