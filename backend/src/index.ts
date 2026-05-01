// Sentry MUST be initialised before anything else — import side-effect only.
import { initSentry } from './lib/sentry.js';
initSentry();

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { redis, disconnectRedis } from './config/redis.js';
import { swaggerSpec } from './config/swagger.js';

import { requestContextMiddleware } from './middleware/request-context.middleware.js';
import { sanitizeInputs } from './middleware/sanitize.middleware.js';
import { paginationGuard } from './middleware/pagination.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { apiVersionMiddleware } from './middleware/api-version.middleware.js';
import { compressionTelemetry } from './middleware/compression-telemetry.middleware.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import cookieParser from 'cookie-parser';

import { uploadRoot } from './lib/local-storage.js';
import apiRoutes from './routes/index.js';
import healthRoutes from './routes/health.routes.js';
import { registerFieldTrackingNamespace } from './sockets/field-tracking.socket.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await redis.ping();

  // Emit a warning log for any mongo op over 100ms. N+1s + missing indexes
  // surface as structured log entries so log-based alerting can flag them.
  if (process.env.NODE_ENV === 'production' || process.env.SLOW_QUERY_LOG === '1') {
    const { enableSlowQueryLogger } = await import('./lib/slow-query-logger.js');
    enableSlowQueryLogger();
  }

  const app = express();
  app.set('trust proxy', 1);

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

  // ─── Global middleware ───
  // Security headers — tuned for production
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      } : false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: {
        maxAge: 63072000, // 2 years
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
    }),
  );
  // Restrictive Permissions-Policy — disable features we don't need
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(self), microphone=(), camera=(self), payment=(self), usb=()',
    );
    next();
  });
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(compression());
  app.use(compressionTelemetry); // emit X-Compression-Ratio for monitoring

  // Static-serve user uploads (payslips, attachments, backups) from local disk.
  app.use('/uploads', express.static(uploadRoot(), { maxAge: '1d' }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(sanitizeInputs); // strip MongoDB operators from all inputs
  app.use(paginationGuard); // clamp ?page/?limit to prevent DoS
  app.use(requestContextMiddleware); // MUST run before pinoHttp so req.requestId is set
  app.use(csrfProtection); // double-submit cookie (cookie-auth only; bearer bypass)
  app.use(apiVersionMiddleware); // parse /api/vN + Accept vendor header → req.apiVersion
  app.use(metricsMiddleware); // Prometheus HTTP duration + count (skips /health + /metrics)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as Request).requestId ?? randomUUID(),
      customProps: (req) => ({
        userId: (req as Request).user?._id?.toString(),
      }),
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return url.startsWith('/api/v1/health') || url.startsWith('/api/docs');
        },
      },
    }),
  );

  // ─── Health, metrics & docs ───
  // Mounted before tenant/auth middleware so they remain accessible
  // for Prometheus scraping, load balancers, and uptime monitors.
  app.use('/api', healthRoutes);
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'HRMS API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    }),
  );

  // Serve raw OpenAPI JSON spec for programmatic consumers
  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.json(swaggerSpec);
  });

  // ─── API routes ───
  app.use('/api/v1', apiRoutes);

  // ─── 404 + error handler ───
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Resource not found' },
    });
  });
  app.use(errorMiddleware);

  // ─── Socket.io ───
  io.on('connection', (socket) => {
    logger.debug({ id: socket.id }, 'Socket connected');
    socket.on('disconnect', () => logger.debug({ id: socket.id }, 'Socket disconnected'));
  });
  registerFieldTrackingNamespace(io);
  // Expose io to services that push events (notification.service etc.)
  const { setIO } = await import('./sockets/io-registry.js');
  setIO(io);

  httpServer.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
    logger.info(`Swagger UI: http://localhost:${env.PORT}/api/docs`);
  });

  const { startBackupWorker, setMonthlyBackupSchedule } = await import('./jobs/backup.jobs.js');
  startBackupWorker();
  logger.info('Backup worker started');

  // Register the monthly auto-backup schedule. Idempotent — re-registering
  // simply overwrites the existing repeatable job in Redis. Operators can
  // disable via the API: PUT /api/v1/backups/schedule { enabled: false }.
  try {
    await setMonthlyBackupSchedule(true);
    logger.info('Monthly auto-backup schedule registered (last day of every month, 23:50)');
  } catch (err) {
    logger.warn({ err }, 'Failed to register monthly backup schedule');
  }

  // ─── Graceful shutdown ───
  // Drain in-flight requests, then disconnect resources.
  // Deploys / autoscalers send SIGTERM; we have ~30s before SIGKILL.
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 25_000;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully — draining in-flight requests…');

    // 1. Stop accepting new connections, let existing ones finish
    const serverClosed = new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) logger.error({ err }, 'HTTP server close error');
        else logger.info('HTTP server drained');
        resolve();
      });
    });

    // 2. Signal load balancers we're unhealthy (liveness probe can see this)
    // (done implicitly by httpServer.close — it stops accepting new connections)

    // 3. Hard timeout — if something hangs, force-kill after SHUTDOWN_TIMEOUT_MS
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => {
        logger.warn('Shutdown timeout exceeded — forcing exit');
        resolve();
      }, SHUTDOWN_TIMEOUT_MS),
    );

    await Promise.race([serverClosed, timeout]);

    // 4. Close sockets, DB, Redis
    io.close();
    await disconnectDatabase().catch((err) => logger.error({ err }, 'DB disconnect error'));
    await disconnectRedis().catch((err) => logger.error({ err }, 'Redis disconnect error'));
    logger.info('Shutdown complete');
    process.exit(0);
  };

  // Also handle uncaught exceptions + unhandled rejections → graceful exit
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception — shutting down');
    void shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection — shutting down');
    void shutdown('unhandledRejection');
  });
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to bootstrap API');
  process.exit(1);
});
