import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

export function requirePermission(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = (req.user as any).role as { slug: string; permissions: string[] } | undefined;
    const userPerms = new Set<string>([
      ...(role?.permissions ?? []),
      ...(req.user.customPermissions ?? []),
    ]);

    // Wildcard — super admin
    if (userPerms.has('*')) return next();

    const missing = required.filter((p) => !userPerms.has(p));
    if (missing.length > 0) {
      return next(
        new ForbiddenError('Missing required permissions', { missingPermissions: missing }),
      );
    }
    next();
  };
}
