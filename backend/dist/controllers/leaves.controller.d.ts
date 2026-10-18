import type { Request, Response } from 'express';
import { z } from 'zod';
import type { IEmployee, ILeaveType } from '../models/index.js';
import { isUnpaidLeaveType } from '../services/leave-attendance.service.js';
export { isUnpaidLeaveType };
/**
 * The rules a leave type sets on who may take it and how. Checked on every
 * application, including one HR files on an employee's behalf — they are
 * about the employee, not the person filing.
 */
export declare function validateLeaveTypeRules(leaveType: Pick<ILeaveType, 'name' | 'isActive' | 'applicableGender' | 'probationAllowed' | 'halfDayAllowed' | 'attachmentRequired'>, employee: Pick<IEmployee, 'gender' | 'probationEndDate' | 'confirmationDate' | 'joiningDate'>, body: {
    isHalfDay?: boolean;
    attachments?: unknown[];
}, today?: Date): void;
export declare const createLeaveTypeSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    daysAllowed: z.ZodNumber;
    carryForward: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        maxDays: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        maxDays: number;
    }, {
        enabled?: boolean | undefined;
        maxDays?: number | undefined;
    }>>;
    encashable: z.ZodDefault<z.ZodBoolean>;
    paidLeave: z.ZodDefault<z.ZodBoolean>;
    applicableGender: z.ZodDefault<z.ZodEnum<["all", "male", "female"]>>;
    probationAllowed: z.ZodDefault<z.ZodBoolean>;
    halfDayAllowed: z.ZodDefault<z.ZodBoolean>;
    attachmentRequired: z.ZodDefault<z.ZodBoolean>;
    color: z.ZodDefault<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    isActive: boolean;
    daysAllowed: number;
    carryForward: {
        enabled: boolean;
        maxDays: number;
    };
    encashable: boolean;
    paidLeave: boolean;
    applicableGender: "all" | "male" | "female";
    probationAllowed: boolean;
    halfDayAllowed: boolean;
    attachmentRequired: boolean;
    color: string;
}, {
    code: string;
    name: string;
    daysAllowed: number;
    isActive?: boolean | undefined;
    carryForward?: {
        enabled?: boolean | undefined;
        maxDays?: number | undefined;
    } | undefined;
    encashable?: boolean | undefined;
    paidLeave?: boolean | undefined;
    applicableGender?: "all" | "male" | "female" | undefined;
    probationAllowed?: boolean | undefined;
    halfDayAllowed?: boolean | undefined;
    attachmentRequired?: boolean | undefined;
    color?: string | undefined;
}>;
export declare const updateLeaveTypeSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    daysAllowed: z.ZodOptional<z.ZodNumber>;
    carryForward: z.ZodOptional<z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        maxDays: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        maxDays: number;
    }, {
        enabled?: boolean | undefined;
        maxDays?: number | undefined;
    }>>>;
    encashable: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    paidLeave: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    applicableGender: z.ZodOptional<z.ZodDefault<z.ZodEnum<["all", "male", "female"]>>>;
    probationAllowed: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    halfDayAllowed: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    attachmentRequired: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    color: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    daysAllowed?: number | undefined;
    carryForward?: {
        enabled: boolean;
        maxDays: number;
    } | undefined;
    encashable?: boolean | undefined;
    paidLeave?: boolean | undefined;
    applicableGender?: "all" | "male" | "female" | undefined;
    probationAllowed?: boolean | undefined;
    halfDayAllowed?: boolean | undefined;
    attachmentRequired?: boolean | undefined;
    color?: string | undefined;
}, {
    code?: string | undefined;
    name?: string | undefined;
    isActive?: boolean | undefined;
    daysAllowed?: number | undefined;
    carryForward?: {
        enabled?: boolean | undefined;
        maxDays?: number | undefined;
    } | undefined;
    encashable?: boolean | undefined;
    paidLeave?: boolean | undefined;
    applicableGender?: "all" | "male" | "female" | undefined;
    probationAllowed?: boolean | undefined;
    halfDayAllowed?: boolean | undefined;
    attachmentRequired?: boolean | undefined;
    color?: string | undefined;
}>;
export declare const leaveTypeQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    isActive?: boolean | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    isActive?: boolean | undefined;
}>;
export declare function listLeaveTypes(req: Request, res: Response): Promise<void>;
export declare function createLeaveType(req: Request, res: Response): Promise<void>;
export declare function getLeaveType(req: Request, res: Response): Promise<void>;
export declare function updateLeaveType(req: Request, res: Response): Promise<void>;
export declare function deleteLeaveType(req: Request, res: Response): Promise<void>;
export declare const balanceQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    leaveTypeId: z.ZodOptional<z.ZodString>;
    year: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    year?: number | undefined;
    employeeId?: string | undefined;
    leaveTypeId?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    year?: number | undefined;
    employeeId?: string | undefined;
    leaveTypeId?: string | undefined;
}>;
export declare const allocateBalanceSchema: z.ZodObject<{
    employeeIds: z.ZodArray<z.ZodString, "many">;
    leaveTypeId: z.ZodString;
    year: z.ZodNumber;
    allocated: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    employeeIds: string[];
    year: number;
    leaveTypeId: string;
    allocated: number;
}, {
    employeeIds: string[];
    year: number;
    leaveTypeId: string;
    allocated: number;
}>;
export declare const adjustBalanceSchema: z.ZodObject<{
    delta: z.ZodNumber;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    delta: number;
    reason?: string | undefined;
}, {
    delta: number;
    reason?: string | undefined;
}>;
export declare function listLeaveBalances(req: Request, res: Response): Promise<void>;
export declare function myLeaveBalances(req: Request, res: Response): Promise<void>;
export declare function allocateLeaveBalances(req: Request, res: Response): Promise<void>;
export declare function adjustLeaveBalance(req: Request, res: Response): Promise<void>;
/**
 * `year` is bounded to 2000–2100 and no further ahead than next year (in the
 * business timezone), so a typo cannot allocate 2072. The upper bound is
 * judged per request, not when the module loads.
 */
