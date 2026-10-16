/**
 * Notification trigger service.
 *
 * Creates in-app notifications and provides convenience helpers
 * for common cross-module notification scenarios.
 */
import { type NotificationType } from '../models/notification.model.js';
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
export declare function createNotification(params: CreateNotificationParams): Promise<void>;
export declare function notifyLeaveRequest(managerId: string, employeeName: string, leaveType: string, dates: string): Promise<void>;
export declare function notifyExpenseRequest(approverId: string, employeeName: string, amount: number): Promise<void>;
export declare function notifyTaskAssigned(assigneeId: string, taskTitle: string, projectName: string): Promise<void>;
export declare function notifyAttendanceAnomaly(managerId: string, employeeName: string, anomaly: string): Promise<void>;
export declare function notifyPaymentDue(adminId: string, invoiceNumber: string, amount: number, dueDate: string): Promise<void>;
export declare function notifySystemAlert(adminIds: string[], title: string, message: string): Promise<void>;
export declare function notifyApprovalRequest(approverId: string, entityType: string, requestedBy: string): Promise<void>;
export declare function notifyNoticePublished(userIds: string[], noticeTitle: string, noticeId: string): Promise<void>;
//# sourceMappingURL=notification.service.d.ts.map