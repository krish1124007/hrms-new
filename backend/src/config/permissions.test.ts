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

/** Every quoted string passed to any `requirePermission(...)` call under src/routes. */
function permissionsUsedByRoutes(): Set<string> {
  const used = new Set<string>();
  for (const file of routeFiles(ROUTES_DIR)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of source.matchAll(/requirePermission\(([^)]*)\)/g)) {
      for (const literal of call[1]!.matchAll(/['"`]([^'"`]+)['"`]/g)) {
        used.add(literal[1]!);
      }
    }
  }
  return used;
}

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
  it('contains every permission any route checks', () => {
    const used = permissionsUsedByRoutes();
    // Guards against the scan silently matching nothing.
    expect(used.size).toBeGreaterThan(50);

    const missing = [...used].filter((perm) => !ALL_PERMISSIONS.has(perm)).sort();
    expect(missing).toEqual([]);
  });

  it('lists nothing that no route checks', () => {
    const used = permissionsUsedByRoutes();
    const inert = [...ALL_PERMISSIONS].filter((perm) => !used.has(perm)).sort();
    expect(inert).toEqual([]);
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
