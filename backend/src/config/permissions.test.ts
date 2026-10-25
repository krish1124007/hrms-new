/**
 * Guards the one permission catalogue: every permission a route checks must be
 * in it (otherwise a custom role can never be granted the permission and
 * silently 403s), and the seeded roles may only hold catalogued permissions.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { ALL_PERMISSIONS, PERMISSIONS_BY_MODULE } from './permissions.js';
import { DEFAULT_ROLES } from '../models/role.model.js';

const ROUTES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../routes');

/** Every non-test `.ts` file under `dir`, recursively. */
function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

/** A single-, double- or interpolation-free backtick string literal. */
const STRING_LITERAL = /'[^'\n]*'|"[^"\n]*"|`[^`$\n]*`/g;

interface RouteScan {
  /** Every string literal passed to any `requirePermission(...)` / `requireAnyPermission(...)` call under src/routes. */
  used: Set<string>;
  /** `file: requirePermission(...)` for each call whose arguments are not purely string literals. */
  nonLiteralCalls: string[];
}

function scanRoutes(): RouteScan {
  const used = new Set<string>();
  const nonLiteralCalls: string[] = [];
  for (const file of routeFiles(ROUTES_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/require(?:Any)?Permission\(([^)]*)\)/g)) {
      const args = call[1]!;
      for (const literal of args.match(STRING_LITERAL) ?? []) used.add(literal.slice(1, -1));
      // Whatever is left once the literals and separators are removed is a constant,
      // a call, a template with `${}`... — something this scan cannot resolve.
      if (args.replace(STRING_LITERAL, '').replace(/[\s,]/g, '') !== '') {
        nonLiteralCalls.push(`${path.relative(ROUTES_DIR, file)}: ${call[0].replace(/\s+/g, ' ')}`);
      }
    }
  }
  return { used, nonLiteralCalls };
}

const permissionsUsedByRoutes = (): Set<string> => scanRoutes().used;

/**
 * Permissions no route guard names, on purpose: a route can only require "approve"
 * (every approver), and `lib/approvals.ts` then widens it to everybody's requests
 * for the holder of one of these. They are real, grantable and enforced — see the
 * "controller-enforced" tests below, which check the enforcement is still there.
 */
const CONTROLLER_ENFORCED = ['leaves.approve_all', 'expenses.approve_all', 'overtime.approve_all'];

/** Names the old catalogue listed although no route ever checked them. */
const INERT_PERMISSIONS = [
  'expense-claims.view',
  'expense-claims.approve',
  'expense-claims.update',
  'departments.manage',
  'designations.manage',
  'shifts.manage',
  'projects.manage',
  'documents.view',
  'documents.manage',
  'employees.export',
  'leaves.config',
  'settings.view',
  'notices.view',
];

