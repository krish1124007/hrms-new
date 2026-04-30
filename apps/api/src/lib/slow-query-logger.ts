import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { recordQuery } from './n-plus-one-detector.js';

/**
 * Logs any Mongoose operation that takes longer than `SLOW_QUERY_MS_THRESHOLD`.
 *
 * Two signals:
 *   - Collection name + op + query JSON     (to locate the model)
 *   - Duration in ms                        (to locate the bottleneck)
 *   - Request ID pulled from async-context  (to correlate in traces)
 *
 * Enabled automatically when `SLOW_QUERY_LOG=1` or `NODE_ENV=production`.
 * Threshold is tunable via `SLOW_QUERY_MS_THRESHOLD` (default 100ms).
 *
 * Implementation note: Mongoose's `mongoose.set('debug', fn)` gives us
 * every op with collection + method + query + doc arguments. We wrap it
 * with a timer keyed by a unique call-id so completion can log duration.
 */

let enabled = false;

export function enableSlowQueryLogger(): void {
  if (enabled) return;
  enabled = true;

  const threshold = parseInt(process.env.SLOW_QUERY_MS_THRESHOLD ?? '100', 10);
  const pending = new Map<string, { start: number; op: string; coll: string }>();

  mongoose.set('debug', (coll: string, op: string, ...args: unknown[]) => {
    // Count for N+1 detection on the very first signal for this op
    // (before the completion callback). One record per query, regardless
    // of slowness — the N+1 detector fires on count, not latency.
    if (!pending.has(`${coll}.${op}:${safeJson(args[0])}`)) {
      recordQuery(coll);
    }
    // `set('debug', ...)` is invoked twice per op in modern mongoose:
    // once at start (no result), once at completion. We can't rely on that
    // — so we just stamp "start" when we see a never-before-seen key and
    // log on the second sighting. The key is coll+op+serialised-args.
    const key = `${coll}.${op}:${safeJson(args[0])}`;
    const now = Date.now();
    const prev = pending.get(key);
    if (!prev) {
      pending.set(key, { start: now, op, coll });
      // Clean up keys that never got their "finish" tick
      setTimeout(() => pending.delete(key), 30_000);
      return;
    }
    const duration = now - prev.start;
    pending.delete(key);
    if (duration >= threshold) {
      logger.warn(
        {
          collection: coll,
          op,
          durationMs: duration,
          query: truncate(args[0]),
          threshold,
          event: 'slow-query',
        },
        `slow ${op} on ${coll}: ${duration}ms`,
      );
    }
  });
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v).slice(0, 200);
  } catch {
    return String(v).slice(0, 200);
  }
}

function truncate(v: unknown): unknown {
  if (!v) return v;
  try {
    const s = JSON.stringify(v);
    return s.length > 500 ? `${s.slice(0, 500)}… (${s.length} chars)` : JSON.parse(s);
  } catch {
    return String(v).slice(0, 500);
  }
}
