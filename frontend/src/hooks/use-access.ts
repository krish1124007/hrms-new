import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rolesApi } from '@/lib/roles.api';
import { usersApi } from '@/lib/users.api';
import { employeesApi } from '@/lib/systemcore.api';

/*
 * App access: which role a login has (and so what it may do), and whether it
 * may sign in. Mutation failures are toasted once by the global handler
 * (`lib/query-client.ts`).
 */

/** Roles for a role picker, with descriptions and what each one opens. */
export function useAssignableRoles(enabled = true) {
  return useQuery({
    queryKey: ['roles', 'assignable'],
    queryFn: () => rolesApi.assignable(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** After a login changes, the profile, pickers and field-access flags re-read it. */
function invalidateAccess(qc: ReturnType<typeof useQueryClient>): void {
  void qc.invalidateQueries({ queryKey: ['employees'] });
  void qc.invalidateQueries({ queryKey: ['field', 'team-access'] });
}

export function useSetLoginRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; roleId: string; employeeName: string; roleName: string }) =>
      usersApi.setRole(vars.userId, vars.roleId),
    onSuccess: (_user, vars) => {
      invalidateAccess(qc);
      toast.success(`${vars.employeeName} is now ${vars.roleName}`, {
        description: 'It applies straight away. If they have the app open, they should reload it to see the new menus.',
      });
    },
  });
}

export function useSetLoginStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { userId: string; status: 'active' | 'inactive'; employeeName: string }) =>
      usersApi.setStatus(vars.userId, vars.status),
    onSuccess: (_user, vars) => {
      invalidateAccess(qc);
      toast.success(
        vars.status === 'active'
          ? `${vars.employeeName} can sign in again`
          : `${vars.employeeName} can no longer sign in`,
      );
    },
  });
}

/** Employed people without a login — the "Create logins" list. */
export function useEmployeesWithoutLogin(enabled = true) {
  return useQuery({
    queryKey: ['employees', 'without-login'],
    queryFn: async () => (await employeesApi.withoutLogin()).data,
    enabled,
  });
}

/** A login for one employee; the result carries the starting password to hand over. */
export function useCreateLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => (await employeesApi.createLogin(employeeId)).data,
    onSuccess: () => invalidateAccess(qc),
  });
}

/** Logins for many employees at once; the result lists each starting password, and who was skipped. */
export function useCreateLogins() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (employeeIds?: string[]) => (await employeesApi.createLogins(employeeIds)).data,
    onSuccess: () => invalidateAccess(qc),
  });
}
