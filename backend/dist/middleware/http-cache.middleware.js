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
const UNIT_MS = { s: 1, m: 60, h: 3600, d: 86400 };
function parseDuration(input) {
    const m = input.match(/^(\d+)([smhd])$/);
    if (!m)
        throw new Error(`cacheFor: invalid duration "${input}"`);
    return parseInt(m[1], 10) * UNIT_MS[m[2]];
}
/**
 * Convenience: `cacheFor('5m')` → 5 min cache, 1 min SWR.
 */
export function cacheFor(duration, opts = {}) {
    const maxAge = typeof opts.maxAge === 'string' ? parseDuration(opts.maxAge) : opts.maxAge ?? parseDuration(duration);
    const sws = typeof opts.staleWhileRevalidate === 'string'
        ? parseDuration(opts.staleWhileRevalidate)
        : opts.staleWhileRevalidate ?? Math.max(60, Math.floor(maxAge / 5));
    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD')
            return next();
        // Hook res.json → compute weak ETag from the payload + emit 304 if matched
        const origJson = res.json.bind(res);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.json = ((body) => {
            if (opts.successOnly !== false && (res.statusCode < 200 || res.statusCode >= 300)) {
                return origJson(body);
            }
            res.setHeader('Cache-Control', `private, max-age=${maxAge}, stale-while-revalidate=${sws}`);
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
            }
            catch {
                /* body not JSON-stringifiable — skip ETag */
            }
            return origJson(body);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        });
        next();
    };
}
/**
 * `noStore` — opposite of cacheFor. Explicit opt-out for endpoints that
 * should never be cached (e.g. real-time dashboards, auth status).
 */
export function noStore(_req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
}
//# sourceMappingURL=http-cache.middleware.js.map