describe('permission catalogue', () => {
  it('can read every requirePermission(...) call: all arguments are string literals', () => {
    // A future `requirePermission(SOME_CONST)` would hide a permission from the scan below.
    expect(scanRoutes().nonLiteralCalls).toEqual([]);
  });

  it('contains every permission any route checks', () => {
    const used = permissionsUsedByRoutes();
    // Guards against the scan silently matching nothing.
    expect(used.size).toBeGreaterThan(50);

    const missing = [...used].filter((perm) => !ALL_PERMISSIONS.has(perm)).sort();
    expect(missing).toEqual([]);
  });

  it('lists nothing that no route checks', () => {
    const used = permissionsUsedByRoutes();
    const inert = [...ALL_PERMISSIONS]
      .filter((perm) => !used.has(perm) && !CONTROLLER_ENFORCED.includes(perm))
      .sort();
    expect(inert).toEqual([]);
  });

  describe('controller-enforced approve_all permissions', () => {
    it('are catalogued under their module, next to the plain approve they widen', () => {
      expect(PERMISSIONS_BY_MODULE.leaves).toContain('leaves.approve_all');
      expect(PERMISSIONS_BY_MODULE.expenses).toContain('expenses.approve_all');
      expect(PERMISSIONS_BY_MODULE.overtime).toContain('overtime.approve_all');
      for (const perm of CONTROLLER_ENFORCED) expect(ALL_PERMISSIONS.has(perm)).toBe(true);
    });

    it('are really checked: approvals.ts names each one', () => {
      const source = fs.readFileSync(path.resolve(ROUTES_DIR, '../lib/approvals.ts'), 'utf8');
      for (const perm of CONTROLLER_ENFORCED) expect(source).toContain(perm);
    });

    it('are not what any route requires (a route requiring one would lock plain approvers out)', () => {
      const used = permissionsUsedByRoutes();
      for (const perm of CONTROLLER_ENFORCED) expect(used.has(perm)).toBe(false);
    });
  });

  it('contains none of the known-inert names', () => {
    const present = INERT_PERMISSIONS.filter((perm) => ALL_PERMISSIONS.has(perm));
    expect(present).toEqual([]);
  });

  it('includes the permissions added by the backup, notice and location gates', () => {
    for (const perm of ['backups.view', 'backups.manage', 'notices.manage', 'locations.manage']) {
      expect(ALL_PERMISSIONS.has(perm)).toBe(true);
    }
  });

  it('lists expenses.config under expenses, and the expense-category routes check it', () => {
    expect(PERMISSIONS_BY_MODULE.expenses).toContain('expenses.config');
    const source = fs.readFileSync(path.join(ROUTES_DIR, 'expense-claims.routes.ts'), 'utf8');
    const categoryWrites = [...source.matchAll(/router\.(post|patch|delete)\(\s*'\/categories[^']*',\s*requirePermission\(([^)]*)\)/g)];
    expect(categoryWrites).toHaveLength(3);
    for (const call of categoryWrites) expect(call[2]).toBe("'expenses.config'");
  });

  it('never lists a wildcard and has no duplicates across modules', () => {
    const flat = Object.values(PERMISSIONS_BY_MODULE).flat();
    expect(flat).not.toContain('*');
    expect(new Set(flat).size).toBe(flat.length);
    expect(ALL_PERMISSIONS.size).toBe(flat.length);
  });
});

describe('DEFAULT_ROLES', () => {
  it('only hold catalogued permissions (or the * wildcard)', () => {
    for (const role of DEFAULT_ROLES) {
      const unknown = role.permissions.filter((perm) => perm !== '*' && !ALL_PERMISSIONS.has(perm));
      expect({ role: role.slug, unknown }).toEqual({ role: role.slug, unknown: [] });
    }
  });

  it('nest: employee < manager < hr_executive < hr_manager', () => {
    const perms = (slug: string): Set<string> =>
      new Set(DEFAULT_ROLES.find((role) => role.slug === slug)!.permissions);
    const chain = ['employee', 'manager', 'hr_executive', 'hr_manager'].map(perms);
    for (let i = 1; i < chain.length; i += 1) {
      const lower = chain[i - 1]!;
      const higher = chain[i]!;
      expect([...lower].filter((perm) => !higher.has(perm))).toEqual([]);
      expect(higher.size).toBeGreaterThan(lower.size);
    }
  });

  it('gives HR the approve_all permissions and managers only the plain approve ones', () => {
    const perms = (slug: string): Set<string> =>
      new Set(DEFAULT_ROLES.find((role) => role.slug === slug)!.permissions);
    for (const slug of ['hr_executive', 'hr_manager']) {
      for (const perm of CONTROLLER_ENFORCED) expect({ slug, perm, has: perms(slug).has(perm) }).toEqual({ slug, perm, has: true });
    }
    for (const slug of ['employee', 'manager']) {
      for (const perm of CONTROLLER_ENFORCED) expect({ slug, perm, has: perms(slug).has(perm) }).toEqual({ slug, perm, has: false });
    }
    // A manager acts on the regularization requests they are notified about —
    // scoped to direct reports; only HR's attendance.manage sees everybody's.
    expect(perms('manager').has('attendance.approve')).toBe(true);
    expect(perms('manager').has('attendance.manage')).toBe(false);
    expect(perms('employee').has('attendance.approve')).toBe(false);
  });

  it('gives expenses.config (expense categories) to HR only', () => {
    const has = (slug: string): boolean =>
      DEFAULT_ROLES.find((role) => role.slug === slug)!.permissions.includes('expenses.config');
    expect(has('hr_executive')).toBe(true);
    expect(has('hr_manager')).toBe(true);
    expect(has('manager')).toBe(false);
    expect(has('employee')).toBe(false);
  });

  it('field roles: field_employee = employee + field.view; field_manager = manager + field.view (team-scoped, no field.manage); HR manage the field', () => {
    const perms = (slug: string): string[] => DEFAULT_ROLES.find((role) => role.slug === slug)!.permissions;
    expect(PERMISSIONS_BY_MODULE.field).toEqual(['field.view', 'field.manage']);
    expect(perms('field_employee').sort()).toEqual([...perms('employee'), 'field.view'].sort());
    expect(perms('field_manager').sort()).toEqual([...perms('manager'), 'field.view'].sort());
    expect(perms('field_manager')).not.toContain('field.manage');
    for (const slug of ['hr_executive', 'hr_manager']) {
      expect({ slug, has: ['field.view', 'field.manage'].every((p) => perms(slug).includes(p)) }).toEqual({ slug, has: true });
    }
    for (const slug of ['employee', 'manager']) {
      expect({ slug, field: perms(slug).filter((p) => p.startsWith('field')) }).toEqual({ slug, field: [] });
    }
    expect(DEFAULT_ROLES.filter((role) => role.slug.startsWith('field_')).every((role) => role.isSystem)).toBe(true);
  });

  it('keeps admin as the wildcard only', () => {
    expect(DEFAULT_ROLES.find((role) => role.slug === 'admin')!.permissions).toEqual(['*']);
  });

  it('has no duplicate permission within a role', () => {
    for (const role of DEFAULT_ROLES) {
      expect({ role: role.slug, size: new Set(role.permissions).size }).toEqual({
        role: role.slug,
        size: role.permissions.length,
      });
    }
  });
});
