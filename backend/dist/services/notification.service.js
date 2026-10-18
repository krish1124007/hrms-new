import { Notification } from '../models/notification.model.js';
import { Employee } from '../models/employee.model.js';
import { logger } from '../config/logger.js';
import { getIO } from '../sockets/io-registry.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
import { appBaseUrl } from '../lib/app-url.js';
import { cycleLabel } from '../lib/payroll-cycle.js';
import { decisionEmail, escapeHtml } from './email-templates.js';
import { sendMail } from './email.service.js';
/**
 * Persists a notification record. In the future this can also push via
 * Socket.io and/or Firebase Cloud Messaging.
 */
export async function createNotification(params) {
    try {
        const doc = await Notification.create({
            userId: params.userId,
            type: params.type,
            title: params.title,
            message: params.message,
            link: params.link,
            metadata: params.metadata,
        });
        // Real-time push to the user's socket room (no-op if no socket server).
        const io = getIO();
        if (io) {
            io.to(`user:${params.userId}`).emit('notification:new', {
                _id: String(doc._id),
                type: doc.type,
                title: doc.title,
                message: doc.message,
                link: doc.link,
                createdAt: doc.createdAt,
            });
        }
        logger.debug({ userId: params.userId, type: params.type }, 'Notification created');
    }
    catch (err) {
        logger.warn({ err, params }, 'Failed to create notification');
    }
}
/**
 * The user to tell about `emp`'s request: their reporting manager's login.
 * Null when there is no manager, the manager has no login, or the manager is
 * the employee themselves (nobody approves their own request). Never throws:
 * a failed lookup is logged and means "nobody to tell".
 */
export async function reportingManagerUserId(emp) {
    if (!emp.reportingManager)
        return null;
    try {
        const manager = await Employee.findById(emp.reportingManager).select('userId').lean().exec();
        if (!manager?.userId || (emp.userId && manager.userId.equals(emp.userId)))
            return null;
        return String(manager.userId);
    }
    catch (err) {
        logger.warn({ err, reportingManager: String(emp.reportingManager) }, 'notification: reporting manager lookup failed');
        return null;
    }
}
/**
 * Leave and regularization decisions keep the type they have always had (the
 * bell icon keys on it); expense and overtime decisions are plain `decision`s.
 */
const DECISION_TYPE = {
    leave: 'leave_request',
    regularization: 'regularization_decision',
    expense: 'decision',
    overtime: 'decision',
};
/**
 * Tell a user how a request of theirs was decided. Whatever the module, the
 * notification's metadata carries `module` and `status` (plus `metadata`), so
 * a client can filter on them.
 */
export async function notifyDecision(userId, notice) {
    await createNotification({
        userId,
        type: DECISION_TYPE[notice.module],
        title: notice.title,
        message: notice.message ?? notice.title,
        link: notice.link,
        metadata: { module: notice.module, status: notice.status, ...notice.metadata },
    });
}
/** Fire-and-forget: `sendMail` already logs its own failures; this keeps a rejection from going unhandled. */
export function sendMailQuietly(input) {
    void sendMail(input).catch((err) => {
        logger.warn({ err, to: input.to, subject: input.subject }, 'notification: e-mail failed');
    });
}
/**
 * Tell an employee how a request of theirs was decided, in-app and by e-mail.
 * Nothing happens for an employee without a login (they could not open the
 * link). A courtesy, never a failure: errors are logged, not thrown.
 */
export async function notifyEmployeeDecision(employeeId, notice) {
    try {
        const emp = await Employee.findById(employeeId).setOptions({ withDeleted: true }).select('userId email').lean().exec();
        if (!emp?.userId)
            return;
        await notifyDecision(String(emp.userId), notice);
        if (emp.email) {
            sendMailQuietly({
                to: emp.email,
                ...decisionEmail({ title: notice.title, body: notice.message ?? notice.title, link: notice.link }),
            });
        }
    }
    catch (err) {
        logger.warn({ err, module: notice.module, employeeId: String(employeeId) }, 'notification: decision notification failed');
    }
}
/* ─────────────── Trigger Helpers ─────────────── */
const businessDateFormat = new Intl.DateTimeFormat('en-IN', {
    timeZone: BUSINESS_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});
