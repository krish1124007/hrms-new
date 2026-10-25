import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/lib/query-client';
import { rolesApi, type AssignableRole } from '@/lib/roles.api';
import { usersApi } from '@/lib/users.api';
import type { Employee } from '@/lib/systemcore.api';
import { useAuthStore } from '@/stores/auth.store';
import { AppAccessCard } from './AppAccessCard';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }) }));
vi.mock('@/lib/roles.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/roles.api')>();
  return { ...actual, rolesApi: { ...actual.rolesApi, assignable: vi.fn() } };
});
vi.mock('@/lib/users.api', () => ({ usersApi: { setRole: vi.fn(), setStatus: vi.fn() } }));

const role = (slug: string, name: string, extra: Partial<AssignableRole> = {}): AssignableRole => ({
  _id: `r-${slug}`,
  name,
  slug,
  description: `${name} description`,
  isSystem: true,
  assignable: true,
  fieldAccess: false,
  fieldManage: false,
  privileged: false,
  ...extra,
});

const ROLES: AssignableRole[] = [
  role('admin', 'Admin', { privileged: true, fieldAccess: true, fieldManage: true }),
  role('employee', 'Employee'),
  role('field_employee', 'Field Employee', { fieldAccess: true }),
  role('field_manager', 'Field Manager', { fieldAccess: true }),
];

function employee(extra: Partial<Employee> = {}): Employee {
  return {
    _id: 'e1',
    employeeId: 'EMP-1',
    firstName: 'Ravi',
    lastName: 'Kumar',
    email: 'ravi@example.com',
    status: 'active',
    isFieldStaff: true,
    fieldAccess: false,
    userId: {
      _id: 'u-ravi',
      email: 'ravi@example.com',
      status: 'active',
      role: { _id: 'r-employee', name: 'Employee', slug: 'employee', description: 'Standard employee — self-service only' },
    },
    ...extra,
  } as Employee;
}

function signIn(permissions: string[], userId = 'u-admin'): void {
  useAuthStore.getState().setSession({
    user: { _id: userId, email: 'me@example.com', role: { slug: 'x', name: 'X', permissions } },
  });
}

function renderCard(e: Employee): void {
  render(
    <QueryClientProvider client={createAppQueryClient()}>
      <AppAccessCard employee={e} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rolesApi.assignable).mockResolvedValue(ROLES);
  vi.mocked(usersApi.setRole).mockResolvedValue({} as never);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('AppAccessCard', () => {
  it('shows the login, role and missing field access, and gives the Field Employee role in one click', async () => {
    signIn(['*']);
    const user = userEvent.setup();
    renderCard(employee());

    expect(screen.getByText('ravi@example.com')).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
    expect(screen.getByText(/marked as field staff, but their role does not open Field Visits/i)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /give field employee role/i }));
    await waitFor(() => expect(usersApi.setRole).toHaveBeenCalledWith('u-ravi', 'r-field_employee'));
  });

  it('changes the role from a list that describes each one', async () => {
    signIn(['*']);
    const user = userEvent.setup();
    renderCard(employee({ isFieldStaff: false }));

    await user.click(screen.getByRole('button', { name: /change role/i }));
    const dialog = await screen.findByRole('dialog', { name: /change role — ravi kumar/i });
    expect(await within(dialog).findByText('Field Visits: own visits')).toBeInTheDocument();
    expect(within(dialog).getByText('Field Visits: their team')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /save role/i })).toBeDisabled();

    await user.click(within(dialog).getByRole('radio', { name: /field manager/i }));
    await user.click(within(dialog).getByRole('button', { name: /save role/i }));
    await waitFor(() => expect(usersApi.setRole).toHaveBeenCalledWith('u-ravi', 'r-field_manager'));
  });

  it('asks before giving an admin-level role', async () => {
    signIn(['*']);
    const user = userEvent.setup();
    renderCard(employee({ isFieldStaff: false }));

    await user.click(screen.getByRole('button', { name: /change role/i }));
    const dialog = await screen.findByRole('dialog', { name: /change role/i });
    await user.click(await within(dialog).findByRole('radio', { name: /admin/i }));
    await user.click(within(dialog).getByRole('button', { name: /save role/i }));

    const confirm = await screen.findByRole('dialog', { name: /give ravi kumar an admin-level role/i });
    expect(confirm).toHaveTextContent(/recorded in the audit log/i);
    expect(usersApi.setRole).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: /change role/i }));
    await waitFor(() => expect(usersApi.setRole).toHaveBeenCalledWith('u-ravi', 'r-admin'));
  });

  it('roles the signed-in user cannot give are listed but cannot be chosen', async () => {
    signIn(['users.update', 'field.view']);
    vi.mocked(rolesApi.assignable).mockResolvedValue(
      ROLES.map((r) => (r.privileged ? { ...r, assignable: false } : r)),
    );
    const user = userEvent.setup();
    renderCard(employee({ isFieldStaff: false }));

    await user.click(screen.getByRole('button', { name: /change role/i }));
    const dialog = await screen.findByRole('dialog', { name: /change role/i });
    expect(await within(dialog).findByRole('radio', { name: /admin/i })).toBeDisabled();
    expect(within(dialog).getByText(/includes permissions you do not have/i)).toBeInTheDocument();
  });

  it('is read-only for HR without users.update, and says who can change it', () => {
    signIn(['employees.update']);
    renderCard(employee());
    expect(screen.queryByRole('button', { name: /change role/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /give field employee role/i })).not.toBeInTheDocument();
    expect(screen.getByText(/ask an administrator to give them the field employee role/i)).toBeInTheDocument();
    expect(rolesApi.assignable).not.toHaveBeenCalled();
  });

  it('does not let you change your own role', () => {
    signIn(['*'], 'u-ravi');
    renderCard(employee());
    expect(screen.getByRole('button', { name: /change role/i })).toBeDisabled();
    expect(screen.getByText(/this is your own login/i)).toBeInTheDocument();
  });

  it('says so when the employee has no login', () => {
    signIn(['*']);
    renderCard(employee({ userId: null }));
    expect(screen.getByText(/has no login account/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change role/i })).not.toBeInTheDocument();
  });

  it('is not shown to someone who cannot edit employees or logins', () => {
    signIn(['employees.view']);
    renderCard(employee());
    expect(screen.queryByText('App access')).not.toBeInTheDocument();
  });
});
