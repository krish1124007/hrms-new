import type { Request, Response, NextFunction } from 'express';
/**
 * Emits an `X-Compression-Ratio` response header so we can monitor how
 * much bandwidth gzip is actually saving us. Numbers < 1.5 usually mean
 * the payload is already compressed (images, PDFs) or too small to
 * compress well — useful signal for capacity planning.
 *
 * The header value is `<uncompressedBytes>/<wireBytes>` (e.g. `154321/24567`).
 * Grafana / Datadog can parse this into a ratio metric via a regex.
 *
 * Overhead: one wrapped write() per response, plus a few bytes in headers.
 * Never runs in prod hot-paths that bypass compression (e.g. raw file
 * streams where `content-encoding` is already set upstream).
 */
export declare function compressionTelemetry(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=compression-telemetry.middleware.d.ts.map