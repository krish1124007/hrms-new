/**
 * Permission utilities for role-based access control (RBAC).
 *
 * Permission strings follow the `resource.action` convention
 * (e.g. `employees.view`, `leaves.approve`).
 *
 * The wildcard `*` grants every permission and is typically
 * assigned to the built-in Super Admin role.
 */

import type { AuthUser } from '@/lib/auth.api';

/** All permissions a user effectively has — union of role + custom. */
export function collectPermissions(user: AuthUser | null): string[] {
  if (!user) return [];
  const rolePerms = user.role?.permissions ?? [];
  const custom = user.customPermissions ?? [];
  return [...new Set([...rolePerms, ...custom])];
}

/** Does the user have the given permission (or wildcard)? */
export function hasPermission(user: AuthUser | null, permission: string): boolean {
  const perms = collectPermissions(user);
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  // Support module-level wildcards like `employees.*`
  const [resource] = permission.split('.');
  if (perms.includes(`${resource}.*`)) return true;
  return false;
}

/** Does the user have ANY of the given permissions? */
export function hasAnyPermission(user: AuthUser | null, permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((p) => hasPermission(user, p));
}

/** Does the user have ALL of the given permissions? */
export function hasAllPermissions(user: AuthUser | null, permissions: string[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.every((p) => hasPermission(user, p));
}

/** Shorthand: is the user a Super Admin? */
export function isSuperAdmin(user: AuthUser | null): boolean {
  return collectPermissions(user).includes('*');
}

/**
 * A role badge: the seeded roles (backend `role.model.ts`) get a colour of
 * their own; custom roles show their name in a neutral badge.
 */
export function getRoleBadge(user: AuthUser | null): { label: string; className: string } {
  switch (user?.role?.slug) {
    case 'admin':
      return { label: 'Admin', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
    case 'hr_manager':
      return { label: 'HR Manager', className: 'bg-pink-500/10 text-pink-500 border-pink-500/20' };
    case 'hr_executive':
      return { label: 'HR Executive', className: 'bg-pink-500/10 text-pink-500 border-pink-500/20' };
    case 'manager':
      return { label: 'Manager', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
    case 'employee':
      return { label: 'Employee', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
    default:
      return { label: user?.role?.name ?? 'User', className: 'bg-muted text-muted-foreground border-border' };
  }
}
