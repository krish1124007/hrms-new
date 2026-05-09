/**
 * Notification trigger service.
 *
 * Creates in-app notifications and provides convenience helpers
 * for common cross-module notification scenarios.
 */
import { Notification, type NotificationType } from '../models/notification.model.js';
import { logger } from '../config/logger.js';
import { getIO } from '../sockets/io-registry.js';

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

/* ─────────────── Trigger Helpers ─────────────── */

export async function notifyLeaveRequest(
  managerId: string,
  employeeName: string,
  leaveType: string,
  dates: string,
): Promise<void> {
  await createNotification({
    userId: managerId,
    type: 'leave_request',
    title: 'New Leave Request',
    message: `${employeeName} has requested ${leaveType} leave for ${dates}.`,
    link: '/leaves/requests',
    metadata: { employeeName, leaveType, dates },
  });
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
    link: '/expenses/claims',
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