export declare const openYearSchema: z.ZodEffects<z.ZodObject<{
    year: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
}, {
    year: number;
}>, {
    year: number;
}, {
    year: number;
}>;
/**
 * Open a leave year: create the balances still missing (pro-rated for
 * mid-year joiners) and carry the previous year's unused days forward.
 * Idempotent — nothing already set is overwritten — so HR can run it again
 * after adding an employee or leave type, or after a failed run.
 *
 * Audited whatever the outcome: a run that stops part way records the
 * progress it made (and how many employees failed), one that never started
 * records the error.
 */
export declare function openLeaveYearBalances(req: Request, res: Response): Promise<void>;
export declare const resetBalanceSchema: z.ZodObject<{
    year: z.ZodNumber;
    leaveTypeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    year: number;
    leaveTypeId?: string | undefined;
}, {
    year: number;
    leaveTypeId?: string | undefined;
}>;
export declare function resetLeaveBalances(req: Request, res: Response): Promise<void>;
export declare const createLeaveRequestSchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodString>;
    leaveTypeId: z.ZodString;
    startDate: z.ZodDate;
    endDate: z.ZodDate;
    isHalfDay: z.ZodDefault<z.ZodBoolean>;
    halfDayType: z.ZodOptional<z.ZodEnum<["first_half", "second_half"]>>;
    reason: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        fileUrl: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        fileUrl: string;
    }, {
        name: string;
        fileUrl: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    startDate: Date;
    endDate: Date;
    reason: string;
    leaveTypeId: string;
    attachments: {
        name: string;
        fileUrl: string;
    }[];
    isHalfDay: boolean;
    employeeId?: string | undefined;
    halfDayType?: "first_half" | "second_half" | undefined;
}, {
    startDate: Date;
    endDate: Date;
    reason: string;
    leaveTypeId: string;
    employeeId?: string | undefined;
    attachments?: {
        name: string;
        fileUrl: string;
    }[] | undefined;
    isHalfDay?: boolean | undefined;
    halfDayType?: "first_half" | "second_half" | undefined;
}>;
export declare const leaveRequestQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["pending", "approved", "rejected", "cancelled"]>>;
    employeeId: z.ZodOptional<z.ZodString>;
    leaveTypeId: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "pending" | "approved" | "rejected" | "cancelled" | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    leaveTypeId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}, {
    status?: "pending" | "approved" | "rejected" | "cancelled" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    leaveTypeId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}>;
export declare const rejectLeaveSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
/** Optional for the owner withdrawing their own request; HR must give one. */
export declare const cancelLeaveSchema: z.ZodDefault<z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>>;
export declare function listLeaveRequests(req: Request, res: Response): Promise<void>;
export declare function myLeaveRequests(req: Request, res: Response): Promise<void>;
export declare function teamLeaveRequests(req: Request, res: Response): Promise<void>;
export declare function leaveCalendar(req: Request, res: Response): Promise<void>;
export declare function applyLeave(req: Request, res: Response): Promise<void>;
export declare function getLeaveRequest(req: Request, res: Response): Promise<void>;
/**
 * Approve: charge the balance, then the request, then its attendance — each
 * step undone if a later one fails, since there is no transaction to roll
 * back.
 */
export declare function approveLeaveRequest(req: Request, res: Response): Promise<void>;
export declare function rejectLeaveRequest(req: Request, res: Response): Promise<void>;
/**
 * Cancel. The owner may withdraw a pending request at any time, and an
 * approved one only until the day it starts — taken leave is not refundable
 * on the employee's say-so. HR (`leaves.update`) may cancel anyone else's
 * request at any time, with a reason. Cancelling an approved request removes
 * its attendance rows and refunds its days.
 */
export declare function cancelLeaveRequest(req: Request, res: Response): Promise<void>;
export declare function deleteLeaveRequest(req: Request, res: Response): Promise<void>;
export declare function leaveReports(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=leaves.controller.d.ts.map