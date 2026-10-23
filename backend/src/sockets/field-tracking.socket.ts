import type { Server as SocketServer, Namespace, Socket } from 'socket.io';
import { logger } from '../config/logger.js';
import { socketAuth, getAuthed, socketHasPermission } from './auth.middleware.js';

export const FIELD_TRACKING_NAMESPACE = '/field-tracking';

/** Event carrying one rep's newest fix: `{ employeeId, name, lat, lng, accuracy, recordedAt }`. */
export const LOCATION_UPDATE_EVENT = 'location:update';

/** Every `field.manage` holder: they watch every rep. */
export const MANAGERS_ROOM = 'managers:all';

/** A manager's room: updates from the reps whose `reportingManager` is `managerEmployeeId`. */
export function reportsRoom(managerEmployeeId: string): string {
  return `reports:${managerEmployeeId}`;
}

let nsp: Namespace | null = null;

export function getFieldTrackingNamespace(): Namespace | null {
  return nsp;
}

/**
 * Namespace gate, after `socketAuth`: only field users may watch reps.
 * Rooms follow the same visibility as `GET /field/tracking/live` —
 * `field.manage` joins `managers:all` (every rep); every field user
 * with an employee record joins `reports:<their employee id>` (their direct
 * reports). Anyone else is refused with `FORBIDDEN`.
 */
export function fieldTrackingAccess(socket: Socket, next: (err?: Error) => void): void {
  const data = getAuthed(socket);
  const manage = socketHasPermission(data, 'field.manage');
  if (!manage && !socketHasPermission(data, 'field.view')) {
    next(new Error('FORBIDDEN'));
    return;
  }
  const rooms: string[] = [];
  if (manage) rooms.push(MANAGERS_ROOM);
  if (data.employeeId) rooms.push(reportsRoom(data.employeeId));
  if (rooms.length > 0) socket.join(rooms);
  next();
}

/**
 * `/field-tracking` — managers watch their reps' live locations. JWT auth
 * (active users only) then the field gate above; clients never choose
 * their rooms. The ingest (`services/location-track.service.ts`) emits
 * `location:update` to `managers:all` and the rep's manager's room.
 */
export function registerFieldTrackingNamespace(io: SocketServer): void {
  nsp = io.of(FIELD_TRACKING_NAMESPACE);
  nsp.use(socketAuth);
  nsp.use(fieldTrackingAccess);

  nsp.on('connection', (socket) => {
    const { userId } = getAuthed(socket);
    logger.debug({ id: socket.id, userId }, 'Field-tracking socket connected');
    socket.on('disconnect', () => {
      logger.debug({ id: socket.id }, 'Field-tracking socket disconnected');
    });
  });
}
