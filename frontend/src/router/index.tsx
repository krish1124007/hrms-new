import { lazy, Suspense, type ReactElement } from 'react';
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { useAuthStore } from '@/stores/auth.store';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { RequirePermission } from '@/components/common/RequirePermission';
import { NAV_ACCESS } from '@/config/navigation';

const NotFoundPage = lazy(() => import('@/components/common/NotFoundPage'));

// Public pages (no auth) — used as App Store / Play Store support & privacy URLs
const SupportPage = lazy(() => import('@/pages/public/SupportPage'));
const VerifyIDPage = lazy(() => import('@/pages/public/VerifyIDPage'));

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const AcceptInvitePage = lazy(() => import('@/pages/auth/AcceptInvitePage'));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardRouter'));
const OverviewPage = lazy(() => import('@/pages/dashboard/OverviewPage'));
const EmployeeListPage = lazy(() => import('@/pages/employees/EmployeeListPage'));
const EmployeeDetailPage = lazy(() => import('@/pages/employees/EmployeeDetailPage'));
const EmployeeFormPage = lazy(() => import('@/pages/employees/EmployeeFormPage'));
const DepartmentListPage = lazy(() => import('@/pages/departments/DepartmentListPage'));
const DesignationListPage = lazy(() => import('@/pages/designations/DesignationListPage'));
const ShiftListPage = lazy(() => import('@/pages/shifts/ShiftListPage'));
const HolidayListPage = lazy(() => import('@/pages/holidays/HolidayListPage'));

// PMCore
const TimesheetPage = lazy(() => import('@/pages/projects/TimesheetPage'));

// Leaves
const LeaveTypesPage = lazy(() => import('@/pages/leaves/LeaveTypesPage'));
const MyLeavesPage = lazy(() => import('@/pages/leaves/MyLeavesPage'));
const LeaveListPage = lazy(() => import('@/pages/leaves/LeaveListPage'));
const LeaveCalendarPage = lazy(() => import('@/pages/leaves/LeaveCalendarPage'));
const LeaveBalancePage = lazy(() => import('@/pages/leaves/LeaveBalancePage'));

// Expense Claims (HR)
const ExpenseCategoryPage = lazy(() => import('@/pages/expense-claims/ExpenseCategoryPage'));
const MyExpensesPage = lazy(() => import('@/pages/expense-claims/MyExpensesPage'));
const ExpenseClaimListPage = lazy(() => import('@/pages/expense-claims/ExpenseListPage'));
const ExpenseReportPage = lazy(() => import('@/pages/expense-claims/ExpenseReportPage'));

// Payroll
const PayrollDashboardPage = lazy(() => import('@/pages/payroll/PayrollDashboardPage'));
const PayrollCycleDetailPage = lazy(() => import('@/pages/payroll/PayrollCycleDetailPage'));
const SalaryComponentsPage = lazy(() => import('@/pages/payroll/SalaryComponentsPage'));
const SalaryStructuresPage = lazy(() => import('@/pages/payroll/SalaryStructuresPage'));
const MyPayslipsPage = lazy(() => import('@/pages/payroll/MyPayslipsPage'));

// Field Sales
const FieldDashboardPage = lazy(() => import('@/pages/field/FieldDashboardPage'));
const ClientListPage = lazy(() => import('@/pages/field/ClientListPage'));
const VisitsPage = lazy(() => import('@/pages/field/VisitsPage'));
const FieldTasksPage = lazy(() => import('@/pages/field/FieldTasksPage'));
const SalesTargetsPage = lazy(() => import('@/pages/field/SalesTargetsPage'));
const OrdersPage = lazy(() => import('@/pages/field/OrdersPage'));
const CollectionsPage = lazy(() => import('@/pages/field/CollectionsPage'));
const LiveTrackingPage = lazy(() => import('@/pages/field/LiveTrackingPage'));

// Tools
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage'));
const IDCardPage = lazy(() => import('@/pages/id-cards/IDCardPage'));
const MyIDCardPage = lazy(() => import('@/pages/id-cards/MyIDCardPage'));
const BackupsPage = lazy(() => import('@/pages/system-backups/BackupsPage'));
const CalendarPage = lazy(() => import('@/pages/calendar/CalendarPage'));
const NoticeBoardPage = lazy(() => import('@/pages/notices/NoticeBoardPage'));
const LocationsPage = lazy(() => import('@/pages/locations/LocationsPage'));

// Profile (self-service for any signed-in user)
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));

// Settings
const SettingsHomePage = lazy(() => import('@/pages/settings/SettingsHomePage'));
const RolesPage = lazy(() => import('@/pages/settings/RolesPage'));
const AuditLogsPage = lazy(() => import('@/pages/settings/AuditLogsPage'));
const PrivacyPage = lazy(() => import('@/pages/settings/PrivacyPage'));

// Assets
const AssetListPage = lazy(() => import('@/pages/assets/AssetListPage'));
const AssetFormPage = lazy(() => import('@/pages/assets/AssetFormPage'));
const AssetDetailPage = lazy(() => import('@/pages/assets/AssetDetailPage'));

