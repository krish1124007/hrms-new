/**
 * Notification trigger service.
 *
 * Creates in-app notifications and provides convenience helpers
 * for common cross-module notification scenarios.
 */
import type { Types } from 'mongoose';
import { Notification, type NotificationType } from '../models/notification.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { logger } from '../config/logger.js';
import { getIO } from '../sockets/io-registry.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
import { appBaseUrl } from '../lib/app-url.js';

/* ─────────────── Core ─────────────── */

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists a notification record. In the future this can also push via
 * Socket.io and/or Firebase Cloud Messaging.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
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

    logger.debug(
      { userId: params.userId, type: params.type },
      'Notification created',
    );
  } catch (err) {
    logger.warn({ err, params }, 'Failed to create notification');
  }
}

/**
 * The user to tell about `emp`'s request: their reporting manager's login.
 * Null when there is no manager, the manager has no login, or the manager is
 * the employee themselves (nobody approves their own request). Never throws:
 * a failed lookup is logged and means "nobody to tell".
 */
export async function reportingManagerUserId(
  emp: Pick<IEmployee, 'reportingManager'> & { userId?: Types.ObjectId | null },
): Promise<string | null> {
  if (!emp.reportingManager) return null;
  try {
    const manager = await Employee.findById(emp.reportingManager).select('userId').lean().exec();
    if (!manager?.userId || (emp.userId && manager.userId.equals(emp.userId))) return null;
    return String(manager.userId);
  } catch (err) {
    logger.warn({ err, reportingManager: String(emp.reportingManager) }, 'notification: reporting manager lookup failed');
    return null;
  }
}

/* ─────────────── Trigger Helpers ─────────────── */

const leaveDateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: BUSINESS_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "19 Oct 2026" — a day label or an instant, in the business timezone. */
export function formatBusinessDate(date: Date): string {
  return leaveDateFormat.format(date);
}

/** "19 Oct 2026", or "23 Oct 2026 – 27 Oct 2026" for a range (business timezone). */
export function formatLeaveDates(startDate: Date, endDate: Date): string {
  const from = formatBusinessDate(startDate);
  const to = formatBusinessDate(endDate);
  return from === to ? from : `${from} – ${to}`;
}

export async function notifyLeaveRequest(
  managerId: string,
  employeeName: string,
  leaveType: string,
  dates: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await createNotification({
    userId: managerId,
    type: 'leave_request',
    title: 'New Leave Request',
    message: `${employeeName} has applied for ${leaveType} (${dates}).`,
    link: '/leaves/requests',
    metadata: { employeeName, leaveType, dates, ...metadata },
  });
}

export interface LeaveDecision {
  status: 'approved' | 'rejected';
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  /** Where the employee sees their leave (`/leaves`). */
  link: string;
  /** The approver's reason, for a rejection. */
  reason?: string;
  leaveRequestId?: string;
}

function decisionSentence(d: LeaveDecision): string {
  return `Your ${d.leaveTypeName} request for ${formatLeaveDates(d.startDate, d.endDate)} was ${d.status}.`;
}

/** Tell an employee their leave request was approved or rejected (in-app). */
export async function notifyLeaveDecision(userId: string, d: LeaveDecision): Promise<void> {
  await createNotification({
    userId,
    type: 'leave_request',
    title: d.status === 'approved' ? 'Leave approved' : 'Leave rejected',
    message: d.reason ? `${decisionSentence(d)} Reason: ${d.reason}` : decisionSentence(d),
    link: d.link,
    metadata: {
      status: d.status,
      leaveTypeName: d.leaveTypeName,
      dates: formatLeaveDates(d.startDate, d.endDate),
      ...(d.reason ? { reason: d.reason } : {}),
      ...(d.leaveRequestId ? { leaveRequestId: d.leaveRequestId } : {}),
    },
  });
}

/** Tell a manager an employee asked for a day's attendance to be corrected. */
export async function notifyRegularization(
  managerUserId: string,
  employeeName: string,
  dateLabel: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await createNotification({
    userId: managerUserId,
    type: 'regularization_request',
    title: 'New Regularization Request',
    message: `${employeeName} has requested attendance regularization for ${dateLabel}.`,
    link: '/attendance/regularizations',
    metadata: { employeeName, date: dateLabel, ...metadata },
  });
}

export interface RegularizationDecision {
  /** The day the request was about (a day label). */
  date: Date;
  status: 'approved' | 'rejected';
  reason?: string;
  attendanceId?: string;
}

