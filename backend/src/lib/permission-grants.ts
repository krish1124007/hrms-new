/**
 * Rules for *handing out* permissions — the privilege-escalation guards used
 * wherever a request can change what somebody may do (role editing, user
 * editing, inviting users, onboarding employees with a login) or act on a
 * more privileged account (password reset, deactivation, deletion).
 *
 *  1. Only catalogued permission names (or the `*` wildcard) can be *added*,
 *     so a typo or a stale UI name can never produce a role that silently
 *     403s. Names a record already stores are never re-validated: roles and
 *     users created before the catalogue was fixed may hold retired names, and
 *     the UI sends the whole list back on every edit.
 *  2. A caller without `*` can never grant a permission they do not hold
 *     themselves — directly, or by assigning a role that carries it. That
 *     also keeps `*` itself admin-only.
 *  3. A caller without `*` cannot act on a user — or edit/delete a role —
 *     that holds a permission the caller lacks. Retired names an old record
 *     still stores confer no access (no route checks them), so they never
 *     count towards that.
 */
import { z } from 'zod';
import { ALL_PERMISSIONS } from '../config/permissions.js';
import { ForbiddenError, ValidationAppError } from './errors.js';
import { hasPermission } from './access.js';

type Caller = Express.Request['user'];

const dedupe = (permissions: string[]): string[] => [...new Set(permissions)];

/** Names that are neither catalogued nor the `*` wildcard (which {@link assertCanGrant} polices). */
function unknownPermissions(permissions: readonly string[]): string[] {
  return dedupe([...permissions]).filter(
    (permission) => permission !== '*' && !ALL_PERMISSIONS.has(permission),
  );
}

const unknownMessage = (unknown: readonly string[]): string =>
  `Unknown permissions: ${unknown.join(', ')}`;

/**
 * A list of permission names for a record that does not exist yet (create /
 * invite): every entry must be in the catalogue. The `*` wildcard passes here
 * — {@link assertCanGrant} decides who may hand it out. Unknown entries are
 * reported together. Duplicates are dropped.
 */
export const permissionListSchema = z
  .array(z.string())
  .superRefine((permissions, ctx) => {
    const unknown = unknownPermissions(permissions);
    if (unknown.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: unknownMessage(unknown) });
    }
  })
  .transform(dedupe);

/**
 * A list of permission names for a record that already stores some (update):
 * shape only. The names being added are checked against the catalogue by
 * {@link assertCanSetPermissions}, which needs the stored list to tell what is
 * added. Duplicates are dropped.
 */
export const storedPermissionListSchema = z.array(z.string()).transform(dedupe);

/**
 * 403 unless the caller already holds every permission in `granted`. A `*`
 * holder holds them all; for anyone else `*` is always missing. The 403
 * `details.missingPermissions` names exactly what the caller lacks.
 */
export function assertCanGrant(caller: Caller, granted: readonly string[]): void {
  const missing = dedupe([...granted]).filter((permission) => !hasPermission(caller, permission));
  if (missing.length === 0) return;
  throw new ForbiddenError(
    missing.includes('*')
      ? 'Only an administrator can grant the wildcard permission'
      : 'You cannot grant permissions you do not hold yourself',
    { missingPermissions: missing },
  );
}

/**
 * Update-time check for a permission list (`field` names it in the error).
 * Only what is being *added* relative to `current` is looked at: an added name
 * must be catalogued (400 `VALIDATION_ERROR`) and grantable by the caller
 * (403). Names already stored — retired or held beyond the caller — pass
 * through, and dropping names is always allowed.
 */
export function assertCanSetPermissions(
  caller: Caller,
  field: string,
  next: readonly string[],
  current: readonly string[],
): void {
  const stored = new Set(current);
  const added = dedupe([...next]).filter((permission) => !stored.has(permission));
  const unknown = unknownPermissions(added);
  if (unknown.length > 0) {
    throw new ValidationAppError('Validation failed', [
      { field, message: unknownMessage(unknown), code: 'custom' },
    ]);
  }
  assertCanGrant(caller, added);
}

/** What a stored list actually confers: the wildcard and catalogued names (retired names grant nothing). */
function effectivePermissions(permissions: readonly string[]): string[] {
  return dedupe([...permissions]).filter(
    (permission) => permission === '*' || ALL_PERMISSIONS.has(permission),
  );
}

/** Assigning a role grants everything on it, so the caller must be able to grant all of it. */
export function assertCanAssignRole(caller: Caller, role: { permissions: readonly string[] }): void {
  assertCanGrant(caller, effectivePermissions(role.permissions));
}

function assertHoldsAll(caller: Caller, held: readonly string[], message: string): void {
  const missing = held.filter((permission) => !hasPermission(caller, permission));
  if (missing.length > 0) throw new ForbiddenError(message, { missingPermissions: missing });
}

/**
 * 403 unless the caller holds every permission `target` holds (role +
 * custom). `target.role` must be populated. A `*` caller is unrestricted and a
 * user holding `*` can only be acted on by a `*` caller. A user is
 * changed through this rule by password reset, status change, delete and
 * edit — otherwise a lesser admin could demote a more privileged user first
 * and then act on them freely.
 */
export function assertCanManageUser(
  caller: Caller,
  target: { role?: unknown; customPermissions?: string[] },
): void {
  const role = target.role as { permissions?: string[] } | null | undefined;
  assertHoldsAll(
    caller,
    effectivePermissions([...(role?.permissions ?? []), ...(target.customPermissions ?? [])]),
    'You cannot modify a user who holds permissions you do not have',
  );
}

/**
 * 403 unless the caller holds every permission `role` holds. Same semantics as
 * {@link assertCanManageUser}, for editing or deleting a role: a lesser
 * `roles.update` / `roles.delete` holder must not be able to strip or remove a
 * role that carries permissions (or `*`) they lack.
 */
export function assertCanManageRole(caller: Caller, role: { permissions: readonly string[] }): void {
  assertHoldsAll(
    caller,
    effectivePermissions(role.permissions),
    'You cannot modify a role that holds permissions you do not have',
  );
}
