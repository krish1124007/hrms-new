import { Registry, Histogram, Counter, Gauge, collectDefaultMetrics } from 'prom-client';

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

export const registry = new Registry();
registry.setDefaultLabels({ service: 'ddhrms-api' });
collectDefaultMetrics({ register: registry, prefix: '' });

/* ───────────── HTTP ───────────── */

export const httpRequestDuration = new Histogram({
  name: 'ddhrms_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  // Request duration is right-skewed — bucket boundaries tuned to catch
  // the 50/95/99th percentile ranges we actually care about in a dashboard.
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  labelNames: ['method', 'route', 'status_class'],
  registers: [registry],
});

export const httpRequestsTotal = new Counter({
  name: 'ddhrms_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/* ───────────── Auth / session ───────────── */

export const loginAttempts = new Counter({
  name: 'ddhrms_login_attempts_total',
  help: 'Login attempts with outcome',
  labelNames: ['outcome'], // success | bad_password | not_found | locked
  registers: [registry],
});

export const activeSessions = new Gauge({
  name: 'ddhrms_active_sessions',
  help: 'Currently active JWT sessions (from Session collection)',
  registers: [registry],
});

/* ───────────── Business ───────────── */

export const tenantCount = new Gauge({
  name: 'ddhrms_tenants_total',
  help: 'Total tenants by status',
  labelNames: ['status'], // trial | active | suspended | cancelled
  registers: [registry],
});

export const subscriptionCount = new Gauge({
  name: 'ddhrms_subscriptions_total',
  help: 'Active Razorpay subscriptions',
  labelNames: ['status'],
  registers: [registry],
});

export const webhooksProcessed = new Counter({
  name: 'ddhrms_webhooks_processed_total',
  help: 'Razorpay webhooks processed',
  labelNames: ['event', 'outcome'], // outcome: success | dedupe | failure
  registers: [registry],
});

/* ───────────── Infrastructure / reliability ───────────── */

export const circuitBreakerState = new Gauge({
  name: 'ddhrms_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
  labelNames: ['name'],
  registers: [registry],
});

export const jobQueueSize = new Gauge({
  name: 'ddhrms_job_queue_size',
  help: 'BullMQ queue depth by state',
  labelNames: ['queue', 'state'], // state: waiting | active | delayed | failed
  registers: [registry],
});

export const cacheHits = new Counter({
  name: 'ddhrms_cache_hits_total',
  help: 'Cache lookup outcomes',
  labelNames: ['key_prefix', 'outcome'], // outcome: hit | miss | error
  registers: [registry],
});

export const dbOperationDuration = new Histogram({
  name: 'ddhrms_db_operation_duration_seconds',
  help: 'Mongo operation latency',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2],
  labelNames: ['collection', 'op'],
  registers: [registry],
});

/* ───────────── Rate limits / quotas ───────────── */

export const rateLimitHits = new Counter({
  name: 'ddhrms_rate_limit_hits_total',
  help: 'Rate-limit exceeded counter',
  labelNames: ['kind'], // auth | tenant-api | tenant-jobs
  registers: [registry],
});

export const quotaExceeded = new Counter({
  name: 'ddhrms_quota_exceeded_total',
  help: 'Hard plan quota exceeded',
  labelNames: ['quota'], // users | storage | api_per_min | jobs_per_min
  registers: [registry],
});

/**
 * Collapse a raw URL to a route template so cardinality stays finite.
 * `/api/v1/employees/507f1f77bcf86cd799439011/documents` →
 * `/api/v1/employees/:id/documents`
 */
export function routeTemplate(path: string): string {
  return path
    .replace(/\/[a-f0-9]{24}(?=\/|$)/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:n')
    .replace(/\/[a-zA-Z0-9_-]{20,}(?=\/|$)/g, '/:token');
}
