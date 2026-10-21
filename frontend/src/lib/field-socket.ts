import { io, type Socket } from 'socket.io-client';
import { tokenStorage } from './axios';
import type { LocationUpdate } from './field.api';

/** The server's namespace and event (`backend/src/sockets/field-tracking.socket.ts`). */
export const FIELD_TRACKING_NAMESPACE = '/field-tracking';
export const LOCATION_UPDATE_EVENT = 'location:update';

/** Handshake refusals that a fresh access token can cure. */
const TOKEN_ERRORS = new Set(['INVALID_TOKEN', 'TOKEN_REVOKED', 'UNAUTHORIZED', 'SESSION_INVALIDATED']);

/**
 * Socket.io origin: `VITE_SOCKET_URL` when set, else the origin of the API
 * (`VITE_API_URL`), else the page's own origin.
 */
export function socketOrigin(): string {
  const explicit = import.meta.env.VITE_SOCKET_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
  try {
    return new URL(apiUrl, typeof window !== 'undefined' ? window.location.href : undefined).origin;
  } catch {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
}

export type FieldSocketStatus = 'connecting' | 'live' | 'polling';

export interface FieldSocketHandlers {
  onUpdate: (update: LocationUpdate) => void;
  onStatus: (status: FieldSocketStatus, reason?: string) => void;
}

/** Delay before a refused handshake is retried with whatever token is stored then. */
export const SOCKET_RETRY_MS = 60_000;

/**
 * Subscribe to `/field-tracking`. The access token is read at every
 * (re)connect, so a token the axios client refreshed meanwhile is used.
 * When the server refuses the handshake (socket.io then stops retrying),
 * the caller is told to poll and a fresh attempt is made a minute later —
 * unless the refusal cannot be cured by a new token (`FORBIDDEN`,
 * `USER_INACTIVE`). Returns the unsubscribe function.
 */
export function connectFieldTracking({ onUpdate, onStatus }: FieldSocketHandlers): () => void {
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const socket: Socket = io(`${socketOrigin()}${FIELD_TRACKING_NAMESPACE}`, {
    auth: (cb: (data: object) => void) => cb({ token: tokenStorage.getAccess() ?? '' }),
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 30_000,
  });

  onStatus('connecting');

  socket.on('connect', () => {
    if (retry) clearTimeout(retry);
    retry = null;
    onStatus('live');
  });
  socket.on('disconnect', (reason: unknown) => {
    if (!closed) onStatus('polling', String(reason ?? 'disconnected'));
  });
  socket.on('connect_error', (err: unknown) => {
    const code = err instanceof Error ? err.message : String(err);
    onStatus('polling', code);
    // `active` false: the server refused us and socket.io will not retry by itself.
    if (closed || socket.active || !TOKEN_ERRORS.has(code) || retry) return;
    retry = setTimeout(() => {
      retry = null;
      if (!closed) socket.connect();
    }, SOCKET_RETRY_MS);
  });
  socket.on(LOCATION_UPDATE_EVENT, (payload: unknown) => {
    const u = payload as Partial<LocationUpdate> | null;
    if (!u || typeof u.employeeId !== 'string') return;
    if (typeof u.lat !== 'number' || typeof u.lng !== 'number' || typeof u.recordedAt !== 'string') return;
    onUpdate(u as LocationUpdate);
  });

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket.removeAllListeners();
    socket.disconnect();
  };
}
