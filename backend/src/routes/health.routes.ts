import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { redis } from '../config/redis.js';
import { registry } from '../lib/metrics.js';

const router = Router();

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

router.get('/health', (_req: Request, res: Response) => {
  const mem = process.memoryUsage();
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

router.get('/readyz', async (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {
    /* Redis down */
  }
  const ready = dbState === 1 && redisOk;
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      status: ready ? 'ready' : 'not-ready',
      services: {
        database: dbState === 1 ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
      },
    },
  });
});

/**
 * Prometheus scrape endpoint. Format is `text/plain; version=0.0.4` per
 * the Prom exposition spec — do not switch to JSON.
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

export default router;
