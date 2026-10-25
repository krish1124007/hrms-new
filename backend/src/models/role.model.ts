import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface IRole extends Document {
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const roleSchema = new Schema<IRole>({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  description: { type: String },
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false },
});
roleSchema.plugin(timestampPlugin);
roleSchema.plugin(paginatePlugin);

roleSchema.index({ slug: 1 }, { unique: true });

export const Role = model<IRole, PaginateModel<IRole> & Model<IRole>>('Role', roleSchema);

/**
 * Seeded role permission sets. Each tier is built from the one below it so the
 * sets cannot drift apart; every name must be in `PERMISSIONS_BY_MODULE`
 * (enforced by `config/permissions.test.ts`).
 *
 * Self-service permissions only. The endpoints these unlock all return the
 * *calling user's* data:
 *   • attendance.checkin → POST /attendance/check-in, /check-out, /breaks/*
 *   • leaves.view        → GET  /leaves/requests/my, /balances (own)
 *   • leaves.create      → POST /leaves/requests (own application)
 *   • expenses.view      → GET  /expense-claims/requests/my
 *   • expenses.create    → POST /expense-claims/requests (own claim)
 *   • expenses.update    → PATCH /expense-claims/requests/:id (own draft)
 *   • expenses.delete    → DELETE own draft claim
 *   • payroll.view       → GET  /payroll/my-payslips
 *   • policies.view      → GET  /hr-policies/published (read-only)
 *   • holidays.view      → GET  /holidays (read-only company calendar)
 */
const EMPLOYEE_PERMISSIONS: string[] = [
  'attendance.checkin',
  'leaves.view',
  'leaves.create',
  'expenses.view',
  'expenses.create',
  'expenses.update',
  'expenses.delete',
  'payroll.view',
  'policies.view',
  'holidays.view',
];

/**
 * A team manager: sees the team and approves its leave, expenses, overtime and
 * attendance regularizations — for their direct reports only. The plain
 * `*.approve` permissions are scoped to the people who report to the manager
 * (`lib/approvals.ts`); the `*.approve_all` ones, held by HR below, lift that.
 */
const MANAGER_PERMISSIONS: string[] = [
  ...EMPLOYEE_PERMISSIONS,
  'employees.view',
  'attendance.view',
  'attendance.approve',
  'leaves.approve',
  'expenses.approve',
  'overtime.view',
  'overtime.approve',
];

/**
 * Day-to-day HR operations — no payroll processing, no structural deletes.
 * `attendance.approve` comes with the manager tier; `attendance.manage` and the
 * `*.approve_all` names are what let HR decide anybody's request, not just a
 * direct report's.
 */
const HR_EXECUTIVE_PERMISSIONS: string[] = [
  ...MANAGER_PERMISSIONS,
  'employees.create',
  'employees.update',
  'attendance.manage',
  'leaves.approve_all',
  'expenses.approve_all',
  'overtime.approve_all',
  // Expense categories (names, limits, receipt rules) — company-wide config.
  'expenses.config',
  'departments.view',
  'designations.view',
  'shifts.view',
  'holidays.create',
  'holidays.update',
  'leaves.update',
  'assets.view',
  'disciplinary.view',
  'notices.manage',
  'policies.manage',
  'events.manage',
  // Field Visits: every employee's visits, sites, routes and reports, and the settings.
  'field.view',
  'field.manage',
];

/**
 * Runs HR end to end, including people's logins: sees them, blocks or allows
 * sign-in, sets passwords and changes an employee's role (users.view /
 * users.update). The user guards still apply — never the Admin role, never
 * an admin's account, never their own role, never more access than they
 * hold (lib/permission-grants). Deliberately no roles.* / settings.manage /
 * backups.manage: editing roles themselves and system settings stays admin-only.
 */
const HR_MANAGER_PERMISSIONS: string[] = [
  ...HR_EXECUTIVE_PERMISSIONS,
  'users.view',
  'users.update',
  'employees.delete',
  'payroll.process',
  'payroll.config',
  'attendance.config',
  'departments.create',
  'departments.update',
  'departments.delete',
  'designations.create',
  'designations.update',
  'designations.delete',
  'shifts.create',
  'shifts.update',
  'shifts.delete',
  'holidays.delete',
  'leaves.delete',
  'assets.manage',
  'loans.view',
  'loans.manage',
  'loans.approve',
  'disciplinary.manage',
  'locations.manage',
  'audit.view',
  'projects.view',
  'projects.create',
  'projects.update',
  'projects.delete',
  'backups.view',
];

/**
 * Field Visits roles. A field employee is an employee who also checks in at
 * sites, pins sites and files visit reports (`field.view`: their own records,
 * plus their direct reports' if they have any). A field manager runs their
 * field team: a manager (approves their reports' leave, expenses — travel
 * claims included — and attendance) who also sees their team's visits,
 * sites, routes and reports, plans their visits and goes to sites themselves
 * — `field.view`, scoped to themselves and their direct reports. Seeing
 * everybody and the field settings (`field.manage`) stay with HR and admin.
 */
const FIELD_EMPLOYEE_PERMISSIONS: string[] = [...EMPLOYEE_PERMISSIONS, 'field.view'];

const FIELD_MANAGER_PERMISSIONS: string[] = [...MANAGER_PERMISSIONS, 'field.view'];

export const DEFAULT_ROLES: Array<{
  name: string;
  slug: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
}> = [
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access to all modules and settings',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: 'HR Manager',
    slug: 'hr_manager',
    description: 'Manages HR — employees, payroll, attendance, leaves, organisation setup',
    permissions: HR_MANAGER_PERMISSIONS,
    isSystem: true,
  },
  {
    name: 'HR Executive',
    slug: 'hr_executive',
    description: 'HR operations without payroll processing',
    permissions: HR_EXECUTIVE_PERMISSIONS,
    isSystem: true,
  },
  {
    name: 'Manager',
    slug: 'manager',
    description: 'Team manager — approve direct reports’ leaves, expenses, overtime and attendance, view team data',
    permissions: MANAGER_PERMISSIONS,
    isSystem: true,
  },
  {
    name: 'Employee',
    slug: 'employee',
    description: 'Standard employee — self-service only',
    permissions: EMPLOYEE_PERMISSIONS,
    isSystem: true,
  },
  {
    name: 'Field Employee',
    slug: 'field_employee',
    description: 'Employee working at sites — check in and out, pin sites, file visit reports, claim travel',
    permissions: FIELD_EMPLOYEE_PERMISSIONS,
    isSystem: true,
  },
  {
    name: 'Field Manager',
    slug: 'field_manager',
    description: 'Manager of a field team — plans their team’s visits, sees their visits, routes and reports, approves their claims',
    permissions: FIELD_MANAGER_PERMISSIONS,
    isSystem: true,
  },
];
