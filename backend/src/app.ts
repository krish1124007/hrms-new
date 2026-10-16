import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { swaggerSpec } from './config/swagger.js';

import { requestContextMiddleware } from './middleware/request-context.middleware.js';
import { sanitizeInputs } from './middleware/sanitize.middleware.js';
import { paginationGuard } from './middleware/pagination.middleware.js';
import { csrfProtection } from './middleware/csrf.middleware.js';
import { apiVersionMiddleware } from './middleware/api-version.middleware.js';
import { compressionTelemetry } from './middleware/compression-telemetry.middleware.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';

import { uploadRoot } from './lib/local-storage.js';
import apiRoutes from './routes/index.js';
import healthRoutes, { healthHandler } from './routes/health.routes.js';

/**
 * Builds the fully-wired Express application: middleware chain, health/docs,
 * API routes, 404 and error handler.
 *
 * Pure construction only — it does not listen, connect to MongoDB/Redis, start
 * workers or register sockets. `index.ts` owns that lifecycle; tests call this
 * directly with supertest.
 */
export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

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
  // The full probe set (health, readyz, metrics) lives under /api. Only the
  // liveness probe is also reachable at /api/v1/health (where the access-log
  // filter and API clients expect it); readyz and metrics must never be
  // exposed unauthenticated under the versioned prefix.
  app.use('/api', healthRoutes);
  app.get('/api/v1/health', healthHandler);
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

  return app;
}
