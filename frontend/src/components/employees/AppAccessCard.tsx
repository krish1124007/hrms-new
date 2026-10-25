import { useEffect, useState, type ReactElement } from 'react';
import { MapPinned, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAssignableRoles, useSetLoginRole, useSetLoginStatus } from '@/hooks/use-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuthStore } from '@/stores/auth.store';
import { FIELD_EMPLOYEE_SLUG, roleFieldScope, type AssignableRole } from '@/lib/roles.api';
import type { Employee, EmployeeLogin } from '@/lib/systemcore.api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

function Item({ label, children }: { label: string; children: ReactElement | string }): ReactElement {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'secondary' | 'warning' }> = {
  active: { label: 'Can sign in', variant: 'success' },
  inactive: { label: 'Sign-in blocked', variant: 'secondary' },
  invited: { label: 'Invited — not signed in yet', variant: 'warning' },
};

/**
 * "App access" on an employee's profile: their login e-mail, whether they can
 * sign in, and their role — what they may see and do, Field Visits included.
 *
 * Changing the role or the sign-in status needs `users.update` (the server
 * also refuses your own role, and roles carrying permissions you do not
 * hold). Without it the card is read-only. Permissions are read on every
 * request, so a new role applies at once — an open app only needs a reload to
 * show the new menus.
 */
export function AppAccessCard({ employee }: { employee: Employee }): ReactElement | null {
  const { has } = usePermissions();
  const canEdit = has('users.update');
  const myUserId = useAuthStore((s) => s.user?._id);
  const login: EmployeeLogin | null = employee.userId && typeof employee.userId === 'object' ? employee.userId : null;
  const name = `${employee.firstName} ${employee.lastName}`;
  const isSelf = !!login && login._id === myUserId;
  const roles = useAssignableRoles(canEdit && !!login);
  const setRole = useSetLoginRole();
  const setStatus = useSetLoginStatus();
  const [choosing, setChoosing] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(false);

  if (!has('users.update') && !has('employees.update')) return null;

  const fieldRole = roles.data?.find((r) => r.slug === FIELD_EMPLOYEE_SLUG && r.assignable);
  const needsFieldRole = !!login && employee.isFieldStaff && employee.fieldAccess === false;
  const role = login?.role ?? null;
  const status = login ? (STATUS_BADGE[login.status] ?? { label: login.status, variant: 'secondary' as const }) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" /> App access
          </CardTitle>
          <CardDescription>What {employee.firstName} can sign in to and do in the web and mobile app.</CardDescription>
        </div>
        {canEdit && login && (
          <div className="flex flex-wrap gap-2">
            {login.status !== 'invited' && (
              <Button variant="outline" size="sm" disabled={isSelf} onClick={() => setStatusConfirm(true)}>
                {login.status === 'active' ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                {login.status === 'active' ? 'Block sign-in' : 'Allow sign-in'}
              </Button>
            )}
            <Button size="sm" disabled={isSelf} onClick={() => setChoosing(true)}>
              <ShieldCheck className="size-4" /> Change role
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!login ? (
          <p className="text-sm text-muted-foreground">
            {name} has no login account, so they cannot sign in to the app — and cannot use Field Visits or
            self-service. A login is created when an employee is added with a login e-mail.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Item label="Login e-mail">
                <span className="break-all">{login.email}</span>
              </Item>
              <Item label="Account">
                <div className="space-y-1">
                  <Badge variant={status!.variant}>{status!.label}</Badge>
                  {login.lastLogin && (
                    <p className="text-xs text-muted-foreground">Last sign-in {formatDate(login.lastLogin)}</p>
                  )}
                </div>
              </Item>
              <Item label="Role">
                <div>
                  <p className="font-medium">{role?.name ?? 'No role'}</p>
                  {role?.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                </div>
              </Item>
              <Item label="Field Visits">
                {employee.fieldAccess ? (
                  <Badge variant="success">Has access</Badge>
                ) : (
                  <Badge variant="secondary">No access</Badge>
                )}
              </Item>
            </div>

            {needsFieldRole && (
              <div className="flex flex-col gap-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-2 text-warning">
                  <MapPinned className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {employee.firstName} is marked as field staff, but their role does not open Field Visits — they
                    see “No access” there, and visits cannot be planned for them.
                    {!canEdit && ' Ask an administrator to give them the Field Employee role.'}
                  </span>
                </p>
                {canEdit && !isSelf && fieldRole && (
                  <Button
                    size="sm"
                    className="shrink-0"
                    loading={setRole.isPending}
                    onClick={() =>
                      setRole.mutate({
                        userId: login._id,
                        roleId: fieldRole._id,
                        employeeName: name,
                        roleName: fieldRole.name,
                      })
                    }
                  >
                    Give Field Employee role
                  </Button>
                )}
              </div>
            )}

            {isSelf && canEdit && (
              <p className="text-xs text-muted-foreground">
                This is your own login. Another administrator has to change your role or sign-in.
              </p>
            )}
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                Only someone who manages logins (an administrator) can change the role or block sign-in.
              </p>
            )}
            {login.status === 'invited' && canEdit && (
              <p className="text-xs text-muted-foreground">
                They have not accepted their invitation yet. Use Reset password to give them a password and let them
                sign in now.
              </p>
            )}
          </>
        )}
      </CardContent>

      {login && canEdit && (
        <>
          <ChangeRoleDialog
            open={choosing}
            onClose={() => setChoosing(false)}
            employeeName={name}
            userId={login._id}
            currentRoleId={role?._id ?? null}
            roles={roles.data ?? []}
            loading={roles.isLoading}
          />
          <ConfirmDialog
            open={statusConfirm}
            onClose={() => setStatusConfirm(false)}
            loading={setStatus.isPending}
            destructive={login.status === 'active'}
            title={login.status === 'active' ? `Block ${name} from signing in?` : `Let ${name} sign in again?`}
            description={
              login.status === 'active'
                ? 'They are signed out on their next request and cannot sign in to the web or mobile app until you allow it again. Their employee record is not changed.'
                : 'They can sign in to the web and mobile app again with their password.'
            }
            confirmLabel={login.status === 'active' ? 'Block sign-in' : 'Allow sign-in'}
            onConfirm={() =>
              setStatus.mutate(
                { userId: login._id, status: login.status === 'active' ? 'inactive' : 'active', employeeName: name },
                { onSuccess: () => setStatusConfirm(false) },
              )
            }
          />
        </>
      )}
    </Card>
  );
}