/** "19 Oct 2026" — a day label or an instant, in the business timezone. */
export function formatBusinessDate(date) {
    return businessDateFormat.format(date);
}
/** "19 Oct 2026", or "23 Oct 2026 – 27 Oct 2026" for a range (business timezone). */
export function formatLeaveDates(startDate, endDate) {
    const from = formatBusinessDate(startDate);
    const to = formatBusinessDate(endDate);
    return from === to ? from : `${from} – ${to}`;
}
export async function notifyLeaveRequest(managerId, employeeName, leaveType, dates, metadata = {}) {
    await createNotification({
        userId: managerId,
        type: 'leave_request',
        title: 'New Leave Request',
        message: `${employeeName} has applied for ${leaveType} (${dates}).`,
        link: '/leaves/requests',
        metadata: { employeeName, leaveType, dates, ...metadata },
    });
}
function decisionSentence(d) {
    return `Your ${d.leaveTypeName} request for ${formatLeaveDates(d.startDate, d.endDate)} was ${d.status}.`;
}
/** Tell an employee their leave request was approved or rejected (in-app). */
export async function notifyLeaveDecision(userId, d) {
    await notifyDecision(userId, {
        module: 'leave',
        status: d.status,
        title: d.status === 'approved' ? 'Leave approved' : 'Leave rejected',
        message: d.reason ? `${decisionSentence(d)} Reason: ${d.reason}` : decisionSentence(d),
        link: d.link,
        metadata: {
            leaveTypeName: d.leaveTypeName,
            dates: formatLeaveDates(d.startDate, d.endDate),
            ...(d.reason ? { reason: d.reason } : {}),
            ...(d.leaveRequestId ? { leaveRequestId: d.leaveRequestId } : {}),
        },
    });
}
/** Tell a manager an employee asked for a day's attendance to be corrected. */
export async function notifyRegularization(managerUserId, employeeName, dateLabel, metadata = {}) {
    await createNotification({
        userId: managerUserId,
        type: 'regularization_request',
        title: 'New Regularization Request',
        message: `${employeeName} has requested attendance regularization for ${dateLabel}.`,
        link: '/attendance/regularizations',
        metadata: { employeeName, date: dateLabel, ...metadata },
    });
}
/** Tell an employee their regularization request was approved or rejected. */
export async function notifyRegularizationDecision(employeeUserId, d) {
    const date = formatBusinessDate(d.date);
    await notifyDecision(employeeUserId, {
        module: 'regularization',
        status: d.status,
        title: d.status === 'approved' ? 'Regularization approved' : 'Regularization rejected',
        message: `Your attendance regularization for ${date} was ${d.status}.`,
        link: '/attendance',
        metadata: {
            date,
            ...(d.attendanceId ? { attendanceId: d.attendanceId } : {}),
        },
    });
}
/** The e-mail that goes with `notifyLeaveDecision`. */
export function leaveDecisionEmail(firstName, d) {
    const sentence = decisionSentence(d);
    const url = `${appBaseUrl()}${d.link}`;
    const reasonText = d.reason ? `\nReason: ${d.reason}` : '';
    return {
        subject: `Your leave request was ${d.status}`,
        html: `<p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(sentence)}</p>` +
            (d.reason ? `<p>Reason: ${escapeHtml(d.reason)}</p>` : '') +
            `<p><a href="${escapeHtml(url)}">View your leave</a></p>`,
        text: `Hi ${firstName},\n\n${sentence}${reasonText}\n\nView your leave: ${url}`,
    };
}
const inrFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
/** "₹1,200.00" */
export function formatInr(amount) {
    return inrFormat.format(amount);
}
export async function notifyExpenseRequest(approverId, employeeName, amount, metadata = {}) {
    await createNotification({
        userId: approverId,
        type: 'expense_request',
        title: 'Expense Claim Submitted',
        message: `${employeeName} submitted an expense claim of ${formatInr(amount)}.`,
        // Route is /expense-claims/requests — '/expenses/claims' 404s.
        link: '/expense-claims/requests',
        metadata: { employeeName, amount, ...metadata },
    });
}
/** Tell a manager an employee asked for overtime to be approved. */
export async function notifyOvertimeRequest(managerUserId, employeeName, hours, dateLabel, metadata = {}) {
    await createNotification({
        userId: managerUserId,
        type: 'approval_request',
        title: 'New Overtime Request',
        message: `${employeeName} has requested ${hours} h of overtime for ${dateLabel}.`,
        link: '/overtime',
        metadata: { employeeName, hours, date: dateLabel, ...metadata },
    });
}
/** Tell an employee their payslip for a locked payroll cycle can be opened. */
export async function notifyPayslipReady(userId, period) {
    await createNotification({
        userId,
        type: 'payslip_ready',
        title: 'Payslip ready',
        message: `Your payslip for ${cycleLabel(period)} is ready.`,
        link: '/payroll/my-payslips',
        metadata: { module: 'payroll', month: period.month, year: period.year },
    });
}
export async function notifyTaskAssigned(assigneeId, taskTitle, projectName) {
    await createNotification({
        userId: assigneeId,
        type: 'task_assigned',
        title: 'Task Assigned',
        message: `You have been assigned "${taskTitle}" in project ${projectName}.`,
        link: '/projects/tasks',
        metadata: { taskTitle, projectName },
    });
}
export async function notifyAttendanceAnomaly(managerId, employeeName, anomaly) {
    await createNotification({
        userId: managerId,
        type: 'attendance_anomaly',
        title: 'Attendance Anomaly',
        message: `${employeeName}: ${anomaly}`,
        link: '/attendance',
        metadata: { employeeName, anomaly },
    });
}
export async function notifyPaymentDue(adminId, invoiceNumber, amount, dueDate) {
    const formatted = formatInr(amount);
    await createNotification({
        userId: adminId,
        type: 'payment_due',
        title: 'Payment Due',
        message: `Invoice ${invoiceNumber} of ${formatted} is due on ${dueDate}.`,
        link: '/billing/invoices',
        metadata: { invoiceNumber, amount, dueDate },
    });
}
export async function notifySystemAlert(adminIds, title, message) {
    const promises = adminIds.map((adminId) => createNotification({
        userId: adminId,
        type: 'system_alert',
        title,
        message,
    }));
    await Promise.allSettled(promises);
}
export async function notifyApprovalRequest(approverId, entityType, requestedBy) {
    await createNotification({
        userId: approverId,
        type: 'approval_request',
        title: 'Approval Required',
        message: `${requestedBy} has submitted a ${entityType} for your approval.`,
        link: '/approvals',
        metadata: { entityType, requestedBy },
    });
}
export async function notifyNoticePublished(userIds, noticeTitle, noticeId) {
    const promises = userIds.map((userId) => createNotification({
        userId,
        type: 'system_alert', // Using system_alert type for notice board pop-ups
        title: 'New Notice Published',
        message: noticeTitle,
        link: `/notices/${noticeId}`,
        metadata: { noticeId, noticeTitle },
    }));
    await Promise.allSettled(promises);
}
//# sourceMappingURL=notification.service.js.map