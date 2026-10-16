/**
 * Redis-backed memoization for expensive read operations.
 *
 * Usage:
 *   const plans = await cached('plans:all', 300, () => Plan.find().lean());
 *
 * Invalidate with:
 *   await invalidate('plans:*');
 *
 * Fail-open: if Redis is unreachable, the fallback function still executes.
 */
export declare function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T>;
/** Invalidate a single key or a glob pattern (e.g. `plans:*`). */
export declare function invalidate(keyOrPattern: string): Promise<number>;
//# sourceMappingURL=cache.d.ts.map