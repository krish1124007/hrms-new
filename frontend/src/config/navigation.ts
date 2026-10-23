import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  BookText,
  Banknote,
  Briefcase,
  Building2,
  Car,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Clock,
  Clock3,
  ClipboardCheck,
  FileBarChart,
  FileText,
  FolderOpen,
  HandCoins,
  HardDrive,
  Layers,
  LayoutDashboard,
  Lock,
  Map as MapIcon,
  type LucideIcon,
  MapPin,
  MapPinned,
  Megaphone,
  PartyPopper,
  Package,
  Radar,
  Receipt,
  Route,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react';
import { FIELD_PATHS } from '@/lib/field-links';

/**
 * Navigation schema.
 *
 * A leaf item has `to`; a parent has `children` (and typically no `to` —
 * clicking it toggles expansion rather than navigating). One level of
 * nesting is enough — avoid a third level to keep scanning cheap.
 */
export interface NavItem {
  label: string;
  to?: string;
  icon: LucideIcon;
  module?: string;
  badgeKey?: string;
  permissions?: string[];
  hidden?: boolean;
  /**
   * Hide this item if the signed-in user's role.slug is in this list.
   * Used for two cases:
   *   - admin/manager-only pages → `excludeRoles: ['employee']`
   *   - self-service ("My …") pages → `excludeRoles: ['admin']`
   * The Sidebar's `isItemEnabled` checks both excludeRoles and permissions.
   */
  excludeRoles?: string[];
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// ─── Permission lists ─────────────────────────────────────────────
// Every name here is in the backend permission catalogue. The router's
// <RequirePermission> guards import these same lists, so a page's sidebar
// entry and its route guard can never disagree.
export const NAV_ACCESS = {
  employees: ['employees.view'],
  departments: ['departments.view'],
  designations: ['designations.view'],
  shifts: ['shifts.view'],
  holidays: ['holidays.view'],
  attendanceView: ['attendance.view'],
  attendanceConfig: ['attendance.config'],
  /** The regularization approval queue — managers see their direct reports', HR everyone's. */
  attendanceApprove: ['attendance.approve'],
  leaveRequests: ['leaves.approve'],
  // Either may read balances on the API; seeded managers hold only leaves.approve.
  leaveBalances: ['leaves.approve', 'leaves.update'],
  leaveTypes: ['leaves.update'],
  payrollAdmin: ['payroll.process', 'payroll.config'],
  expensesManage: ['expenses.approve'],
  assets: ['assets.view'],
  loans: ['loans.view'],
  /** The ID card generator lists and prints other employees' cards. */
  idCards: ['employees.view'],
  policies: ['policies.view'],
  roles: ['roles.view'],
  audit: ['audit.view'],
  backups: ['backups.view'],
  /** Field Visits: own records and direct reports' (`field.view`), everyone's (`field.manage`). */
  fieldView: ['field.view', 'field.manage'],
  /** Field Visits administration: the settings, site import and deletes. */
  fieldManage: ['field.manage'],
  /** The Settings home page and the sidebar group around it. */
  settings: ['roles.view', 'audit.view', 'backups.view', 'settings.manage'],
} satisfies Record<string, string[]>;

const P = NAV_ACCESS;

/** Role slugs of people who do field work but run no team: they get the self-service field pages only. */
const FIELD_EMPLOYEE_ROLES = ['employee', 'field_employee'];

// ─── Groups ───────────────────────────────────────────────────────
// Each group renders as a sidebar section. Parent items with `children`
// collapse/expand; leaves navigate directly.
//
// Design rule: one level of nesting. Sub-domain with >6 children →
// promote to its own group rather than adding a third level.
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      // Admin analytics — out of scope for self-service employees.
      { label: 'Overview', to: '/dashboard/overview', icon: BarChart3, excludeRoles: ['employee'] },
    ],
  },

  {
    title: 'HR',
    items: [
      {
        label: 'Employees',
        icon: Users,
        module: 'hr',
        permissions: [...P.employees, ...P.departments, ...P.designations],
        excludeRoles: ['employee'],
        children: [
          { label: 'All Employees', to: '/employees', icon: Users, module: 'hr', permissions: P.employees, excludeRoles: ['employee'] },
          { label: 'Departments', to: '/departments', icon: Building2, module: 'hr', permissions: P.departments },
          { label: 'Designations', to: '/designations', icon: Briefcase, module: 'hr', permissions: P.designations },
        ],
      },
      {
        label: 'Attendance',
        icon: Clock,
        module: 'attendance',
        children: [
          { label: 'Dashboard', to: '/attendance', icon: LayoutDashboard, module: 'attendance', permissions: P.attendanceView, excludeRoles: ['employee'] },
          { label: 'Live Tracking', to: '/attendance/live-tracking', icon: Radar, module: 'attendance', permissions: P.attendanceView, excludeRoles: ['employee'] },
          { label: 'My Attendance', to: '/attendance/my', icon: CalendarDays, module: 'attendance', excludeRoles: ['admin'] },
          // Self-service for everyone; the page adds the team view for `overtime.view`.
          { label: 'Overtime', to: '/overtime', icon: Clock3, module: 'attendance' },
          { label: 'Records', to: '/attendance/records', icon: ClipboardList, module: 'attendance', permissions: P.attendanceView, excludeRoles: ['employee'] },
          { label: 'Regularizations', to: '/attendance/regularizations', icon: ClipboardCheck, module: 'attendance', permissions: P.attendanceApprove },
          { label: 'Sites', to: '/attendance/sites', icon: MapPin, module: 'attendance', permissions: P.attendanceConfig },
          { label: 'Geofences', to: '/attendance/geofences', icon: MapPinned, module: 'attendance', permissions: P.attendanceConfig },
          { label: 'QR Codes', to: '/attendance/qr-codes', icon: HardDrive, module: 'attendance', permissions: P.attendanceConfig },
          { label: 'Allowed IPs', to: '/attendance/allowed-ips', icon: Shield, module: 'attendance', permissions: P.attendanceConfig },
          { label: 'Settings', to: '/attendance/settings', icon: Settings, module: 'attendance', permissions: P.attendanceConfig },
        ],
      },
      {
        label: 'Leaves',
        icon: CalendarOff,
        module: 'leave',
        children: [
          { label: 'My Leaves', to: '/leaves', icon: CalendarOff, module: 'leave', excludeRoles: ['admin'] },
          { label: 'Requests', to: '/leaves/requests', icon: ClipboardList, module: 'leave', permissions: P.leaveRequests },
          { label: 'Calendar', to: '/leaves/calendar', icon: CalendarDays, module: 'leave' },
          { label: 'Balances', to: '/leaves/balances', icon: BookOpen, module: 'leave', permissions: P.leaveBalances },
          { label: 'Leave Types', to: '/leaves/types', icon: Settings, module: 'leave', permissions: P.leaveTypes },
        ],
      },
      {
        label: 'Payroll',
        icon: Wallet,
        module: 'payroll',
        children: [
          { label: 'Dashboard', to: '/payroll', icon: LayoutDashboard, module: 'payroll', permissions: P.payrollAdmin },
          { label: 'My Payslips', to: '/payroll/my-payslips', icon: FileText, module: 'payroll', excludeRoles: ['admin'] },
          { label: 'Salary Components', to: '/payroll/components', icon: Banknote, module: 'payroll', permissions: P.payrollAdmin },
          { label: 'Salary Structures', to: '/payroll/structures', icon: Layers, module: 'payroll', permissions: P.payrollAdmin },
        ],
      },
      {
        label: 'Expenses',
        icon: Receipt,
        module: 'expenses',
        children: [
          { label: 'My Expenses', to: '/expense-claims', icon: Receipt, module: 'expenses', excludeRoles: ['admin'] },
          { label: 'Claims', to: '/expense-claims/requests', icon: HandCoins, module: 'expenses', permissions: P.expensesManage },
          { label: 'Categories', to: '/expense-claims/categories', icon: ShoppingBag, module: 'expenses', permissions: P.expensesManage },
          { label: 'Reports', to: '/expense-claims/reports', icon: FileBarChart, module: 'expenses', permissions: P.expensesManage },
        ],
      },
      { label: 'Shifts', to: '/shifts', icon: Clock3, module: 'hr', permissions: P.shifts },
      { label: 'Holidays', to: '/holidays', icon: PartyPopper, module: 'hr', permissions: P.holidays },

      { label: 'Assets', to: '/assets', icon: Package, module: 'assets', permissions: P.assets },
      { label: 'Loans', to: '/loans', icon: HandCoins, module: 'loans', permissions: P.loans },
      // No permissions gate — the page is role-aware: managers see all cases,
      // employees see only their own via /disciplinary/me. The "New Case" button
      // and other manage actions are hidden client-side for non-managers.
      { label: 'Disciplinary', to: '/disciplinary', icon: ShieldAlert, module: 'disciplinary' },
      { label: 'HR Policies', to: '/hr-policies', icon: BookText, module: 'hr', permissions: P.policies },
    ],
  },

  {
    title: 'Field Visits',
    items: [
      // Self-service: the signed-in employee's own day (admins have no employee record).
      { label: 'My day', to: '/field/my-day', icon: CalendarCheck, module: 'field', permissions: P.fieldView, excludeRoles: ['admin'] },
      { label: 'Sites', to: '/field/sites', icon: Building2, module: 'field', permissions: P.fieldView },
      { label: 'Visits', to: FIELD_PATHS.visits, icon: MapPin, module: 'field', permissions: P.fieldView },
      // Team pages: managers (and field.manage holders), not the field employees themselves.
      { label: 'Planning', to: '/field/planning', icon: CalendarClock, module: 'field', permissions: P.fieldView, excludeRoles: FIELD_EMPLOYEE_ROLES },
      { label: 'Team map', to: FIELD_PATHS.teamMap, icon: MapIcon, module: 'field', permissions: P.fieldView, excludeRoles: FIELD_EMPLOYEE_ROLES },
      { label: 'Routes', to: FIELD_PATHS.routes, icon: Route, module: 'field', permissions: P.fieldView, excludeRoles: FIELD_EMPLOYEE_ROLES },
      { label: 'Reports', to: FIELD_PATHS.reports, icon: FileBarChart, module: 'field', permissions: P.fieldView, excludeRoles: FIELD_EMPLOYEE_ROLES },
      { label: 'Travel allowance', to: FIELD_PATHS.travel, icon: Car, module: 'field', permissions: P.fieldView, excludeRoles: ['admin'] },
      { label: 'Settings', to: '/field/settings', icon: Settings, module: 'field', permissions: P.fieldManage },
    ],
  },

  {
    title: 'Tools',
    items: [
      // Open to every signed-in user — the documents API is auth-only.
      { label: 'Documents', to: '/documents', icon: FolderOpen, module: 'documents' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays },
      { label: 'Notice Board', to: '/notice-board', icon: Megaphone },
      // Everyone has an ID card of their own; only HR generates other people's.
      { label: 'My ID Card', to: '/my-id-card', icon: BadgeCheck },
      // ID Card generator + Locations are admin tools — employees don't manage either.
      { label: 'ID Cards', to: '/id-cards', icon: BadgeCheck, permissions: P.idCards, excludeRoles: ['employee'] },
      { label: 'Locations', to: '/locations', icon: MapPin, excludeRoles: ['employee'] },
    ],
  },

  {
    title: 'Settings',
    items: [
      {
        label: 'Workspace',
        icon: Settings,
        permissions: P.settings,
        children: [
          { label: 'General', to: '/settings', icon: Settings, permissions: P.settings },
        ],
      },
      {
        label: 'Access & Security',
        icon: Shield,
        permissions: P.settings,
        children: [
          { label: 'Roles & Permissions', to: '/settings/roles', icon: Shield, permissions: P.roles },
          { label: 'Audit Logs', to: '/settings/audit', icon: ScrollText, permissions: P.audit },
          { label: 'Privacy', to: '/settings/privacy', icon: Lock },
          { label: 'Backup', to: '/settings/backup', icon: HardDrive, permissions: P.backups },
        ],
      },
    ],
  },
];

