/**
 * Payroll maths: what one employee earns, owes and gets back for one cycle.
 *
 *   paid window   joining date (or the 1st) → exit date (or the month end);
 *                 a leaver is paid only in the month of their exit date
 *   day tally     loss of pay from the attendance rows in the window, plus
 *                 approved unpaid leave days that have no row yet
 *   days paid     window days − loss of pay
 *   earnings      the salary structure's components, or the employee's
 *                 basic / HRA / DA / allowance — each × days paid / days in
 *                 the month
 *   statutory     PF, ESI, PT (lib/statutory.ts) and the declared monthly TDS;
 *                 PF is on the structure components that are PF wages — each
 *                 by its own `statutoryBase` flag (basic / da yes, none no),
 *                 else by its name (Basic / DA) — else the salary basic + DA
 *   loans/claims  the EMIs due in the month and the approved claims not yet
 *                 reimbursed — except what another record holds (counted
 *                 and not settled yet; see "Items held by a payroll record")
 *
 * The figures computed for the overridable fields are kept in
 * `record.computed`, HR's overrides go on top (`applyManualAdjustments`),
 * and the instalments and claims counted are listed in `record.settlement`
 * for `settleCycle` to pay out once the cycle is paid.
 *
 * The full-month gross is basic + HRA + DA + special allowance from the
 * salary components (or the structure's earnings) — never the stored
 * `salary.grossSalary`, which the employee pre-save hook also adds every
 * `otherAllowances` entry into (old CSV imports parked PF, CTC, net pay … there;
 * scripts/fix-salary-stash.ts removes them).
 *
 * Days are business-day labels (UTC midnight of the IST calendar date), the
 * `Attendance.date` convention; other dates (joining, exit, leave, due dates)
 * count on the business day they fall on, whether stored at UTC or IST midnight.
 */
import { Types, type FilterQuery } from 'mongoose';
import { type EmployeeStatus, type IEmployee } from '../models/employee.model.js';
import { type IPayrollCycle } from '../models/payroll-cycle.model.js';
import { type IPayrollComputedFigures, type IPayrollLine, type IPayrollManualAdjustments, type IPayrollSettlement } from '../models/payroll-record.model.js';
import { type LeaveEmployee } from './leave-attendance.service.js';
/** Paid for the whole cycle — up to an exit date, when one is set. */
export declare const PAYROLL_STATUSES: readonly EmployeeStatus[];
/** People who have left: paid only in the month their exit date falls in. */
export declare const LEAVER_STATUSES: readonly EmployeeStatus[];
export interface PaidWindow {
    /** First and last paid day (day labels). */
    start: Date;
    end: Date;
    /** Days from `start` to `end`, both included. */
    calendarDays: number;
    /** Calendar days of the month: what every earning is pro-rated against. */
    monthDays: number;
}
/**
 * The days of the month the employee is on the payroll: from the later of the
 * joining date and the 1st to the earlier of the exit date and the last day.
 * `null` when there are none — joined after the month, left before it — and
 * for a leaver (`resigned`/`terminated`/`inactive`) whose exit date is not in
 * the month (none at all included).
 */
export declare function paidWindow(employee: {
    joiningDate?: Date | null;
    exitDate?: Date | null;
    status?: EmployeeStatus | null;
}, year: number, month: number): PaidWindow | null;
/**
 * The employees a cycle is processed for: active and on-notice staff, and
 * leavers whose exit date is in the month. (`paidWindow` then drops anyone
 * with no paid day — e.g. a joiner after the month.)
 */
export declare function payrollEmployeeFilter(year: number, month: number): FilterQuery<IEmployee>;
export interface DayTally {
    present: number;
    late: number;
    halfDay: number;
    paidLeave: number;
    unpaidLeave: number;
    absent: number;
    weeklyOff: number;
    /** Late check-ins: `late` rows plus `present` rows that were late. */
    lateLogins: number;
    /** Loss of pay, in days. */
    lopDays: number;
}
/**
 * Counts the window's days from the attendance rows, each row in exactly one
 * bucket:
 *   - `weekend` / `holiday` rows → weekly off (never loss of pay);
 *   - `half_day` → half day, half a day's loss of pay unless `isPaidLeave` —
 *     and a paid half day of leave on a day already over with no check-in
 *     costs the unworked half (0.5) too;
 *   - any row with `isPaidLeave: true` → paid leave, never loss of pay (a day
 *     of paid leave the employee also punched on counts once, as paid);
 *   - `absent` → a day's loss of pay: unpaid leave when it is a leave row
 *     (`isPaidLeave: false` / `leaveRequestId`), absent otherwise;
 *   - `on_leave` → paid leave (legacy rows carry no flag) — unless it says
 *     `isPaidLeave: false`, which is unpaid leave and loss of pay;
 *   - `present` / `late` → present / late.
 * Approved unpaid leave days inside the window with no row (not stamped yet)
 * add what their row would: a working day of unpaid leave, or half a day.
 */
export declare function dayTally(employeeId: Types.ObjectId, window: Pick<PaidWindow, 'start' | 'end'>, opts?: {
    employee?: LeaveEmployee;
}): Promise<DayTally>;
/** Loads the employee's salary structure with its components (see `earningsFor`). */
export declare const STRUCTURE_POPULATE: {
    path: string;
    populate: {
        path: string;
    };
};
type SalaryEmployee = Pick<IEmployee, 'salary' | 'salaryStructureId'>;
/**
 * Basic + HRA + DA + special allowance from the salary components: the
 * full-month gross without a structure, and what `percentage_of_gross`
 * structure components are a percentage of.
 */
