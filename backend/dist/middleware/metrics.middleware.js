import { httpRequestDuration, httpRequestsTotal, routeTemplate } from '../lib/metrics.js';
/**
 * Observe every request's duration + outcome.
 *
 * Uses `res.on('finish')` rather than wrapping `res.end` — cleaner, and
 * fires even for streamed responses (e.g. the GDPR export download).
 *
 * Skips `/api/v1/health` + `/api/metrics` so Prometheus scraping itself
 * doesn't inflate the very metrics it's scraping.
 */
export function metricsMiddleware(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const path = req.originalUrl.split('?')[0] ?? req.path;
        if (path.startsWith('/api/v1/health') || path === '/api/metrics')
            return;
        const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
        const route = routeTemplate(path);
        const statusCode = String(res.statusCode);
        const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
        httpRequestDuration.labels(req.method, route, statusClass).observe(durationSec);
        httpRequestsTotal.labels(req.method, route, statusCode).inc();
    });
    next();
}
//# sourceMappingURL=metrics.middleware.js.map