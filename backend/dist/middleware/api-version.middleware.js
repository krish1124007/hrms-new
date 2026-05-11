/**
 * API version negotiation.
 *
 * Two dimensions:
 *
 *   1. **URL version** (`/api/v1/...`) — the primary, stable path. We
 *      guarantee v1 endpoints won't break in a backward-incompatible way.
 *
 *   2. **Accept header** (`Accept: application/vnd.ddhrms.v2+json`) —
 *      per-request opt-in for newer behaviours while the URL stays on v1.
 *      Useful for rolling out breaking changes to a single endpoint
 *      without cutting every client over to a new URL.
 *
 * The middleware:
 *   - Parses the requested version from either dimension
 *   - Exposes it as `req.apiVersion` so controllers can branch on it
 *   - Emits standard `Vary: Accept` and `X-API-Version` headers
 *   - Rejects with 406 `UNSUPPORTED_VERSION` if a client asks for
 *     something we don't speak.
 */
const VENDOR_RE = /application\/vnd\.ddhrms\.v(\d+)\+json/i;
const SUPPORTED = new Set([1, 2]); // bump as we ship new versions
export function apiVersionMiddleware(req, res, next) {
    let version = 1;
    // 1) URL path: /api/v<N>/
    const pathMatch = req.path.match(/^\/api\/v(\d+)\//);
    if (pathMatch)
        version = parseInt(pathMatch[1], 10);
    // 2) Accept header override
    const accept = req.header('accept') ?? '';
    const headerMatch = accept.match(VENDOR_RE);
    if (headerMatch)
        version = parseInt(headerMatch[1], 10);
    if (!SUPPORTED.has(version)) {
        res.status(406).json({
            success: false,
            error: {
                code: 'UNSUPPORTED_VERSION',
                message: `API version v${version} is not supported. Supported: ${[...SUPPORTED].join(', ')}.`,
                requestId: req.requestId,
            },
        });
        return;
    }
    req.apiVersion = version;
    res.setHeader('X-API-Version', `v${version}`);
    res.setHeader('Vary', 'Accept');
    next();
}
//# sourceMappingURL=api-version.middleware.js.map