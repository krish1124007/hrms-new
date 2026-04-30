import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Sentry integration for the API.
 *
 * Activates only when `SENTRY_DSN` is set — otherwise it's a no-op so dev
 * and CI don't need a Sentry account. Must be initialised BEFORE any other
 * imports that can throw (hence called from the top of `index.ts`).
 *
 * Captures:
 *   - Unhandled exceptions / rejections
 *   - Express errors routed through the error middleware
 *   - Explicit `captureException(err, { tags, extra })` calls
 *
 * Privacy: scrubs `password`, `token`, `authorization`, `cookie` from
 * captured request data so we don't ship credentials to Sentry.
 */

const PII_KEYS = new Set([
  'password', 'passwordconfirm', 'pass',
  'token', 'accesstoken', 'refreshtoken',
  'authorization', 'cookie', 'apikey',
]);

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: env.NODE_ENV,
    release: process.env.SENTRY_RELEASE ?? undefined,
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    // Send 10% of events to manage cost; bump to 1.0 during an incident.
    sampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE ?? '1.0'),
    beforeSend(event) {
      // Scrub sensitive fields from captured request bodies
      if (event.request?.data && typeof event.request.data === 'object') {
        event.request.data = scrub(event.request.data as Record<string, unknown>);
      }
      if (event.request?.headers) {
        event.request.headers = scrub(event.request.headers);
      }
      return event;
    },
  });

  logger.info({ env: env.NODE_ENV }, 'Sentry initialised');
}

function scrub<T extends Record<string, unknown>>(obj: T): T {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (PII_KEYS.has(k.toLowerCase())) {
      clone[k] = '[REDACTED]';
    } else if (v && typeof v === 'object') {
      clone[k] = scrub(v as Record<string, unknown>);
    } else {
      clone[k] = v;
    }
  }
  return clone as T;
}

/** Re-export Sentry for explicit capture calls elsewhere. */
export { Sentry };
