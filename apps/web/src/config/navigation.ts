import {
  BadgeCheck,
  BarChart3,
  BookOpen,
  BookText,
  Banknote,
  Briefcase,
  Building,
  Building2,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Clock,
  Clock3,
  FileBarChart,
  FileText,
  FolderKanban,
  FolderOpen,
  HandCoins,
  HardDrive,
  IndianRupee,
  Layers,
  LayoutDashboard,
  Lock,
  type LucideIcon,
  MapPin,
  MapPinned,
  Megaphone,
  PartyPopper,
  Package,
  Radar,
  Receipt,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Target,
  Users,
  Wallet,
} from 'lucide-react';

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

// ─── Permission shortcuts ─────────────────────────────────────────
const P = {
  self: [] as string[],
  employeesView: ['employees.view'],
  employeesManage: ['employees.create', 'employees.update', 'employees.delete'],
  attendanceView: ['attendance.view'],
  attendanceConfig: ['attendance.config'],
  leavesView: ['leaves.view'],
  leavesApprove: ['leaves.approve'],
  leavesConfig: ['leaves.config', 'leaves.update'],
  payrollView: ['payroll.view'],
  payrollProcess: ['payroll.process', 'payroll.config'],
  expensesView: ['expense-claims.view', 'expenses.view'],
  expensesManage: ['expense-claims.approve', 'expenses.approve', 'expense-claims.update'],
  projects: ['projects.view'],
  field: ['field-sales.view'],
  documents: ['documents.view'],
  settings: ['settings.view', 'settings.manage'],
  roles: ['roles.view', 'roles.manage'],
  audit: ['audit.view', 'settings.manage'],
  backups: ['backups.view', 'settings.manage'],
  assetsView: ['assets.view'],
  assetsManage: ['assets.manage'],
  loansView: ['loans.view'],
  loansManage: ['loans.manage'],
  disciplinaryView: ['disciplinary.view'],
  disciplinaryManage: ['disciplinary.manage'],
  policiesView: ['policies.view'],
  policiesManage: ['policies.manage'],
};

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
        permissions: P.employeesView,
        excludeRoles: ['employee'],
        children: [
          { label: 'All Employees', to: '/employees', icon: Users, module: 'hr', permissions: P.employeesView, excludeRoles: ['employee'] },
          { label: 'Departments', to: '/departments', icon: Building2, module: 'hr', permissions: P.employeesManage },
          { label: 'Designations', to: '/designations', icon: Briefcase, module: 'hr', permissions: P.employeesManage },
        ],
      },
      {
        label: 'Attendance',
        icon: Clock,
        module: 'attendance',
        children: [
          { label: 'Dashboard', to: '/attendance', icon: LayoutDashboard, module: 'attendance', permissions: P.attendanceView, excludeRoles: ['employee'] },
          { label: 'My Attendance', to: '/attendance/my', icon: CalendarDays, module: 'attendance', excludeRoles: ['admin'] },
          { label: 'Overtime', to: '/overtime', icon: Clock3, module: 'attendance' },
          { label: 'Records', to: '/attendance/records', icon: ClipboardList, module: 'attendance', permissions: P.attendanceView, excludeRoles: ['employee'] },
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
          { label: 'Requests', to: '/leaves/requests', icon: ClipboardList, module: 'leave', permissions: P.leavesApprove },
          { label: 'Calendar', to: '/leaves/calendar', icon: CalendarDays, module: 'leave' },
          { label: 'Balances', to: '/leaves/balances', icon: BookOpen, module: 'leave', permissions: P.leavesView, excludeRoles: ['employee'] },
          { label: 'Leave Types', to: '/leaves/types', icon: Settings, module: 'leave', permissions: P.leavesConfig },
        ],
      },
      {
        label: 'Payroll',
        icon: Wallet,
        module: 'payroll',
        children: [
          { label: 'Dashboard', to: '/payroll', icon: LayoutDashboard, module: 'payroll', permissions: P.payrollProcess },
          { label: 'My Payslips', to: '/payroll/my-payslips', icon: FileText, module: 'payroll', excludeRoles: ['admin'] },
          { label: 'Salary Components', to: '/payroll/components', icon: Banknote, module: 'payroll', permissions: P.payrollProcess },
          { label: 'Salary Structures', to: '/payroll/structures', icon: Layers, module: 'payroll', permissions: P.payrollProcess },
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
      { label: 'Shifts', to: '/shifts', icon: Clock3, module: 'hr', permissions: P.employeesManage },
      { label: 'Holidays', to: '/holidays', icon: PartyPopper, module: 'hr' },

      { label: 'Assets', to: '/assets', icon: Package, module: 'assets', permissions: P.assetsView },
      { label: 'Loans', to: '/loans', icon: HandCoins, module: 'loans', permissions: P.loansView },
      // No permissions gate — the page is role-aware: managers see all cases,
      // employees see only their own via /disciplinary/me. The "New Case" button
      // and other manage actions are hidden client-side for non-managers.
      { label: 'Disciplinary', to: '/disciplinary', icon: ShieldAlert, module: 'disciplinary' },
      { label: 'HR Policies', to: '/hr-policies', icon: BookText, module: 'hr', permissions: P.policiesView },
    ],
  },

  {
    title: 'Field Sales',
    items: [
      {
        label: 'Field Sales',
        icon: MapPin,
        module: 'field-sales',
        permissions: P.field,
        children: [
          { label: 'Dashboard', to: '/field', icon: LayoutDashboard, module: 'field-sales', permissions: P.field },
          { label: 'Clients', to: '/field/clients', icon: Building, module: 'field-sales', permissions: P.field },
          { label: 'Visits', to: '/field/visits', icon: MapPinned, module: 'field-sales', permissions: P.field },
          { label: 'Tasks', to: '/field/tasks', icon: ClipboardList, module: 'field-sales', permissions: P.field },
          { label: 'Orders', to: '/field/orders', icon: ShoppingCart, module: 'field-sales', permissions: P.field },
          { label: 'Collections', to: '/field/collections', icon: IndianRupee, module: 'field-sales', permissions: P.field },
          { label: 'Targets', to: '/field/targets', icon: Target, module: 'field-sales', permissions: P.field },
          { label: 'Live Tracking', to: '/field/tracking', icon: Radar, module: 'field-sales', permissions: P.field },
        ],
      },
    ],
  },

  {
    title: 'Projects',
    items: [
      { label: 'Projects', to: '/projects', icon: FolderKanban, module: 'projects', permissions: P.projects },
      { label: 'Timesheets', to: '/timesheets', icon: Clock, module: 'projects', permissions: P.projects },
    ],
  },

  {
    title: 'Tools',
    items: [
      { label: 'Documents', to: '/documents', icon: FolderOpen, module: 'documents' },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays },
      { label: 'Notice Board', to: '/notice-board', icon: Megaphone },
      // ID Card generator + Locations are admin tools — employees don't manage either.
      { label: 'ID Cards', to: '/id-cards', icon: BadgeCheck, excludeRoles: ['employee'] },
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
        permissions: P.roles,
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
