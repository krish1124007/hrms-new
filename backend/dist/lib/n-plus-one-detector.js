import { getContext } from './async-context.js';
import { logger } from '../config/logger.js';
/**
 * Per-request Mongoose operation counter.
 *
 * Wired in by `mongoose.set('debug', fn)` — the same hook the slow-query
 * logger uses. Tracks how many queries each request fires against each
 * collection. If a single request hits the same collection > N times
 * (default 10) we log a `n-plus-one` warning with the requestId + route
 * so the offending controller is easy to find.
 *
 * Mitigation patterns (left to the developer to apply):
 *   - Use `.populate(...)` to eager-load refs in one round trip
 *   - Use `$lookup` aggregations for cross-collection joins
 *   - Cache lookups with `cached()` for rarely-changing data
 *
 * Enable via `NPLUSONE_DETECT=1` (dev) or automatic in staging.
 */
const THRESHOLD = parseInt(process.env.NPLUSONE_THRESHOLD ?? '10', 10);
// Map<requestId, Map<collection, count>>
const perRequest = new Map();
/**
 * Called from the slow-query-logger's debug hook OR a thin wrapper you
 * install via `mongoose.set('debug', enhanceDebug(existingFn))`.
 */
export function recordQuery(collection) {
    const ctx = getContext();
    const reqId = ctx?.requestId;
    if (!reqId)
        return; // outside request scope (BullMQ job, CLI, startup)
    const perColl = perRequest.get(reqId) ?? new Map();
    const next = (perColl.get(collection) ?? 0) + 1;
    perColl.set(collection, next);
    perRequest.set(reqId, perColl);
    if (next === THRESHOLD + 1) {
        // Log once per offending (request, collection) pair — avoid spam when
        // a controller fires 100 queries; we only need to alert once.
        logger.warn({
            event: 'n-plus-one',
            requestId: reqId,
            collection,
            count: next,
            threshold: THRESHOLD,
        }, `possible N+1: ${next} queries on "${collection}" in a single request`);
    }
}
/**
 * Call at request end (e.g. `res.on('finish', clearRequest)`) to free
 * the counter map. Without this, long-running processes accumulate
 * forever.
 */
export function clearRequest(requestId) {
    perRequest.delete(requestId);
}
/** For tests/debug — current counts for a given request. */
export function _counts(requestId) {
    const m = perRequest.get(requestId);
    return m ? Object.fromEntries(m) : null;
}
//# sourceMappingURL=n-plus-one-detector.js.map