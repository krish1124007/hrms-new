import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isTokenRevoked, getCachedSessionVersion } from '../lib/token-blacklist.js';
import { User } from '../models/user.model.js';
import { Employee } from '../models/employee.model.js';

export interface AuthedSocketData {
  userId: string;
  role?: string;
  jti?: string;
  /** Role permissions + the user's custom permissions, as at the handshake. */
  permissions: string[];
  /** The user's Employee `_id`, or null when they have no employee record. */
  employeeId: string | null;
}

interface DecodedJwt {
  sub: string;
  role?: string;
  jti?: string;
  sv?: number;
}

/**
 * Socket handshake auth — the same checks as the HTTP `authMiddleware`: a
 * valid, unrevoked access token whose session is current, for a user that
 * still exists and is `active`. Rejections carry a stable code as the error
 * message (`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_REVOKED`,
 * `SESSION_INVALIDATED`, `USER_INACTIVE`).
 */
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

    const user = await User.findById(decoded.sub)
      .select('status sessionVersion role customPermissions')
      .populate<{ role: { slug?: string; permissions?: string[] } | null }>(
        'role',
        'slug permissions',
      )
      .exec();
    if (!user) return next(new Error('UNAUTHORIZED'));
    if (user.status !== 'active') return next(new Error('USER_INACTIVE'));
    if ((user.sessionVersion ?? 0) > (decoded.sv ?? 0)) {
      return next(new Error('SESSION_INVALIDATED'));
    }

    const employee = await Employee.findOne({ userId: user._id }).select('_id').lean().exec();
    const data: AuthedSocketData = {
      userId: decoded.sub,
      role: user.role?.slug ?? decoded.role,
      jti: decoded.jti,
      permissions: [...(user.role?.permissions ?? []), ...(user.customPermissions ?? [])],
      employeeId: employee ? String(employee._id) : null,
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

/** Same rule as `requirePermission`: the admin wildcard `*` passes. */
export function socketHasPermission(data: AuthedSocketData, perm: string): boolean {
  return data.permissions.includes('*') || data.permissions.includes(perm);
}
