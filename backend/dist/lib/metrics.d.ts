import { Registry, Histogram, Counter, Gauge } from 'prom-client';
/**
 * Single Prometheus registry for the API. Exposed at /api/metrics.
 *
 * Conventions:
 *   - All API-owned metrics are prefixed `ddhrms_`
 *   - Duration histograms use seconds (Prom convention), not ms
 *   - Labels kept low-cardinality: path templates (not raw URLs), not
 *     `tenantId` (would explode cardinality — a million-tenant future
 *     would break Prometheus' index)
 *
 * Defaults (prom-client's `collectDefaultMetrics`):
 *   process_cpu_*, process_resident_memory_bytes, nodejs_heap_size_total,
 *   nodejs_gc_duration_seconds, nodejs_eventloop_lag_seconds, etc.
 */
export declare const registry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const httpRequestDuration: Histogram<"route" | "method" | "status_class">;
export declare const httpRequestsTotal: Counter<"route" | "method" | "status_code">;
export declare const loginAttempts: Counter<"outcome">;
export declare const activeSessions: Gauge<string>;
export declare const tenantCount: Gauge<"status">;
export declare const subscriptionCount: Gauge<"status">;
export declare const webhooksProcessed: Counter<"event" | "outcome">;
export declare const circuitBreakerState: Gauge<"name">;
export declare const jobQueueSize: Gauge<"queue" | "state">;
export declare const cacheHits: Counter<"outcome" | "key_prefix">;
export declare const dbOperationDuration: Histogram<"collection" | "op">;
export declare const rateLimitHits: Counter<"kind">;
export declare const quotaExceeded: Counter<"quota">;
/**
 * Collapse a raw URL to a route template so cardinality stays finite.
 * `/api/v1/employees/507f1f77bcf86cd799439011/documents` →
 * `/api/v1/employees/:id/documents`
 */
export declare function routeTemplate(path: string): string;
//# sourceMappingURL=metrics.d.ts.map