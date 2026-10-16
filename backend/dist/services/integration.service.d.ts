import { type IEmployee } from '../models/employee.model.js';
/**
 * Called when an employee is created.
 * Auto-creates a User account with the 'employee' system role and links it
 * back to the employee document via `employee.userId`.
 */
export declare function onEmployeeCreated(employee: IEmployee): Promise<void>;
/**
 * Called when an employee is deactivated (status set to inactive / terminated / resigned).
 * Deactivates the linked user and invalidates all refresh tokens.
 */
export declare function onEmployeeDeactivated(employeeId: string): Promise<void>;
export interface AttendanceSummary {
    totalDays: number;
    presentDays: number;
    absentDays: number;
    halfDays: number;
    overtimeHours: number;
    lopDays: number;
}
/**
 * Aggregates attendance records for a given employee and month.
 * Also factors in approved paid leaves to calculate Loss-of-Pay days.
 */
export declare function getAttendanceSummaryForPayroll(employeeId: string, month: number, year: number): Promise<AttendanceSummary>;
export interface LeaveDeductions {
    unpaidLeaveDays: number;
    deductionAmount: number;
}
/**
 * Calculates unpaid leave deductions for an employee in a given month.
 * Deduction = (grossSalary / totalWorkingDays) * unpaidLeaveDays
 */
export declare function getLeaveDeductionsForPayroll(employeeId: string, month: number, year: number): Promise<LeaveDeductions>;
export interface LoanEMI {
    totalEMI: number;
    loans: Array<{
        loanId: string;
        emiAmount: number;
        remaining: number;
    }>;
}
/**
 * Queries active loans for an employee and returns the current month's EMI amounts.
 *
 * Since no dedicated Loan model exists yet in this codebase, this function
 * returns a stub with zero values. When a Loan model is added, update the
 * import and query here.
 */
export declare function getLoanEMIForPayroll(_employeeId: string, _month: number, _year: number): Promise<LoanEMI>;
//# sourceMappingURL=integration.service.d.ts.map