/** Tell an employee their regularization request was approved or rejected. */
export async function notifyRegularizationDecision(
  employeeUserId: string,
  d: RegularizationDecision,
): Promise<void> {
  const date = formatBusinessDate(d.date);
  const sentence = `Your attendance regularization for ${date} was ${d.status}.`;
  await createNotification({
    userId: employeeUserId,
    type: 'regularization_decision',
    title: d.status === 'approved' ? 'Regularization approved' : 'Regularization rejected',
    message: d.reason ? `${sentence} Reason: ${d.reason}` : sentence,
    link: '/attendance',
    metadata: {
      status: d.status,
      date,
      ...(d.reason ? { reason: d.reason } : {}),
      ...(d.attendanceId ? { attendanceId: d.attendanceId } : {}),
    },
  });
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The e-mail that goes with `notifyLeaveDecision`. */
export function leaveDecisionEmail(
  firstName: string,
  d: LeaveDecision,
): { subject: string; html: string; text: string } {
  const sentence = decisionSentence(d);
  const url = `${appBaseUrl()}${d.link}`;
  const reasonText = d.reason ? `\nReason: ${d.reason}` : '';
  return {
    subject: `Your leave request was ${d.status}`,
    html:
      `<p>Hi ${escapeHtml(firstName)},</p><p>${escapeHtml(sentence)}</p>` +
      (d.reason ? `<p>Reason: ${escapeHtml(d.reason)}</p>` : '') +
      `<p><a href="${escapeHtml(url)}">View your leave</a></p>`,
    text: `Hi ${firstName},\n\n${sentence}${reasonText}\n\nView your leave: ${url}`,
  };
}

export async function notifyExpenseRequest(
  approverId: string,
  employeeName: string,
  amount: number,
): Promise<void> {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);

  await createNotification({
    userId: approverId,
    type: 'expense_request',
    title: 'Expense Claim Submitted',
    message: `${employeeName} submitted an expense claim of ${formatted}.`,
    // Route is /expense-claims/requests — '/expenses/claims' 404s.
    link: '/expense-claims/requests',
    metadata: { employeeName, amount },
  });
}

export async function notifyTaskAssigned(
  assigneeId: string,
  taskTitle: string,
  projectName: string,
): Promise<void> {
  await createNotification({
    userId: assigneeId,
    type: 'task_assigned',
    title: 'Task Assigned',
    message: `You have been assigned "${taskTitle}" in project ${projectName}.`,
    link: '/projects/tasks',
    metadata: { taskTitle, projectName },
  });
}

export async function notifyAttendanceAnomaly(
  managerId: string,
  employeeName: string,
  anomaly: string,
): Promise<void> {
  await createNotification({
    userId: managerId,
    type: 'attendance_anomaly',
    title: 'Attendance Anomaly',
    message: `${employeeName}: ${anomaly}`,
    link: '/attendance',
    metadata: { employeeName, anomaly },
  });
}

export async function notifyPaymentDue(
  adminId: string,
  invoiceNumber: string,
  amount: number,
  dueDate: string,
): Promise<void> {
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);

  await createNotification({
    userId: adminId,
    type: 'payment_due',
    title: 'Payment Due',
    message: `Invoice ${invoiceNumber} of ${formatted} is due on ${dueDate}.`,
    link: '/billing/invoices',
    metadata: { invoiceNumber, amount, dueDate },
  });
}

export async function notifySystemAlert(
  adminIds: string[],
  title: string,
  message: string,
): Promise<void> {
  const promises = adminIds.map((adminId) =>
    createNotification({
      userId: adminId,
      type: 'system_alert',
      title,
      message,
    }),
  );
  await Promise.allSettled(promises);
}

export async function notifyApprovalRequest(
  approverId: string,
  entityType: string,
  requestedBy: string,
): Promise<void> {
  await createNotification({
    userId: approverId,
    type: 'approval_request',
    title: 'Approval Required',
    message: `${requestedBy} has submitted a ${entityType} for your approval.`,
    link: '/approvals',
    metadata: { entityType, requestedBy },
  });
}
export async function notifyNoticePublished(
  userIds: string[],
  noticeTitle: string,
  noticeId: string,
): Promise<void> {
  const promises = userIds.map((userId) =>
    createNotification({
      userId,
      type: 'system_alert', // Using system_alert type for notice board pop-ups
      title: 'New Notice Published',
      message: noticeTitle,
      link: `/notices/${noticeId}`,
      metadata: { noticeId, noticeTitle },
    }),
  );
  await Promise.allSettled(promises);
}
