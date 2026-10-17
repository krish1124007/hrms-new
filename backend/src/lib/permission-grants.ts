/**
 * Rules for *handing out* permissions — the privilege-escalation guards used
 * wherever a request can change what somebody may do (role editing, user
 * editing, inviting users, onboarding employees with a login).
 *
 *  1. Only catalogued permission names (or the `*` wildcard) are accepted, so
 *     a typo or a stale UI name can never produce a role that silently 403s.
 *  2. A caller without `*` can never grant a permission they do not hold
 *     themselves — directly, or by assigning a role that carries it. That
 *     also keeps `*` itself admin-only.
 */
import { z } from 'zod';
import { ALL_PERMISSIONS } from '../config/permissions.js';
import { ForbiddenError } from './errors.js';
import { hasPermission } from './access.js';

type Caller = Express.Request['user'];

/**
 * A list of permission names: every entry must be in the catalogue (the `*`
 * wildcard passes here — {@link assertCanGrant} decides who may hand it out).
 * Unknown entries are reported together. Duplicates are dropped.
 */
export const permissionListSchema = z
  .array(z.string())
  .superRefine((permissions, ctx) => {
    const unknown = [...new Set(permissions)].filter(
      (permission) => permission !== '*' && !ALL_PERMISSIONS.has(permission),
    );
    if (unknown.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unknown permissions: ${unknown.join(', ')}`,
      });
    }
  })
  .transform((permissions) => [...new Set(permissions)]);

/**
 * 403 unless the caller already holds every permission in `granted`. A `*`
 * holder holds them all; for anyone else `*` is always missing. The 403
 * `details.missingPermissions` names exactly what the caller lacks.
 */
export function assertCanGrant(caller: Caller, granted: readonly string[]): void {
  const missing = [...new Set(granted)].filter((permission) => !hasPermission(caller, permission));
  if (missing.length === 0) return;
  throw new ForbiddenError(
    missing.includes('*')
      ? 'Only an administrator can grant the wildcard permission'
      : 'You cannot grant permissions you do not hold yourself',
    { missingPermissions: missing },
  );
}

/** Assigning a role grants everything on it, so the caller must be able to grant all of it. */
export function assertCanAssignRole(caller: Caller, role: { permissions: readonly string[] }): void {
  assertCanGrant(caller, role.permissions);
}
