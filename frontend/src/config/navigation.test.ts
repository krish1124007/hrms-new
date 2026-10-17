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
});
