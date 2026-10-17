import { createHash, timingSafeEqual } from 'node:crypto';
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Constant-time string comparison (digests first, so lengths never leak). */
function tokensMatch(presented, expected) {
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
}
function isLoopback(address) {
    return address !== undefined && LOOPBACK_IPS.has(address);
}
/**
 * Restricts the Prometheus scrape endpoint. A request is allowed when
 *   - BOTH `req.ip` AND `req.socket.remoteAddress` are loopback addresses
 *     (127.0.0.1, ::1, ::ffff:127.0.0.1), or
 *   - it presents the configured shared secret in `X-Metrics-Token`.
 * Everything else gets 403.
 *
 * `req.ip` alone is not enough: with `trust proxy` it follows
 * `X-Forwarded-For`, so anyone who can reach the Node port directly could send
 * `X-Forwarded-For: 127.0.0.1` and pass. Requiring the TCP peer
 * (`req.socket.remoteAddress`) to be loopback as well means a spoofed header
 * from a remote socket still falls through to the token check, while a local
 * scraper or a same-host reverse proxy (whose forwarded client address is
 * itself loopback) keeps working.
 */
export function metricsGuard(metricsToken) {
    return (req, res, next) => {
        if (isLoopback(req.ip) && isLoopback(req.socket.remoteAddress))
            return next();
        const presented = req.get('x-metrics-token');
        if (metricsToken && presented && tokensMatch(presented, metricsToken))
            return next();
        res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Metrics are restricted' },
        });
    };
}
//# sourceMappingURL=metrics-guard.middleware.js.map