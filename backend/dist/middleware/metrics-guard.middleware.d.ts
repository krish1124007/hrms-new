import type { RequestHandler } from 'express';
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
export declare function metricsGuard(metricsToken?: string): RequestHandler;
//# sourceMappingURL=metrics-guard.middleware.d.ts.map