/** The role picker: every role with its description; admin-level changes are confirmed first. */
function ChangeRoleDialog({
  open,
  onClose,
  employeeName,
  userId,
  currentRoleId,
  roles,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  userId: string;
  currentRoleId: string | null;
  roles: AssignableRole[];
  loading: boolean;
}): ReactElement {
  const [selected, setSelected] = useState<string>(currentRoleId ?? '');
  const [confirming, setConfirming] = useState(false);
  const setRole = useSetLoginRole();

  useEffect(() => {
    if (open) {
      setSelected(currentRoleId ?? '');
      setConfirming(false);
    }
  }, [open, currentRoleId]);

  const current = roles.find((r) => r._id === currentRoleId) ?? null;
  const next = roles.find((r) => r._id === selected) ?? null;
  const changed = !!next && next._id !== currentRoleId;
  // Granting or removing an admin-level role is confirmed (and audit-logged on the server).
  const sensitive = changed && (!!next?.privileged || !!current?.privileged);

  const save = (): void => {
    if (!next || !changed) return;
    setRole.mutate(
      { userId, roleId: next._id, employeeName, roleName: next.name },
      {
        onSuccess: () => {
          setConfirming(false);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <Dialog open={open && !confirming} onClose={() => !setRole.isPending && onClose()} size="md">
        <DialogHeader>
          <DialogTitle>Change role — {employeeName}</DialogTitle>
          <DialogDescription>
            The role decides what they can see and do. It applies straight away; if they have the app open they
            should reload it to see the new menus.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground">Loading roles…</p>}
          <div role="radiogroup" aria-label="Role" className="space-y-2">
            {/* Everyday roles first, admin-level ones last. */}
            {[...roles].sort((a, b) => Number(a.privileged) - Number(b.privileged)).map((r) => {
              const isCurrent = r._id === currentRoleId;
              const disabled = !r.assignable && !isCurrent;
              const field = roleFieldScope(r);
              return (
                <label
                  key={r._id}
                  className={cn(
                    'flex items-start gap-3 rounded-md border p-3 transition-colors',
                    selected === r._id ? 'border-primary bg-primary/5' : 'border-border',
                    disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/40',
                  )}
                >
                  <input
                    type="radio"
                    name="login-role"
                    className="mt-1"
                    value={r._id}
                    checked={selected === r._id}
                    disabled={disabled}
                    onChange={() => setSelected(r._id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{r.name}</span>
                      {isCurrent && <Badge variant="secondary">Current</Badge>}
                      {r.privileged && <Badge variant="warning">Admin-level</Badge>}
                      {field && <Badge variant="outline">{field}</Badge>}
                    </span>
                    {r.description && <span className="mt-0.5 block text-xs text-muted-foreground">{r.description}</span>}
                    {disabled && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Includes permissions you do not have, so you cannot give it.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={setRole.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => (sensitive ? setConfirming(true) : save())}
            disabled={!changed}
            loading={setRole.isPending && !sensitive}
          >
            Save role
          </Button>
        </DialogFooter>
      </Dialog>
      <ConfirmDialog
        open={open && confirming}
        onClose={() => setConfirming(false)}
        onConfirm={save}
        loading={setRole.isPending}
        title={next?.privileged ? `Give ${employeeName} an admin-level role?` : `Remove ${employeeName}'s admin-level role?`}
        description={
          <>
            {employeeName} goes from <strong>{current?.name ?? 'no role'}</strong> to <strong>{next?.name ?? ''}</strong>.{' '}
            {next?.privileged
              ? 'Admin-level roles can manage logins, roles or system settings.'
              : 'They lose what that role let them manage.'}{' '}
            The change is recorded in the audit log.
          </>
        }
        confirmLabel="Change role"
        destructive={!!next?.privileged}
      />
    </>
  );
}
