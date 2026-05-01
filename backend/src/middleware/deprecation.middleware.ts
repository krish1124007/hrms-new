import type { Request, Response, NextFunction } from 'express';

/**
 * Mark an endpoint as deprecated — signals via standard RFC 8594 headers:
 *   - `Deprecation: true`
 *   - `Sunset: <date>`
 *   - `Link: <successor-url>; rel="successor-version"`
 *
 * Clients (SDKs, well-behaved HTTP libraries) surface these headers so
 * integrators know to migrate before the sunset date.
 *
 * Usage:
 *   router.get('/old-endpoint',
 *     deprecated({
 *       sunset: '2026-12-31',
 *       replacement: '/api/v2/new-endpoint',
 *     }),
 *     asyncHandler(handler),
 *   );
 */
export function deprecated(options: { sunset: string; replacement?: string }) {
  const sunsetDate = new Date(options.sunset);
  const sunsetHeader = sunsetDate.toUTCString();

  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', sunsetHeader);
    if (options.replacement) {
      res.setHeader('Link', `<${options.replacement}>; rel="successor-version"`);
    }
    next();
  };
}