// Loans
const LoanListPage = lazy(() => import('@/pages/loans/LoanListPage'));
const LoanFormPage = lazy(() => import('@/pages/loans/LoanFormPage'));
const LoanDetailPage = lazy(() => import('@/pages/loans/LoanDetailPage'));

// Disciplinary
const DisciplinaryListPage = lazy(() => import('@/pages/disciplinary/DisciplinaryListPage'));
const DisciplinaryFormPage = lazy(() => import('@/pages/disciplinary/DisciplinaryFormPage'));
const DisciplinaryDetailPage = lazy(() => import('@/pages/disciplinary/DisciplinaryDetailPage'));

// HR Policies
const PolicyListPage = lazy(() => import('@/pages/hr-policies/PolicyListPage'));
const PolicyFormPage = lazy(() => import('@/pages/hr-policies/PolicyFormPage'));
const PolicyDetailPage = lazy(() => import('@/pages/hr-policies/PolicyDetailPage'));

// Overtime
const OvertimePage = lazy(() => import('@/pages/overtime/OvertimePage'));

// Attendance
const AttendanceDashboardPage = lazy(() => import('@/pages/attendance/AttendanceDashboardPage'));
const AttendanceListPage = lazy(() => import('@/pages/attendance/AttendanceListPage'));
const EmployeeAttendancePage = lazy(() => import('@/pages/attendance/EmployeeAttendancePage'));
const AttendanceConfigPage = lazy(() => import('@/pages/attendance/AttendanceConfigPage'));
const AttendanceSitesPage = lazy(() => import('@/pages/attendance/AttendanceSitesPage'));
const GeofencePage = lazy(() => import('@/pages/attendance/GeofencePage'));
const QRCodesPage = lazy(() => import('@/pages/attendance/QRCodesPage'));
const AllowedIPsPage = lazy(() => import('@/pages/attendance/AllowedIPsPage'));
const AttendanceTimesheetPage = lazy(() => import('@/pages/attendance/TimesheetPage'));
const AttendanceLiveTrackingPage = lazy(() => import('@/pages/attendance/LiveTrackingPage'));

function RouteFallback(): ReactElement {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactElement }): ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

/** Wraps an element in a permission guard using the same list as its sidebar entry. */
function guard(anyOf: string[], element: ReactElement): ReactElement {
  return <RequirePermission anyOf={anyOf}>{element}</RequirePermission>;
}

// NotFound is now lazy-loaded from @/components/common/NotFoundPage

