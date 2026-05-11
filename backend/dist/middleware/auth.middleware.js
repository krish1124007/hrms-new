import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { setContext } from '../lib/async-context.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
import { isTokenRevoked, getCachedSessionVersion } from '../lib/token-blacklist.js';
export async function authMiddleware(req, _res, next) {
    try {
        const header = req.header('authorization');
        if (!header || !header.startsWith('Bearer ')) {
            throw new UnauthorizedError('Missing or invalid Authorization header');
        }
        const token = header.slice(7);
        let decoded;
        try {
            decoded = jwt.verify(token, env.JWT_SECRET);
        }
        catch (err) {
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
            .populate('role')
            .exec();
        if (!user)
            throw new UnauthorizedError('User not found');
        if (user.status !== 'active')
            throw new ForbiddenError(`User is ${user.status}`);
        if ((user.sessionVersion ?? 0) > (decoded.sv ?? 0)) {
            throw new UnauthorizedError('Session invalidated — please log in again');
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        req.user = user;
        setContext({
            userRole: user.role?.slug,
            userPermissions: [
                ...(user.role?.permissions ?? []),
                ...(user.customPermissions ?? []),
            ],
        });
        next();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=auth.middleware.js.map