/**
 * The one permission catalogue.
 *
 * Every string a route passes to `requirePermission(...)` is listed here, and
 * nothing else is: the Roles UI offers exactly these names (GET /permissions),
 * `createRole` / `updateRole` / `updateUser` reject anything outside them, and
 * the seeded roles in `DEFAULT_ROLES` may only use them. A route that needs a
 * new permission must add it here — `permissions.test.ts` scans
 * `src/routes/**` and fails otherwise.
 *
 * The wildcard `*` (held by the admin role) is deliberately not catalogued: it
 * is not something a role editor can tick, and `ALL_PERMISSIONS` is the set of
 * *grantable* names.
 *
 * `leaves.approve_all`, `expenses.approve_all` and `overtime.approve_all` are the
 * one kind of name no `requirePermission(...)` mentions: the routes stay on the
 * plain `*.approve` (every manager), and `lib/approvals.ts` widens a holder of
 * `*.approve` from "my direct reports' requests" to everybody's when they also
 * hold `*.approve_all`. `permissions.test.ts` knows about and checks them.
 *
 * Keys group the Roles UI by module. They normally equal the prefix of the
 * names beneath them; `field` groups the `field-sales.*` permissions.
 */
export const PERMISSIONS_BY_MODULE: Record<string, string[]> = {
  users: ['users.view', 'users.create', 'users.update', 'users.delete'],
  roles: ['roles.view', 'roles.create', 'roles.update', 'roles.delete'],
  employees: ['employees.view', 'employees.create', 'employees.update', 'employees.delete'],
  departments: [
    'departments.view',
    'departments.create',
    'departments.update',
    'departments.delete',
  ],
  designations: [
    'designations.view',
    'designations.create',
    'designations.update',
    'designations.delete',
  ],
  shifts: ['shifts.view', 'shifts.create', 'shifts.update', 'shifts.delete'],
  holidays: ['holidays.view', 'holidays.create', 'holidays.update', 'holidays.delete'],
  attendance: [
    'attendance.checkin',
    'attendance.view',
    'attendance.manage',
    'attendance.approve',
    'attendance.config',
  ],
  leaves: [
    'leaves.view',
    'leaves.create',
    'leaves.update',
    'leaves.approve',
    'leaves.approve_all',
    'leaves.delete',
  ],
  payroll: ['payroll.view', 'payroll.process', 'payroll.config'],
  expenses: [
    'expenses.view',
    'expenses.create',
    'expenses.update',
    'expenses.delete',
    'expenses.approve',
    'expenses.approve_all',
  ],
  overtime: ['overtime.view', 'overtime.approve', 'overtime.approve_all'],
  assets: ['assets.view', 'assets.manage'],
  loans: ['loans.view', 'loans.manage', 'loans.approve'],
  disciplinary: ['disciplinary.view', 'disciplinary.manage'],
  policies: ['policies.view', 'policies.manage'],
  notices: ['notices.manage'],
  events: ['events.manage'],
  locations: ['locations.manage'],
  field: ['field-sales.view', 'field-sales.manage'],
  projects: ['projects.view', 'projects.create', 'projects.update', 'projects.delete'],
  audit: ['audit.view'],
  backups: ['backups.view', 'backups.manage'],
  settings: ['settings.manage'],
};

/** Every grantable permission name — the allow-list role and user editors validate against. */
export const ALL_PERMISSIONS: ReadonlySet<string> = new Set(
  Object.values(PERMISSIONS_BY_MODULE).flat(),
);
