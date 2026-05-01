import type { Server as SocketServer, Namespace } from 'socket.io';
import { logger } from '../config/logger.js';
import { socketAuth, getAuthed } from './auth.middleware.js';

let nsp: Namespace | null = null;

export function getFieldTrackingNamespace(): Namespace | null {
  return nsp;
}

/**
 * /field-tracking namespace — admins watch live location updates for their
 * own tenant. JWT is required; the client no longer sends its own tenantId.
 * The auth middleware auto-joins `tenant:${tenantId}` so the HTTP ingest
 * endpoint's emit is only delivered to same-tenant dashboards.
 */
export function registerFieldTrackingNamespace(io: SocketServer): void {
  nsp = io.of('/field-tracking');
  nsp.use(socketAuth);

  nsp.on('connection', (socket) => {
    const { userId } = getAuthed(socket);
    logger.debug({ id: socket.id, userId }, 'Field-tracking socket connected');

    // No manual `join` event anymore — membership is set by auth middleware.
    socket.on('disconnect', () => {
      logger.debug({ id: socket.id }, 'Field-tracking socket disconnected');
    });
  });
}
