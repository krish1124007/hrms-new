import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
export function requirePermission(...required) {
    return (req, _res, next) => {
        if (!req.user)
            return next(new UnauthorizedError());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const role = req.user.role;
        const userPerms = new Set([
            ...(role?.permissions ?? []),
            ...(req.user.customPermissions ?? []),
        ]);
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
//# sourceMappingURL=permission.middleware.js.map