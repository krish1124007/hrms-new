import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** Constant-time string comparison (digests first, so lengths never leak). */
function tokensMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Restricts the Prometheus scrape endpoint. A request is allowed when it comes
 * from the loopback interface (a local scraper / sidecar), or presents the
 * configured shared secret in `X-Metrics-Token`. Everything else gets 403.
 *
 * `req.ip` honours `trust proxy`, so behind nginx it is the forwarded client
 * address, not the proxy's — a public caller cannot pass as loopback unless the
 * proxy itself forwards a loopback address.
 */
export function metricsGuard(metricsToken?: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.ip && LOOPBACK_IPS.has(req.ip)) return next();

    const presented = req.get('x-metrics-token');
    if (metricsToken && presented && tokensMatch(presented, metricsToken)) return next();

    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Metrics are restricted' },
    });
  };
}
