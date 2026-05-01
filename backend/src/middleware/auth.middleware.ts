import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { setContext } from '../lib/async-context.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { isTokenRevoked, getCachedSessionVersion } from '../lib/token-blacklist.js';

interface DecodedJwt {
  sub: string;
  role: string;
  jti?: string;
  sv?: number;
  exp?: number;
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }
    const token = header.slice(7);

    let decoded: DecodedJwt;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as DecodedJwt;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid token');
    }

    if (decoded.jti && (await isTokenRevoked(decoded.jti))) {
      throw new UnauthorizedError('Token has been revoked');
    }
    const cachedSv = await getCachedSessionVersion(decoded.sub);
    if (cachedSv !== null && (decoded.sv ?? 0) < cachedSv) {
      throw new UnauthorizedError('Session invalidated — please log in again');
    }

    setContext({ userId: decoded.sub });

    const user = await User.findById(decoded.sub)
      .populate<{ role: typeof Role.prototype }>('role')
      .exec();

    if (!user) throw new UnauthorizedError('User not found');
    if (user.status !== 'active') throw new ForbiddenError(`User is ${user.status}`);

    if ((user.sessionVersion ?? 0) > (decoded.sv ?? 0)) {
      throw new UnauthorizedError('Session invalidated — please log in again');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.user = user as any;
    setContext({
      userRole: (user.role as unknown as { slug: string })?.slug,
      userPermissions: [
        ...((user.role as unknown as { permissions: string[] })?.permissions ?? []),
        ...(user.customPermissions ?? []),
      ],
    });

    next();
  } catch (err) {
    next(err);
  }
}
