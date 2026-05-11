import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Attendance } from '../models/attendance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { Holiday } from '../models/holiday.model.js';
import { logger } from '../config/logger.js';
/* ─────────────── Employee → User ─────────────── */
/**
 * Called when an employee is created.
 * Auto-creates a User account with the 'employee' system role and links it
 * back to the employee document via `employee.userId`.
 */
export async function onEmployeeCreated(employee) {
    try {
        // Check if a user already exists for this email in the tenant
        const existingUser = await User.findOne({ email: employee.email });
        if (existingUser) {
            // Link the existing user instead of creating a duplicate
            await Employee.updateOne({ _id: employee._id }, { $set: { userId: existingUser._id } });
            logger.info({ employeeId: employee._id, userId: existingUser._id }, 'Linked existing user to employee');
            return;
        }
        const employeeRole = await Role.findOne({ slug: 'employee' });
        if (!employeeRole) {
            logger.warn('Default employee role not found — skipping user creation');
            return;
        }
        // Generate a random temporary password (the user will reset it)
        const tempPassword = `Tmp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}!`;
        const user = await User.create({
            email: employee.email,
            password: tempPassword,
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employeeRole._id,
            status: 'invited',
            loginMethod: 'email',
        });
        await Employee.updateOne({ _id: employee._id }, { $set: { userId: user._id } });
        logger.info({ employeeId: employee._id, userId: user._id }, 'Auto-created user for new employee');
    }
    catch (err) {
        logger.error({ err, employeeId: employee._id }, 'onEmployeeCreated failed');
    }
}
/**
 * Called when an employee is deactivated (status set to inactive / terminated / resigned).
 * Deactivates the linked user and invalidates all refresh tokens.
 */
export async function onEmployeeDeactivated(employeeId) {
    try {
        const employee = await Employee.findOne({ _id: employeeId });
        if (!employee?.userId)
            return;
        await User.updateOne({ _id: employee.userId }, {
            $set: { status: 'inactive' },
            $unset: { refreshTokens: 1 },
        });
        logger.info({ employeeId, userId: employee.userId }, 'Deactivated user and cleared sessions for employee');
    }
    catch (err) {
        logger.error({ err, employeeId }, 'onEmployeeDeactivated failed');
    }
}
/**
 * Aggregates attendance records for a given employee and month.
 * Also factors in approved paid leaves to calculate Loss-of-Pay days.
 */
export async function getAttendanceSummaryForPayroll(employeeId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    await Employee.findById(employeeId).lean();
    const holidays = await Holiday.countDocuments({
        date: { $gte: startDate, $lte: endDate },
    });
    // Total calendar days minus weekends (Sundays) and holidays
    const totalCalendarDays = endDate.getDate();
    let sundays = 0;
    for (let d = 1; d <= totalCalendarDays; d++) {
        if (new Date(year, month - 1, d).getDay() === 0)
            sundays++;
    }
    const totalWorkingDays = totalCalendarDays - sundays - holidays;
    const records = await Attendance.find({
        employeeId,
        date: { $gte: startDate, $lte: endDate },
    }).lean();
    let presentDays = 0;
    let halfDays = 0;
    let overtimeHours = 0;
    for (const r of records) {
        if (r.status === 'present' || r.status === 'late') {
            presentDays++;
            overtimeHours += r.overtimeHours ?? 0;
        }
        else if (r.status === 'half_day') {
            halfDays++;
            overtimeHours += r.overtimeHours ?? 0;
        }
    }
    const effectivePresentDays = presentDays + halfDays * 0.5;
    // Approved paid leave days in this period
    const approvedLeaves = await LeaveRequest.find({
        employeeId,
        status: 'approved',
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
    })
        .populate('leaveTypeId', 'paidLeave')
        .lean();
    let paidLeaveDays = 0;
    for (const leave of approvedLeaves) {
        if (leave.leaveTypeId?.paidLeave) {
            paidLeaveDays += leave.days;
        }
    }
    const absentDays = Math.max(0, totalWorkingDays - effectivePresentDays - paidLeaveDays);
    const lopDays = absentDays; // Days absent without approved paid leave
    return {
        totalDays: totalWorkingDays,
        presentDays,
        absentDays: Math.round(absentDays),
        halfDays,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        lopDays: Math.round(lopDays),
    };
}
/**
 * Calculates unpaid leave deductions for an employee in a given month.
 * Deduction = (grossSalary / totalWorkingDays) * unpaidLeaveDays
 */
export async function getLeaveDeductionsForPayroll(employeeId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    // Find approved leaves in this period where leave type is unpaid
    const approvedLeaves = await LeaveRequest.find({
        employeeId,
        status: 'approved',
        startDate: { $lte: endDate },
        endDate: { $gte: startDate },
    })
        .populate('leaveTypeId', 'paidLeave')
        .lean();
    let unpaidLeaveDays = 0;
    for (const leave of approvedLeaves) {
        if (!leave.leaveTypeId?.paidLeave) {
            unpaidLeaveDays += leave.days;
        }
    }
    // Calculate per-day salary for deduction
    const employee = await Employee.findById(employeeId).lean();
    const grossSalary = employee?.salary?.grossSalary ?? 0;
    // Approximate working days in the month (calendar days minus Sundays)
    const totalCalendarDays = endDate.getDate();
    let sundays = 0;
    for (let d = 1; d <= totalCalendarDays; d++) {
        if (new Date(year, month - 1, d).getDay() === 0)
            sundays++;
    }
    const workingDays = totalCalendarDays - sundays;
    const dailyRate = workingDays > 0 ? grossSalary / workingDays : 0;
    const deductionAmount = Math.round(dailyRate * unpaidLeaveDays * 100) / 100;
    return {
        unpaidLeaveDays,
        deductionAmount,
    };
}
/**
 * Queries active loans for an employee and returns the current month's EMI amounts.
 *
 * Since no dedicated Loan model exists yet in this codebase, this function
 * returns a stub with zero values. When a Loan model is added, update the
 * import and query here.
 */
export async function getLoanEMIForPayroll(_employeeId, _month, _year) {
    // TODO: Replace with actual Loan model query once the module is implemented.
    // Example implementation:
    //
    // const loans = await Loan.find({
    //   employeeId, status: 'active'
    // }).lean();
    //
    // const result: LoanEMI = { totalEMI: 0, loans: [] };
    // for (const loan of loans) {
    //   result.loans.push({
    //     loanId: String(loan._id),
    //     emiAmount: loan.emiAmount,
    //     remaining: loan.remainingAmount,
    //   });
    //   result.totalEMI += loan.emiAmount;
    // }
    // return result;
    return { totalEMI: 0, loans: [] };
}
//# sourceMappingURL=integration.service.js.map