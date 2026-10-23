import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth.api';
import { hasAnyPermission } from '@/lib/permissions';
import { NAV_ACCESS, NAV_GROUPS, visibleNavLeaves } from './navigation';

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

  describe('Field Visits', () => {
    const fieldLeaves = (user: AuthUser): string[] => leavesFor(user).filter((to) => to.startsWith('/field'));
    const as = (slug: string, permissions: string[]): AuthUser => ({
      _id: `u-${slug}`,
      email: `${slug}@example.com`,
      role: { slug, name: slug, permissions },
    });
    const EMPLOYEE_ITEMS = ['/field/my-day', '/field/sites', '/field/visits'];
    const MANAGER_ITEMS = ['/field/planning', '/field/team-map', '/field/routes', '/field/reports'];

    it('is hidden from people without a field permission', () => {
      expect(fieldLeaves(employee())).toEqual([]);
    });

    it('gives a field employee My day, Sites and Visits only', () => {
      for (const user of [as('field_employee', ['leaves.view', 'field.view']), employee(['field.view'])]) {
        const tos = fieldLeaves(user);
        expect(tos).toEqual(expect.arrayContaining(EMPLOYEE_ITEMS));
        for (const to of [...MANAGER_ITEMS, '/field/settings']) expect(tos).not.toContain(to);
      }
    });

    it('adds Planning, Team map, Routes and Reports for a manager', () => {
      const tos = fieldLeaves(as('manager', ['employees.view', 'leaves.approve', 'field.view']));
      expect(tos).toEqual(expect.arrayContaining([...EMPLOYEE_ITEMS, ...MANAGER_ITEMS]));
      expect(tos).not.toContain('/field/settings');
    });

    it('adds Settings for field.manage holders', () => {
      const tos = fieldLeaves(as('field_manager', ['field.view', 'field.manage']));
      expect(tos).toEqual(expect.arrayContaining([...EMPLOYEE_ITEMS, ...MANAGER_ITEMS, '/field/settings']));
      // HR roles hold field.manage alone.
      expect(fieldLeaves(as('hr_manager', ['employees.view', 'field.manage']))).toContain('/field/settings');
    });

    it('has no sales entries left, even for an admin', () => {
      const admin = as('admin', ['*']);
      const labels = NAV_GROUPS.flatMap((g) => [g.title, ...g.items.flatMap((i) => [i.label, ...(i.children ?? []).map((c) => c.label)])]);
      expect(labels.filter((l) => /\b(sales?|orders?|products?|collections?|targets?|clients?)\b/i.test(l))).toEqual([]);
      expect(NAV_GROUPS.map((g) => g.title)).toContain('Field Visits');
      expect(fieldLeaves(admin).filter((to) => /orders|products|collections|targets|clients/.test(to))).toEqual([]);
      expect(JSON.stringify(NAV_ACCESS)).not.toContain('field-sales');
    });
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
