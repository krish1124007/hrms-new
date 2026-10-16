// Sentry MUST be initialised before anything else — import side-effect only.
import { initSentry } from './lib/sentry.js';
initSentry();

import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
// config/database.js registers the global schemaVersion mongoose plugin as an
// import side effect, so it must be loaded before app.js pulls in the models.
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { redis, disconnectRedis } from './config/redis.js';

import { createApp } from './app.js';
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

  const app = createApp();

  const httpServer = createServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
  });

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

  // Re-apply the operator's monthly auto-backup choice, persisted by
  // PUT /api/v1/backups/schedule { enabled } (enabled on a fresh install).
  // Idempotent — re-registering overwrites the repeatable job in Redis.
  try {
    const { getSetting } = await import('./models/system-setting.model.js');
    const { MONTHLY_BACKUP_SETTING } = await import('./lib/backups.js');
    const enabled = (await getSetting<unknown>(MONTHLY_BACKUP_SETTING, true)) !== false;
    await setMonthlyBackupSchedule(enabled);
    logger.info(
      enabled
        ? 'Monthly auto-backup schedule registered (last day of every month, 23:50)'
        : 'Monthly auto-backup schedule left disabled (operator setting)',
    );
  } catch (err) {
    logger.warn({ err }, 'Failed to apply the monthly backup schedule');
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
