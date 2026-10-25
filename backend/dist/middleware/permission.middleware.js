import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
/** Role permissions + customPermissions — read fresh from the database on every request by `authMiddleware`. */
function permissionsOf(req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = req.user.role;
    return new Set([...(role?.permissions ?? []), ...(req.user?.customPermissions ?? [])]);
}
export function requirePermission(...required) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new UnauthorizedError());
        const userPerms = permissionsOf(req);
        // Wildcard — super admin
        if (userPerms.has('*'))
            return next();
        const missing = required.filter((p) => !userPerms.has(p));
        if (missing.length > 0) {
            return next(new ForbiddenError('Missing required permissions', { missingPermissions: missing }));
        }
        next();
    };
}
/** Passes when the caller holds at least one of `anyOf` (or `*`). */
export function requireAnyPermission(...anyOf) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new UnauthorizedError());
        const userPerms = permissionsOf(req);
        if (userPerms.has('*') || anyOf.some((p) => userPerms.has(p)))
            return next();
        next(new ForbiddenError('Missing required permissions', { anyOf }));
    };
}
//# sourceMappingURL=permission.middleware.js.map