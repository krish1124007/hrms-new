import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import {
  collectPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  isSuperAdmin,
} from '@/lib/permissions';

export function usePermissions(): {
  permissions: string[];
  isSuperAdmin: boolean;
  has: (permission: string) => boolean;
  hasAny: (permissions: string[]) => boolean;
  hasAll: (permissions: string[]) => boolean;
} {
  const user = useAuthStore((s) => s.user);

  return useMemo(
    () => ({
      permissions: collectPermissions(user),
      isSuperAdmin: isSuperAdmin(user),
      has: (p: string) => hasPermission(user, p),
      hasAny: (ps: string[]) => hasAnyPermission(user, ps),
      hasAll: (ps: string[]) => hasAllPermissions(user, ps),
    }),
    [user],
  );
}