// ─── Visibility ───────────────────────────────────────────────────

export interface NavAccessContext {
  /** The signed-in user's role slug (for `excludeRoles`). */
  roleSlug?: string;
  /** Permission check — `usePermissions().hasAny`. */
  hasAny: (permissions: string[]) => boolean;
  /** When set, items whose `module` is not listed are hidden. */
  enabledModules?: string[];
}

/** Should this item (leaf or parent) be shown to the current user? */
export function isNavItemEnabled(item: NavItem, ctx: NavAccessContext): boolean {
  if (item.hidden) return false;
  if (item.module && ctx.enabledModules && !ctx.enabledModules.includes(item.module)) {
    return false;
  }
  // Hide self-service items (My-*) from admin / HR roles — they're not
  // employees in the workforce sense and would just see empty data.
  if (item.excludeRoles && ctx.roleSlug && item.excludeRoles.includes(ctx.roleSlug)) {
    return false;
  }
  if (item.permissions && item.permissions.length > 0) {
    return ctx.hasAny(item.permissions);
  }
  return true;
}

/**
 * Every navigable leaf the user can see, in sidebar order. A child is only
 * included when its parent is visible too, and entries without `to` are
 * skipped, so callers never navigate to `undefined`.
 */
export function visibleNavLeaves(
  ctx: NavAccessContext,
): Array<{ item: NavItem & { to: string }; parentLabel?: string }> {
  const out: Array<{ item: NavItem & { to: string }; parentLabel?: string }> = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!isNavItemEnabled(item, ctx)) continue;
      if (item.to) out.push({ item: item as NavItem & { to: string } });
      for (const child of item.children ?? []) {
        if (child.to && isNavItemEnabled(child, ctx)) {
          out.push({ item: child as NavItem & { to: string }, parentLabel: item.label });
        }
      }
    }
  }
  return out;
}
