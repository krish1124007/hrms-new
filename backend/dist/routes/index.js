import { Router } from 'express';
import authRoutes from './auth.routes.js';
import usersRoutes from './users.routes.js';
import rolesRoutes from './roles.routes.js';
import permissionsRoutes from './permissions.routes.js';
import employeesRoutes from './employees.routes.js';
import departmentsRoutes from './departments.routes.js';
import designationsRoutes from './designations.routes.js';
import shiftsRoutes from './shifts.routes.js';
import holidaysRoutes from './holidays.routes.js';
import projectsRoutes from './projects.routes.js';
import timesheetsRoutes from './timesheets.routes.js';
import leavesRoutes from './leaves.routes.js';
import expenseClaimsRoutes from './expense-claims.routes.js';
import attendanceRoutes from './attendance.routes.js';
import payrollRoutes from './payroll.routes.js';
import fieldRoutes from './field.routes.js';
import documentRoutes from './document.routes.js';
import idCardRoutes from './id-card.routes.js';
import backupRoutes from './backup.routes.js';
import calendarRoutes from './calendar.routes.js';
import noticeRoutes from './notice.routes.js';
import locationRoutes from './location.routes.js';
import notificationsRoutes from './notifications.routes.js';
import { meRouter as complianceMeRoutes } from './compliance.routes.js';
import searchRoutes from './search.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import auditLogsRoutes from './audit-logs.routes.js';
import adminRoutes from './admin.routes.js';
import teamRoutes from './team.routes.js';
import assetsRoutes from './assets.routes.js';
import loansRoutes from './loans.routes.js';
import disciplinaryRoutes from './disciplinary.routes.js';
import hrPoliciesRoutes from './hr-policies.routes.js';
import overtimeRoutes from './overtime.routes.js';
const router = Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/employees', employeesRoutes);
router.use('/departments', departmentsRoutes);
router.use('/designations', designationsRoutes);
router.use('/shifts', shiftsRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/projects', projectsRoutes);
router.use('/timesheets', timesheetsRoutes);
router.use('/leaves', leavesRoutes);
router.use('/expense-claims', expenseClaimsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/payroll', payrollRoutes);
router.use('/field', fieldRoutes);
router.use('/documents', documentRoutes);
router.use('/id-cards', idCardRoutes);
router.use('/backups', backupRoutes);
router.use('/calendar', calendarRoutes);
router.use('/notices', noticeRoutes);
router.use('/locations', locationRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/me', complianceMeRoutes);
router.use('/search', searchRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/admin', adminRoutes);
router.use('/team', teamRoutes);
router.use('/assets', assetsRoutes);
router.use('/loans', loansRoutes);
router.use('/disciplinary', disciplinaryRoutes);
router.use('/hr-policies', hrPoliciesRoutes);
router.use('/overtime', overtimeRoutes);
router.get('/privacy-policy', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy - Tankar Solutions HRMS</title>
  <style>
    body{
      font-family: Arial, sans-serif;
      line-height: 1.7;
      padding: 40px;
      max-width: 900px;
      margin: auto;
      color: #222;
    }
    h1,h2{
      color: #111;
    }
  </style>
</head>
<body>

  <h1>Privacy Policy</h1>

  <p>
    Tankar Solutions HRMS ("we", "our", or "us") values your privacy.
    This Privacy Policy explains how our application collects, uses,
    and protects user information.
  </p>

  <h2>Information We Collect</h2>

  <p>Our application may collect the following information:</p>

  <ul>
    <li>Employee details such as name, email, phone number, and department</li>
    <li>Attendance and work-related information</li>
    <li>Login credentials for authentication purposes</li>
    <li>Device information for app performance and security</li>
  </ul>

  <h2>How We Use Information</h2>

  <p>The collected information is used for:</p>

  <ul>
    <li>Managing employees and HR operations</li>
    <li>Attendance and payroll management</li>
    <li>Improving application performance and security</li>
    <li>Providing customer support</li>
  </ul>

  <h2>Data Security</h2>

  <p>
    We implement appropriate security measures to protect user data
    against unauthorized access, disclosure, or misuse.
  </p>

  <h2>Data Sharing</h2>

  <p>
    We do not sell, trade, or rent users' personal information to others.
    User data is only used for application functionality and business operations.
  </p>

  <h2>Third-Party Services</h2>

  <p>
    Our application may use trusted third-party services such as cloud hosting,
    analytics, or authentication providers to improve app functionality.
  </p>

  <h2>User Rights</h2>

  <p>
    Users may request correction or deletion of their personal data by contacting us.
  </p>

  <h2>Changes to This Privacy Policy</h2>

  <p>
    We may update this Privacy Policy from time to time.
    Changes will be posted on this page.
  </p>

  <h2>Contact Us</h2>

  <p>
    If you have any questions regarding this Privacy Policy,
    please contact us at:
  </p>

  <p>
    Email: support@tankarsolutions.com
  </p>

  <p>
    Last Updated: May 2026
  </p>

</body>
</html>`);
});
export default router;
//# sourceMappingURL=index.js.map