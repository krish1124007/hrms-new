import { type Request, type Response } from 'express';
declare const router: import("express-serve-static-core").Router;
/**
 * Three-probe setup matching k8s conventions:
 *
 *   GET /api/health   — LIVENESS: always 200 unless the process is
 *                       fundamentally broken. Restart it if this fails.
 *   GET /api/readyz   — READINESS: 200 only when dependencies (Mongo,
 *                       Redis) are up. Take this pod out of the LB if
 *                       it fails.
 *   GET /api/metrics  — Prometheus scrape endpoint.
 *
 * Liveness + readiness being separate avoids the classic k8s pitfall
 * where a transient Redis hiccup restarts every pod simultaneously.
 */
/**
 * Liveness handler. Exported so `createApp()` can expose exactly this one
 * probe at `/api/v1/health` without also publishing `/readyz` or `/metrics`
 * under the versioned prefix.
 */
export declare function healthHandler(_req: Request, res: Response): void;
export default router;
//# sourceMappingURL=health.routes.d.ts.map