export function AppRouter(): ReactElement {
  return (
    <Router>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public, no-auth pages (App Store / Play Store URLs) */}
          <Route path="/support" element={<SupportPage />} />
          {/* Public — where an ID-card QR scan lands. No login required. */}
          <Route path="/verify/:code" element={<VerifyIDPage />} />

          {/* Public auth routes */}
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          {/* Protected dashboard routes */}
          <Route
            element={
              <RequireAuth>
                <ErrorBoundary>
                  <DashboardLayout />
                </ErrorBoundary>
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/* SystemCore */}
            <Route path="/employees" element={guard(NAV_ACCESS.employees, <EmployeeListPage />)} />
            <Route path="/employees/new" element={guard(NAV_ACCESS.employees, <EmployeeFormPage />)} />
            <Route path="/employees/:id" element={guard(NAV_ACCESS.employees, <EmployeeDetailPage />)} />
            <Route path="/employees/:id/edit" element={guard(NAV_ACCESS.employees, <EmployeeFormPage />)} />
            <Route path="/departments" element={guard(NAV_ACCESS.departments, <DepartmentListPage />)} />
            <Route path="/designations" element={guard(NAV_ACCESS.designations, <DesignationListPage />)} />
            <Route path="/shifts" element={guard(NAV_ACCESS.shifts, <ShiftListPage />)} />
            <Route path="/holidays" element={guard(NAV_ACCESS.holidays, <HolidayListPage />)} />

            {/* Timesheets */}
            <Route path="/timesheets" element={<TimesheetPage />} />

            {/* Leaves */}
            <Route path="/leaves" element={<MyLeavesPage />} />
            <Route path="/leaves/requests" element={guard(NAV_ACCESS.leaveRequests, <LeaveListPage />)} />
            <Route path="/leaves/calendar" element={<LeaveCalendarPage />} />
            <Route path="/leaves/balances" element={guard(NAV_ACCESS.leaveBalances, <LeaveBalancePage />)} />
            <Route path="/leaves/types" element={guard(NAV_ACCESS.leaveTypes, <LeaveTypesPage />)} />

            {/* Expense Claims (HR) */}
            <Route path="/expense-claims" element={<MyExpensesPage />} />
            <Route path="/expense-claims/requests" element={guard(NAV_ACCESS.expensesManage, <ExpenseClaimListPage />)} />
            <Route path="/expense-claims/categories" element={guard(NAV_ACCESS.expensesManage, <ExpenseCategoryPage />)} />
            <Route path="/expense-claims/reports" element={guard(NAV_ACCESS.expensesManage, <ExpenseReportPage />)} />

            {/* Attendance */}
            <Route path="/attendance" element={<AttendanceDashboardPage />} />
            <Route path="/attendance/records" element={guard(NAV_ACCESS.attendanceView, <AttendanceListPage />)} />
            <Route path="/attendance/my" element={<EmployeeAttendancePage />} />
            <Route path="/attendance/timesheet" element={<AttendanceTimesheetPage />} />
            <Route path="/attendance/employee/:id" element={<EmployeeAttendancePage />} />
            <Route path="/attendance/settings" element={guard(NAV_ACCESS.attendanceConfig, <AttendanceConfigPage />)} />
            <Route path="/attendance/sites" element={guard(NAV_ACCESS.attendanceConfig, <AttendanceSitesPage />)} />
            <Route path="/attendance/geofences" element={guard(NAV_ACCESS.attendanceConfig, <GeofencePage />)} />
            <Route path="/attendance/qr-codes" element={guard(NAV_ACCESS.attendanceConfig, <QRCodesPage />)} />
            <Route path="/attendance/allowed-ips" element={guard(NAV_ACCESS.attendanceConfig, <AllowedIPsPage />)} />
            <Route path="/attendance/live-tracking" element={guard(NAV_ACCESS.attendanceView, <AttendanceLiveTrackingPage />)} />

            {/* Field Sales */}
            <Route path="/field" element={<FieldDashboardPage />} />
            <Route path="/field/clients" element={<ClientListPage />} />
            <Route path="/field/visits" element={<VisitsPage />} />
            <Route path="/field/tasks" element={<FieldTasksPage />} />
            <Route path="/field/targets" element={<SalesTargetsPage />} />
            <Route path="/field/orders" element={<OrdersPage />} />
            <Route path="/field/collections" element={<CollectionsPage />} />
            <Route path="/field/tracking" element={<LiveTrackingPage />} />

            {/* Payroll */}
            <Route path="/payroll" element={guard(NAV_ACCESS.payrollAdmin, <PayrollDashboardPage />)} />
            <Route path="/payroll/cycles/:id" element={guard(NAV_ACCESS.payrollAdmin, <PayrollCycleDetailPage />)} />
            <Route path="/payroll/components" element={guard(NAV_ACCESS.payrollAdmin, <SalaryComponentsPage />)} />
            <Route path="/payroll/structures" element={guard(NAV_ACCESS.payrollAdmin, <SalaryStructuresPage />)} />
            {/* Self-service — every employee, their own payslips only. */}
            <Route path="/payroll/my-payslips" element={<MyPayslipsPage />} />

            {/* Tools */}
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/id-cards" element={<IDCardPage />} />
            {/* Self-service — every employee, their own card only. */}
            <Route path="/my-id-card" element={<MyIDCardPage />} />
            <Route path="/backups" element={guard(NAV_ACCESS.backups, <BackupsPage />)} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/notices" element={<NoticeBoardPage />} />
            {/* Notice notifications link here — the board highlights the one asked for. */}
            <Route path="/notices/:id" element={<NoticeBoardPage />} />
            <Route path="/locations" element={<LocationsPage />} />

            {/* Analytics Overview — deep insights beyond the dashboard snapshot */}
            <Route path="/dashboard/overview" element={<OverviewPage />} />
            <Route path="/notice-board" element={<Navigate to="/notices" replace />} />

            {/* Settings */}
            <Route path="/settings" element={guard(NAV_ACCESS.settings, <SettingsHomePage />)} />
            <Route path="/settings/roles" element={guard(NAV_ACCESS.roles, <RolesPage />)} />
            <Route path="/settings/audit" element={guard(NAV_ACCESS.audit, <AuditLogsPage />)} />
            {/* Self-service — the user's own cookie choices and privacy history. */}
            <Route path="/settings/privacy" element={<PrivacyPage />} />
            <Route path="/settings/backup" element={<Navigate to="/backups" replace />} />

            {/* Assets */}
            <Route path="/assets" element={<AssetListPage />} />
            <Route path="/assets/new" element={<AssetFormPage />} />
            <Route path="/assets/:id" element={<AssetDetailPage />} />
            <Route path="/assets/:id/edit" element={<AssetFormPage />} />

            {/* Loans */}
            <Route path="/loans" element={<LoanListPage />} />
            <Route path="/loans/new" element={<LoanFormPage />} />
            <Route path="/loans/:id" element={<LoanDetailPage />} />
            <Route path="/loans/:id/edit" element={<LoanFormPage />} />

            {/* Disciplinary */}
            <Route path="/disciplinary" element={<DisciplinaryListPage />} />
            <Route path="/disciplinary/new" element={<DisciplinaryFormPage />} />
            <Route path="/disciplinary/:id" element={<DisciplinaryDetailPage />} />
            <Route path="/disciplinary/:id/edit" element={<DisciplinaryFormPage />} />

            {/* Overtime */}
            <Route path="/overtime" element={<OvertimePage />} />

            {/* HR Policies */}
            <Route path="/hr-policies" element={<PolicyListPage />} />
            <Route path="/hr-policies/new" element={<PolicyFormPage />} />
            <Route path="/hr-policies/:id" element={<PolicyDetailPage />} />
            <Route path="/hr-policies/:id/edit" element={<PolicyFormPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
