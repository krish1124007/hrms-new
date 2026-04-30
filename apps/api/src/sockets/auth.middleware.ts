import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isTokenRevoked, getCachedSessionVersion } from '../lib/token-blacklist.js';

export interface AuthedSocketData {
  userId: string;
  role?: string;
  jti?: string;
}

interface DecodedJwt {
  sub: string;
  role?: string;
  jti?: string;
  sv?: number;
}

export async function socketAuth(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const rawToken = socket.handshake.auth?.token as string | undefined;
    const header = typeof rawToken === 'string' ? rawToken : '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    if (!token) return next(new Error('UNAUTHORIZED'));

    let decoded: DecodedJwt;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as DecodedJwt;
    } catch {
      return next(new Error('INVALID_TOKEN'));
    }

    if (decoded.jti && (await isTokenRevoked(decoded.jti))) {
      return next(new Error('TOKEN_REVOKED'));
    }
    const cachedSv = await getCachedSessionVersion(decoded.sub);
    if (cachedSv !== null && (decoded.sv ?? 0) < cachedSv) {
      return next(new Error('SESSION_INVALIDATED'));
    }

    const data: AuthedSocketData = {
      userId: decoded.sub,
      role: decoded.role,
      jti: decoded.jti,
    };
    socket.data = data;

    socket.join(`user:${data.userId}`);

    logger.debug({ id: socket.id, userId: data.userId }, 'Socket authenticated');
    next();
  } catch (err) {
    logger.warn({ err }, 'Socket auth failed');
    next(new Error('AUTH_ERROR'));
  }
}

export function getAuthed(socket: Socket): AuthedSocketData {
  const d = socket.data as AuthedSocketData;
  if (!d?.userId) {
    throw new Error('Socket is not authenticated');
  }
  return d;
}
