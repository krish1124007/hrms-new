/**
 * Notification trigger service.
 *
 * Creates in-app notifications and provides convenience helpers
 * for common cross-module notification scenarios.
 */
import type { Types } from 'mongoose';
import { type NotificationType } from '../models/notification.model.js';
import { type IEmployee } from '../models/employee.model.js';
import { type SendMailInput } from './email.service.js';
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
/**
 * The user to tell about `emp`'s request: their reporting manager's login.
 * Null when there is no manager, the manager has no login, or the manager is
 * the employee themselves (nobody approves their own request). Never throws:
 * a failed lookup is logged and means "nobody to tell".
 */
export declare function reportingManagerUserId(emp: Pick<IEmployee, 'reportingManager'> & {
    userId?: Types.ObjectId | null;
}): Promise<string | null>;
export type DecisionModule = 'expense' | 'overtime' | 'leave' | 'regularization';
export interface DecisionNotice {
    module: DecisionModule;
    /** What was decided: `approved`, `rejected`, `reimbursed`. */
    status: string;
    title: string;
    /** The sentence under the title; the title alone when omitted. */
    message?: string;
    /** Where the employee sees the item: an app path. */
    link: string;
    metadata?: Record<string, unknown>;
}
/**
 * Tell a user how a request of theirs was decided. Whatever the module, the
 * notification's metadata carries `module` and `status` (plus `metadata`), so
 * a client can filter on them.
 */
export declare function notifyDecision(userId: string, notice: DecisionNotice): Promise<void>;
/** Fire-and-forget: `sendMail` already logs its own failures; this keeps a rejection from going unhandled. */
export declare function sendMailQuietly(input: SendMailInput): void;
/**
 * Tell an employee how a request of theirs was decided, in-app and by e-mail.
 * Nothing happens for an employee without a login (they could not open the
 * link). A courtesy, never a failure: errors are logged, not thrown.
 */
export declare function notifyEmployeeDecision(employeeId: Types.ObjectId | string, notice: DecisionNotice): Promise<void>;
/** "19 Oct 2026" — a day label or an instant, in the business timezone. */
export declare function formatBusinessDate(date: Date): string;
/** "19 Oct 2026", or "23 Oct 2026 – 27 Oct 2026" for a range (business timezone). */
export declare function formatLeaveDates(startDate: Date, endDate: Date): string;
export declare function notifyLeaveRequest(managerId: string, employeeName: string, leaveType: string, dates: string, metadata?: Record<string, unknown>): Promise<void>;
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
/** Tell an employee their leave request was approved or rejected (in-app). */
export declare function notifyLeaveDecision(userId: string, d: LeaveDecision): Promise<void>;
/** Tell a manager an employee asked for a day's attendance to be corrected. */
export declare function notifyRegularization(managerUserId: string, employeeName: string, dateLabel: string, metadata?: Record<string, unknown>): Promise<void>;
export interface RegularizationDecision {
    /** The day the request was about (a day label). */
    date: Date;
    status: 'approved' | 'rejected';
    attendanceId?: string;
}
/** Tell an employee their regularization request was approved or rejected. */
export declare function notifyRegularizationDecision(employeeUserId: string, d: RegularizationDecision): Promise<void>;
/** The e-mail that goes with `notifyLeaveDecision`. */
export declare function leaveDecisionEmail(firstName: string, d: LeaveDecision): {
    subject: string;
    html: string;
    text: string;
};
/** "₹1,200.00" */
export declare function formatInr(amount: number): string;
export declare function notifyExpenseRequest(approverId: string, employeeName: string, amount: number, metadata?: Record<string, unknown>): Promise<void>;
/** Tell a manager an employee asked for overtime to be approved. */
export declare function notifyOvertimeRequest(managerUserId: string, employeeName: string, hours: number, dateLabel: string, metadata?: Record<string, unknown>): Promise<void>;
/** Tell an employee their payslip for a locked payroll cycle can be opened. */
export declare function notifyPayslipReady(userId: string, period: {
    month: number;
    year: number;
}): Promise<void>;
export declare function notifyTaskAssigned(assigneeId: string, taskTitle: string, projectName: string): Promise<void>;
export declare function notifyAttendanceAnomaly(managerId: string, employeeName: string, anomaly: string): Promise<void>;
export declare function notifyPaymentDue(adminId: string, invoiceNumber: string, amount: number, dueDate: string): Promise<void>;
export declare function notifySystemAlert(adminIds: string[], title: string, message: string): Promise<void>;
export declare function notifyApprovalRequest(approverId: string, entityType: string, requestedBy: string): Promise<void>;
export declare function notifyNoticePublished(userIds: string[], noticeTitle: string, noticeId: string): Promise<void>;
//# sourceMappingURL=notification.service.d.ts.map