export declare function salaryComponentsGross(employee: Pick<IEmployee, 'salary'>): number;
/**
 * The earning lines for `daysPaid` paid days of a `monthDays`-day month.
 * With a populated salary structure: one line per earning component (named
 * after it, carrying its `componentId`), pro-rated. Without: Basic, HRA, DA
 * (when there is one) and Other Allowance (`specialAllowance`), pro-rated.
 */
export declare function earningsFor(employee: SalaryEmployee, daysPaid: number, monthDays: number): IPayrollLine[];
/**
 * Overtime pay at the company rate:
 *   (Gross / 2) / monthDays / 8 / 60 × OT_minutes × 2
 * which simplifies to
 *   Gross × OT_minutes / (monthDays × 480)
 * on the FULL-month gross and the calendar days of the month — never the
 * paid window, so a joiner's or leaver's overtime hour is worth what anyone
 * else's is.
 *
 * Worked example (gross 30,000, a 30-day month, 120 OT min):
 *   30,000 × 120 / (30 × 480) = 250
 *
 * Returns 0 when there is nothing to pay or no month to divide by.
 */
export declare function computeOvertimePay(fullMonthGross: number, otMinutes: number, monthDays: number): number;
/** What an approved claim pays: the accepted amount, else the amount claimed. */
export declare function claimValue(claim: {
    amount?: number | null;
    acceptedAmount?: number | null;
}): number;
/** The claims and instalments held by records, as id strings. */
export interface HeldItems {
    claimIds: Set<string>;
    installmentIds: Set<string>;
}
type CycleName = Pick<IPayrollCycle, 'year' | 'month'>;
/**
 * Every item held by a record of a cycle other than `exceptCycleId` (of one
 * employee, when given). `processCycle` loads this once per run.
 */
export declare function heldItems(exceptCycleId?: Types.ObjectId, employeeId?: Types.ObjectId): Promise<HeldItems>;
/** The cycle whose record holds this claim, or `null`. */
export declare function cycleHoldingClaim(claimId: Types.ObjectId): Promise<CycleName | null>;
/** The cycle whose record holds this loan instalment, or `null`. */
export declare function cycleHoldingInstallment(installmentId: Types.ObjectId): Promise<CycleName | null>;
/**
 * Before an edit that makes the record pay what it counted — its
 * reimbursements or loan deduction back to the computed figure (override
 * cleared) or set to an amount — 409 `ITEM_HELD` when one of the counted
 * claims / instalments is held by another record, or was settled meanwhile:
 * paying this record would pay it a second time.
 */
export declare function assertCountedItemsPayable(record: {
    _id: unknown;
    reimbursements?: number;
    loanDeduction?: number;
    settlement?: Partial<IPayrollSettlement> | null;
}, fields: ReadonlyArray<'reimbursements' | 'loanDeduction'>): Promise<void>;
export interface PayrollComputeConfig {
    /** Late check-ins a month that cost nothing; each one beyond costs half a day. */
    freeLateDaysPerMonth: number;
    /**
     * The items other cycles' records hold (`heldItems(cycleId)`), loaded once
     * per run; without it `computeRecord` loads the employee's own.
     */
    held?: HeldItems;
}
/** What a run of `cycleId` reads once: the attendance settings and the held items. */
export declare function loadComputeConfig(cycleId?: Types.ObjectId): Promise<PayrollComputeConfig>;
export type ManualAdjustments = Partial<IPayrollManualAdjustments>;
/** A payroll record's figures, ready for `new PayrollRecord({ cycleId, employeeId, ...computed })`. */
export interface ComputedRecord extends IPayrollComputedFigures {
    earnings: IPayrollLine[];
    deductions: IPayrollLine[];
    employerContributions: IPayrollLine[];
    fullMonthGross: number;
    grossSalary: number;
    totalDeductions: number;
    netSalary: number;
    workingDays: number;
    daysPaid: number;
    presentDays: number;
    absentDays: number;
    lopDays: number;
    lopAmount: number;
    paidLeaveDays: number;
    weeklyOffDays: number;
    unpaidDays: number;
    lateLoginCount: number;
    paidLeaveBalance: number;
    overtimeHours: number;
    overtimeAmount: number;
    lateDeduction: number;
    computed: IPayrollComputedFigures;
    manualAdjustments: ManualAdjustments;
    settlement: IPayrollSettlement;
}
/**
 * Computes the employee's record for the cycle — `null` when they have no
 * paid day in it (see `paidWindow`). `opts.manual` are HR's overrides,
 * applied over the computed figures (`null` = not overridden), so
 * `tds = manual.tds ?? salary.tdsMonthly`, and likewise the loan deduction
 * and reimbursements.
 *
 * Saves the employee's ESI decision for the contribution period when it is a
 * new one (`saveEsiDecision`), as payroll always has.
 */
export declare function computeRecord(employee: IEmployee, cycle: Pick<IPayrollCycle, '_id' | 'year' | 'month'>, cfg: PayrollComputeConfig, opts?: {
    manual?: ManualAdjustments | null;
}): Promise<ComputedRecord | null>;
export {};
//# sourceMappingURL=payroll-compute.service.d.ts.map