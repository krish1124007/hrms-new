import type { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestsTotal, routeTemplate } from '../lib/metrics.js';

/**
 * Probe endpoints that are excluded from the request metrics, so Prometheus
 * scraping and load balancer polling don't inflate the very metrics they're
 * reading. Keep in sync with the mounts in `app.ts` / `health.routes.ts`.
 */
const PROBE_PATHS = new Set([
  '/api/health',
  '/api/v1/health',
  '/api/readyz',
  '/api/metrics',
]);

/**
 * Observe every request's duration + outcome.
 *
 * Uses `res.on('finish')` rather than wrapping `res.end` — cleaner, and
 * fires even for streamed responses (e.g. the GDPR export download).
 */
export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const path = req.originalUrl.split('?')[0] ?? req.path;
    if (PROBE_PATHS.has(path.replace(/\/+$/, ''))) return;

    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = routeTemplate(path);
    const statusCode = String(res.statusCode);
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;

    httpRequestDuration.labels(req.method, route, statusClass).observe(durationSec);
    httpRequestsTotal.labels(req.method, route, statusCode).inc();
  });

  next();
}
