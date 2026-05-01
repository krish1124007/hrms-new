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
export function compressionTelemetry(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  let uncompressedBytes = 0;
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.write = (chunk: any, ...rest: any[]) => {
    if (chunk) uncompressedBytes += Buffer.byteLength(chunk);
    return origWrite(chunk, ...rest);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = (chunk?: any, ...rest: any[]) => {
    if (chunk) uncompressedBytes += Buffer.byteLength(chunk);
    // Content-Length after compression (set by compression middleware) vs pre-compression byte count
    const wire = parseInt(res.getHeader('content-length') as string, 10);
    if (!Number.isNaN(wire) && wire > 0 && uncompressedBytes > 0) {
      res.setHeader('X-Compression-Ratio', `${uncompressedBytes}/${wire}`);
    }
    return origEnd(chunk, ...rest);
  };

  void req;
  next();
}
