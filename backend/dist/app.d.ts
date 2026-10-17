import { type Express } from 'express';
/**
 * Builds the fully-wired Express application: middleware chain, health/docs,
 * API routes, 404 and error handler.
 *
 * Pure construction only — it does not listen, connect to MongoDB/Redis, start
 * workers or register sockets. `index.ts` owns that lifecycle; tests call this
 * directly with supertest.
 */
export interface CreateAppOptions {
    /**
     * Serve Swagger UI and /api/docs.json. Defaults to on everywhere except
     * production, where it needs ENABLE_API_DOCS=true.
     */
    exposeDocs?: boolean;
    /**
     * Shared secret accepted in `X-Metrics-Token` by /api/metrics from
     * non-loopback callers. Defaults to METRICS_TOKEN.
     */
    metricsToken?: string;
}
/** Whether the API docs are served when `createApp` is not told explicitly. */
export declare function docsEnabledByDefault(): boolean;
export declare function createApp(opts?: CreateAppOptions): Express;
//# sourceMappingURL=app.d.ts.map