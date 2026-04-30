import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithContext } from '../lib/async-context.js';
import { clearRequest } from '../lib/n-plus-one-detector.js';

/**
 * Wraps every request in an AsyncLocalStorage scope so the
 * tenantPlugin and other helpers can read tenantId/userId
 * without explicit threading.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId =
    (req.header('x-request-id') as string | undefined) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  // Free per-request N+1 counter when the response flushes, so long-running
  // processes don't leak memory via unbounded Maps.
  res.on('finish', () => clearRequest(requestId));
  res.on('close', () => clearRequest(requestId));

  runWithContext(
    {
      requestId,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    },
    () => next(),
  );
}
