import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth.api';
import { hasAnyPermission } from '@/lib/permissions';
import { visibleNavLeaves } from './navigation';

function leavesFor(user: AuthUser): string[] {
  return visibleNavLeaves({
    roleSlug: user.role?.slug,
    hasAny: (perms) => hasAnyPermission(user, perms),
  }).map(({ item }) => item.to);
}

const employee = (customPermissions: string[] = []): AuthUser => ({
  _id: 'e1',
  email: 'e1@example.com',
  role: { slug: 'employee', name: 'Employee', permissions: ['leaves.view', 'expenses.view'] },
  customPermissions,
});

describe('sidebar visibility', () => {
  it('counts customPermissions on top of the role', () => {
    expect(leavesFor(employee())).not.toContain('/assets');
    expect(leavesFor(employee(['assets.view']))).toContain('/assets');
  });

  it('shows the ID card generator only to holders of employees.view', () => {
    const noView: AuthUser = {
      _id: 'm1',
      email: 'm1@example.com',
      role: { slug: 'custom_lead', name: 'Lead', permissions: ['leaves.approve'] },
    };
    expect(leavesFor(noView)).not.toContain('/id-cards');
    expect(leavesFor({ ...noView, customPermissions: ['employees.view'] })).toContain('/id-cards');
  });

  it('has no Projects or Timesheets entries, even for an admin', () => {
    const admin: AuthUser = {
      _id: 'a1',
      email: 'a1@example.com',
      role: { slug: 'admin', name: 'Admin', permissions: ['*'] },
    };
    const tos = leavesFor(admin);
    expect(tos.length).toBeGreaterThan(10);
    expect(tos.filter((to) => /^\/(projects|timesheets)\b/.test(to))).toEqual([]);
  });

  it('shows the regularization queue to approvers only', () => {
    const manager: AuthUser = {
      _id: 'm2',
      email: 'm2@example.com',
      role: { slug: 'manager', name: 'Manager', permissions: ['attendance.approve', 'leaves.approve'] },
    };
    expect(leavesFor(manager)).toContain('/attendance/regularizations');
    expect(leavesFor(employee())).not.toContain('/attendance/regularizations');
  });
});
