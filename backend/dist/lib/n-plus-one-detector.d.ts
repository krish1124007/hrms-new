/**
 * Called from the slow-query-logger's debug hook OR a thin wrapper you
 * install via `mongoose.set('debug', enhanceDebug(existingFn))`.
 */
export declare function recordQuery(collection: string): void;
/**
 * Call at request end (e.g. `res.on('finish', clearRequest)`) to free
 * the counter map. Without this, long-running processes accumulate
 * forever.
 */
export declare function clearRequest(requestId: string): void;
/** For tests/debug — current counts for a given request. */
export declare function _counts(requestId: string): Record<string, number> | null;
//# sourceMappingURL=n-plus-one-detector.d.ts.map