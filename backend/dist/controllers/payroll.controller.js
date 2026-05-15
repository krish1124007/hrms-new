import { Types } from 'mongoose';
import { z } from 'zod';
import { SalaryComponent, SalaryStructure, PayrollCycle, PayrollRecord, Employee, Attendance, OvertimeRequest, } from '../models/index.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { generatePayslipPdf, } from '../services/payslip-pdf.service.js';
/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                       */
/* ──────────────────────────────────────────────────────────── */
const round2 = (n) => Math.round(n * 100) / 100;
/** Professional Tax — flat ₹200 per the seeded component. */
function professionalTax(grossMonthly) {
    if (grossMonthly <= 7500)
        return 0;
    if (grossMonthly <= 10_000)
        return 175;
    return 200;
}
/** Employee PF: 12% of min(basic, 15,000). NOT prorated by attendance — matches the reference payslip
 *  where Khyati's prorated basic was ₹19,434 yet PF still showed flat ₹1,800. */
function pfEmployee(fullMonthBasic) {
    return round2(Math.min(fullMonthBasic, 15_000) * 0.12);
}
/** Employer PF: 12% of min(basic, 15,000) — matches the salary master sheet
 *  ("Employer PF" column = 1,800 at the cap). Caps at ₹1,800.
 *
 *  Note: regulators allow up to 13% (12% EPS+EPF + 0.5% EDLI + 0.5% admin).
 *  The Group's policy is 12% only — change here if EDLI/admin need to be
 *  bundled in future. */
function pfEmployer(fullMonthBasic) {
    return round2(Math.min(fullMonthBasic, 15_000) * 0.12);
}
/** ESIC eligibility threshold is gross ≤ ₹21,000/month (inclusive). Above
 *  that, neither side contributes. */
function esicEmployee(gross) {
    if (gross > 21_000)
        return 0;
    return round2(gross * 0.0075);
}
function esicEmployer(gross) {
    if (gross > 21_000)
        return 0;
    return round2(gross * 0.0325);
}
function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}
/**
 * Overtime pay using the company formula:
 *   (Gross / 2) / actualWorkingDays / 8 / 60 × OT_minutes × 2
 * Simplifies to:
 *   Gross × OT_minutes / (actualWorkingDays × 480)
 *
 * Worked example (gross 50,000, 26 days, 50 OT min):
 *   50,000 × 50 / (26 × 480) = 200.32  ✓
 *
 * Returns 0 if any divisor is zero (no presence ⇒ no OT pay).
 */
function computeOvertimePay(fullMonthGross, otMinutes, actualWorkingDays) {
    if (fullMonthGross <= 0 ||
        otMinutes <= 0 ||
        actualWorkingDays <= 0) {
        return 0;
    }
    return round2((fullMonthGross * otMinutes) / (actualWorkingDays * 480));
}
/* ──────────────────────────────────────────────────────────── */
/* Salary Components                                             */
/* ──────────────────────────────────────────────────────────── */
export const componentSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    type: z.enum(['earning', 'deduction', 'employer_contribution']),
    calculationType: z
        .enum(['fixed', 'percentage_of_basic', 'percentage_of_gross'])
        .default('fixed'),
    defaultValue: z.coerce.number().default(0),
    isTaxable: z.boolean().default(false),
    isStatutory: z.boolean().default(false),
    statutoryType: z
        .enum([
        'pf_employee',
        'pf_employer',
        'esic_employee',
        'esic_employer',
        'professional_tax',
        'tds',
    ])
        .optional(),
    order: z.coerce.number().default(0),
    isActive: z.boolean().default(true),
});
export const updateComponentSchema = componentSchema.partial();
export const componentQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    type: z.enum(['earning', 'deduction', 'employer_contribution']).optional(),
});
export async function listComponents(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.type)
        filter.type = q.type;
    const result = await SalaryComponent.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: 'order name',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createComponent(req, res) {
    const body = req.body;
    const c = await SalaryComponent.create(body);
    void audit({ action: 'create', entity: 'SalaryComponent', entityId: String(c._id) });
    res.status(201).json({ success: true, data: c });
}
export async function getComponent(req, res) {
    const c = await SalaryComponent.findById(String(req.params.id)).exec();
    if (!c)
        throw new NotFoundError('Component not found');
    res.json({ success: true, data: c });
}
export async function updateComponent(req, res) {
    const body = req.body;
    const c = await SalaryComponent.findByIdAndUpdate(String(req.params.id), body, {
        new: true,
    }).exec();
    if (!c)
        throw new NotFoundError('Component not found');
    void audit({ action: 'update', entity: 'SalaryComponent', entityId: String(c._id) });
    res.json({ success: true, data: c });
}
export async function deleteComponent(req, res) {
    const c = await SalaryComponent.findById(String(req.params.id)).exec();
    if (!c)
        throw new NotFoundError('Component not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await c.softDelete();
    void audit({ action: 'delete', entity: 'SalaryComponent', entityId: String(c._id) });
    res.json({ success: true, message: 'Component deleted' });
}
/* ──────────────────────────────────────────────────────────── */
/* Salary Structures                                             */
/* ──────────────────────────────────────────────────────────── */
export const structureSchema = z.object({
    name: z.string().min(1),
    components: z
        .array(z.object({
        componentId: z.string(),
        calculationType: z.enum(['fixed', 'percentage_of_basic', 'percentage_of_gross']),
        value: z.coerce.number(),
    }))
        .default([]),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
});
export const updateStructureSchema = structureSchema.partial();
export async function listStructures(_req, res) {
    const list = await SalaryStructure.find()
        .populate('components.componentId', 'name code type calculationType')
        .sort('name')
        .lean()
        .exec();
    res.json({ success: true, data: list });
}
export async function createStructure(req, res) {
    const body = req.body;
    if (body.isDefault) {
        await SalaryStructure.updateMany({ isDefault: true }, { isDefault: false });
    }
    const s = await SalaryStructure.create({
        ...body,
        components: body.components.map((c) => ({
            ...c,
            componentId: new Types.ObjectId(c.componentId),
        })),
    });
    void audit({ action: 'create', entity: 'SalaryStructure', entityId: String(s._id) });
    res.status(201).json({ success: true, data: s });
}
export async function getStructure(req, res) {
    const s = await SalaryStructure.findById(String(req.params.id))
        .populate('components.componentId')
        .exec();
    if (!s)
        throw new NotFoundError('Structure not found');
    res.json({ success: true, data: s });
}
export async function updateStructure(req, res) {
    const body = req.body;
    if (body.isDefault) {
        await SalaryStructure.updateMany({ _id: { $ne: new Types.ObjectId(String(req.params.id)) }, isDefault: true }, { isDefault: false });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = { ...body };
    if (body.components) {
        update.components = body.components.map((c) => ({
            ...c,
            componentId: new Types.ObjectId(c.componentId),
        }));
    }
    const s = await SalaryStructure.findByIdAndUpdate(String(req.params.id), update, {
        new: true,
    }).exec();
    if (!s)
        throw new NotFoundError('Structure not found');
    void audit({ action: 'update', entity: 'SalaryStructure', entityId: String(s._id) });
    res.json({ success: true, data: s });
}
export async function deleteStructure(req, res) {
    const s = await SalaryStructure.findById(String(req.params.id)).exec();
    if (!s)
        throw new NotFoundError('Structure not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await s.softDelete();
    void audit({ action: 'delete', entity: 'SalaryStructure', entityId: String(s._id) });
    res.json({ success: true, message: 'Structure deleted' });
}
export const assignStructureSchema = z.object({
    employeeIds: z.array(z.string()).min(1),
});
export async function assignStructure(req, res) {
    // For now we just record an audit; actual structure-employee join could be added
    // as a future enhancement. Each employee already carries its own salary breakdown.
    const { employeeIds } = req.body;
    void audit({
        action: 'update',
        entity: 'SalaryStructure',
        entityId: String(req.params.id),
        after: { assignedTo: employeeIds },
    });
    res.json({ success: true, data: { assigned: employeeIds.length } });
}
/* ──────────────────────────────────────────────────────────── */
/* Payroll Cycles                                                */
/* ──────────────────────────────────────────────────────────── */
export const createCycleSchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000),
});
export const cycleQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(24),
    year: z.coerce.number().int().optional(),
    status: z.enum(['draft', 'processing', 'processed', 'paid', 'locked']).optional(),
});
export async function listCycles(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.year)
        filter.year = q.year;
    if (q.status)
        filter.status = q.status;
    const result = await PayrollCycle.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: '-year -month',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createCycle(req, res) {
    const body = req.body;
    const exists = await PayrollCycle.findOne({ month: body.month, year: body.year }).exec();
    if (exists)
        throw new ConflictError('Payroll cycle for this month already exists');
    const cycle = await PayrollCycle.create({ ...body, status: 'draft' });
    void audit({ action: 'create', entity: 'PayrollCycle', entityId: String(cycle._id) });
    res.status(201).json({ success: true, data: cycle });
}
export async function getCycle(req, res) {
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    res.json({ success: true, data: cycle });
}
async function computeForEmployee(employee, cycle) {
    const monthDays = daysInMonth(cycle.year, cycle.month);
    const periodStart = new Date(cycle.year, cycle.month - 1, 1);
    const periodEnd = new Date(cycle.year, cycle.month, 0, 23, 59, 59);
    // Pull every attendance row in the period and count by status.
    const records = await Attendance.find({
        employeeId: employee._id,
        date: { $gte: periodStart, $lte: periodEnd },
    })
        .lean()
        .exec();
    // Match the reference payslip: "Days Present" column counts strict 'present'
    // rows. Late check-ins are reported separately under "Late Login".
    const presentDays = records.filter((r) => r.status === 'present').length;
    const lateDays = records.filter((r) => r.status === 'late').length;
    const halfDays = records.filter((r) => r.status === 'half_day').length;
    const paidLeaveDays = records.filter((r) => r.status === 'on_leave').length;
    const weeklyOffDays = records.filter((r) => r.status === 'weekend' || r.status === 'holiday').length;
    const unpaidDays = records.filter((r) => r.status === 'absent').length;
    // Late logins = late-status rows + any present rows that were flagged late.
    // Also count `lateDays` separately so we can include them in earned days.
    const lateLoginCount = lateDays + records.filter((r) => r.status === 'present' && (r.lateBy ?? 0) > 0).length;
    // Days Paid = total month days − unpaid (matches the reference payslip:
    //   Khyati: 31 − 2 = 29).
    // Half-days subtract 0.5 from days paid since they cost half a day's wage.
    const daysPaid = round2(monthDays - unpaidDays - halfDays * 0.5);
    const lopDaysFinal = round2(unpaidDays + halfDays * 0.5);
    // Full-month figures from employee's stored salary. We treat
    // `specialAllowance` as the "Other Allowance" line in the payslip (the CSV
    // import populated this field with the "Other All." column).
    const basic = Number(employee.salary?.basic ?? 0);
    const hra = Number(employee.salary?.hra ?? 0);
    const da = Number(employee.salary?.da ?? 0);
    const otherAllowance = Number(employee.salary?.specialAllowance ?? 0);
    const fullMonthGross = round2(basic + hra + da + otherAllowance);
    // Pro-rate basic + allowances by daysPaid / monthDays.
    const proRate = (val) => monthDays > 0 ? round2((val * daysPaid) / monthDays) : 0;
    const earnings = [
        { name: 'Basic', amount: proRate(basic) },
        { name: 'HRA', amount: proRate(hra) },
    ];
    if (da > 0)
        earnings.push({ name: 'DA', amount: proRate(da) });
    earnings.push({ name: 'Other Allowance', amount: proRate(otherAllowance) });
    // Auto-compute overtime from APPROVED OvertimeRequest rows for the period.
    // Raw attendance.overtimeHours is the sensor reading (when did they punch
    // out late) but only formally approved requests get paid.
    const otApproved = await OvertimeRequest.find({
        employee: employee._id,
        status: 'approved',
        date: { $gte: periodStart, $lte: periodEnd },
    })
        .lean()
        .exec();
    const overtimeHours = round2(otApproved.reduce((s, r) => s + (r.hours ?? 0), 0));
    const otMinutes = overtimeHours * 60;
    // Divide the rate by `daysPaid` (paid working days in the cycle), not
    // `presentDays` — `presentDays` is 0 when attendance hasn't been entered
    // yet, which would zero out OT pay even for valid approved requests.
    // `daysPaid` defaults to the full month minus LOP, matching how every
    // other earning is pro-rated.
    const overtimeAmount = computeOvertimePay(fullMonthGross, otMinutes, daysPaid);
    // Expense is manual — HR enters via record edit, defaults to 0.
    const expense = 0;
    if (overtimeAmount > 0)
        earnings.push({ name: 'Over Time', amount: overtimeAmount });
    if (expense > 0)
        earnings.push({ name: 'Expense', amount: expense });
    const grossEarnings = round2(earnings.reduce((s, l) => s + l.amount, 0));
    const lopAmount = round2((fullMonthGross / monthDays) * lopDaysFinal);
    // Statutory deductions
    // PF Employee = 12% × min(full-month basic, 15,000) — flat, not prorated.
    // This matches the reference: Khyati's prorated basic was ₹19,434 but PF
    // showed ₹1,800 (the cap). Same rule for PF Employer at 13%.
    const pfEmp = pfEmployee(basic);
    const esicEmp = esicEmployee(grossEarnings);
    const pt = professionalTax(grossEarnings);
    const deductions = [];
    if (pt > 0)
        deductions.push({ name: 'P.Tax', amount: pt });
    deductions.push({ name: 'PF Employee', amount: pfEmp });
    deductions.push({ name: 'ESI Employee', amount: esicEmp });
    // Manual deductions — defaulted to 0; HR can edit on the record.
    const advance = 0;
    // Auto late deduction: every late check-in beyond the monthly free quota
    // (default 3) costs half a day's gross. HR can override via record edit.
    const cfg = await AttendanceConfig.findOne({}).lean().exec();
    const freeLateDays = cfg?.settings?.freeLateDaysPerMonth ?? 3;
    const penalisableLate = Math.max(0, lateLoginCount - freeLateDays);
    const lateDeduction = monthDays > 0 ? round2((fullMonthGross / monthDays) * 0.5 * penalisableLate) : 0;
    if (advance > 0)
        deductions.push({ name: 'Advance', amount: advance });
    if (lateDeduction > 0)
        deductions.push({ name: 'Late Deduction', amount: lateDeduction });
    // Employer contributions
    const pfErp = pfEmployer(basic);
    const esicErp = esicEmployer(grossEarnings);
    const employerContributions = [];
    employerContributions.push({ name: 'PF Employer', amount: pfErp });
    employerContributions.push({ name: 'ESI Employer', amount: esicErp });
    const totalDeductions = round2(deductions.reduce((s, l) => s + l.amount, 0));
    const netSalary = round2(grossEarnings - totalDeductions);
    return {
        earnings,
        deductions,
        employerContributions,
        fullMonthGross,
        grossSalary: grossEarnings,
        totalDeductions,
        netSalary,
        workingDays: monthDays,
        daysPaid,
        presentDays,
        absentDays: unpaidDays,
        lopDays: lopDaysFinal,
        lopAmount,
        paidLeaveDays,
        weeklyOffDays,
        unpaidDays,
        lateLoginCount,
        paidLeaveBalance: 0, // wire to leave-balance module later
        overtimeHours,
        overtimeAmount,
        expense,
        advance,
        lateDeduction,
    };
}
export async function processCycle(req, res) {
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    if (cycle.status === 'locked')
        throw new ValidationAppError('Cycle is locked');
    cycle.status = 'processing';
    await cycle.save();
    // Wipe any existing draft records for this cycle
    await PayrollRecord.deleteMany({ cycleId: cycle._id });
    const employees = await Employee.find({ status: 'active' }).exec();
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    for (const emp of employees) {
        const computed = await computeForEmployee(emp, cycle);
        await PayrollRecord.create({
            cycleId: cycle._id,
            employeeId: emp._id,
            ...computed,
            bankDetails: {
                bankName: emp.bankDetails?.bankName,
                accountNumber: emp.bankDetails?.accountNumber,
                ifscCode: emp.bankDetails?.ifscCode,
            },
            paymentStatus: 'pending',
        });
        totalGross += computed.grossSalary;
        totalDeductions += computed.totalDeductions;
        totalNet += computed.netSalary;
    }
    cycle.status = 'processed';
    cycle.processedAt = new Date();
    const userId = getUserId();
    if (userId)
        cycle.processedBy = new Types.ObjectId(userId);
    cycle.totalGross = round2(totalGross);
    cycle.totalDeductions = round2(totalDeductions);
    cycle.totalNet = round2(totalNet);
    cycle.employeeCount = employees.length;
    await cycle.save();
    void audit({ action: 'update', entity: 'PayrollCycle', entityId: String(cycle._id), after: { status: 'processed' } });
    res.json({ success: true, data: cycle });
}
/* ──────────────────────────────────────────────────────────── */
/* Records                                                        */
/* ──────────────────────────────────────────────────────────── */
export async function listCycleRecords(req, res) {
    const records = await PayrollRecord.find({
        cycleId: new Types.ObjectId(String(req.params.id)),
    })
        .populate('employeeId', 'firstName lastName employeeId email')
        .sort('employeeId')
        .lean()
        .exec();
    res.json({ success: true, data: records });
}
export const updateRecordSchema = z.object({
    earnings: z
        .array(z.object({ name: z.string(), amount: z.coerce.number() }))
        .optional(),
    deductions: z
        .array(z.object({ name: z.string(), amount: z.coerce.number() }))
        .optional(),
    arrears: z.coerce.number().optional(),
    reimbursements: z.coerce.number().optional(),
    loanDeduction: z.coerce.number().optional(),
    overtimeAmount: z.coerce.number().optional(),
    overtimeHours: z.coerce.number().optional(),
    expense: z.coerce.number().optional(),
    advance: z.coerce.number().optional(),
    lateDeduction: z.coerce.number().optional(),
    paidLeaveBalance: z.coerce.number().optional(),
});
export async function updateRecord(req, res) {
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    if (cycle.status === 'locked' || cycle.status === 'paid') {
        throw new ValidationAppError('Cycle is locked — records cannot be edited');
    }
    const record = await PayrollRecord.findById(String(req.params.recordId)).exec();
    if (!record)
        throw new NotFoundError('Record not found');
    const body = req.body;
    if (body.earnings)
        record.earnings = body.earnings;
    if (body.deductions)
        record.deductions = body.deductions;
    if (body.arrears !== undefined)
        record.arrears = body.arrears;
    if (body.reimbursements !== undefined)
        record.reimbursements = body.reimbursements;
    if (body.loanDeduction !== undefined)
        record.loanDeduction = body.loanDeduction;
    if (body.overtimeAmount !== undefined)
        record.overtimeAmount = body.overtimeAmount;
    if (body.overtimeHours !== undefined)
        record.overtimeHours = body.overtimeHours;
    if (body.expense !== undefined)
        record.expense = body.expense;
    if (body.advance !== undefined)
        record.advance = body.advance;
    if (body.lateDeduction !== undefined)
        record.lateDeduction = body.lateDeduction;
    if (body.paidLeaveBalance !== undefined)
        record.paidLeaveBalance = body.paidLeaveBalance;
    // Reflect overtime / expense / advance / late-deduction into the line arrays
    // so the PDF renderer sees them. Strip then re-add to keep ordering tidy.
    record.earnings = record.earnings.filter((l) => l.name !== 'Over Time' && l.name !== 'Expense');
    if (record.overtimeAmount > 0)
        record.earnings.push({ name: 'Over Time', amount: round2(record.overtimeAmount) });
    if (record.expense > 0)
        record.earnings.push({ name: 'Expense', amount: round2(record.expense) });
    record.deductions = record.deductions.filter((l) => l.name !== 'Advance' && l.name !== 'Late Deduction');
    if (record.advance > 0)
        record.deductions.push({ name: 'Advance', amount: round2(record.advance) });
    if (record.lateDeduction > 0)
        record.deductions.push({ name: 'Late Deduction', amount: round2(record.lateDeduction) });
    // Recompute totals from line arrays — keeps a single source of truth.
    const grossEarnings = record.earnings.reduce((s, l) => s + (l.amount || 0), 0) +
        (record.arrears || 0) +
        (record.reimbursements || 0);
    const totalDed = record.deductions.reduce((s, l) => s + (l.amount || 0), 0) + (record.loanDeduction || 0);
    record.grossSalary = round2(grossEarnings);
    record.totalDeductions = round2(totalDed);
    record.netSalary = round2(grossEarnings - totalDed);
    await record.save();
    void audit({ action: 'update', entity: 'PayrollRecord', entityId: String(record._id) });
    res.json({ success: true, data: record });
}
/* ──────────────────────────────────────────────────────────── */
/* Generate payslips for cycle                                   */
/* ──────────────────────────────────────────────────────────── */
async function ytdForEmployee(employeeId, year, uptoMonth) {
    const cycles = await PayrollCycle.find({ year, month: { $lte: uptoMonth } })
        .select('_id')
        .lean()
        .exec();
    const cycleIds = cycles.map((c) => c._id);
    const records = await PayrollRecord.find({
        employeeId,
        cycleId: { $in: cycleIds },
    })
        .lean()
        .exec();
    return {
        earnings: round2(records.reduce((s, r) => s + (r.grossSalary || 0), 0)),
        deductions: round2(records.reduce((s, r) => s + (r.totalDeductions || 0), 0)),
        net: round2(records.reduce((s, r) => s + (r.netSalary || 0), 0)),
    };
}
export async function generatePayslips(req, res) {
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    if (cycle.status === 'draft') {
        throw new ValidationAppError('Cycle must be processed first');
    }
    const company = {
        name: process.env.COMPANY_NAME || 'Company',
        email: process.env.COMPANY_EMAIL,
    };
    const records = await PayrollRecord.find({ cycleId: cycle._id }).exec();
    let generated = 0;
    for (const record of records) {
        const employee = await Employee.findById(record.employeeId)
            .populate('department', 'name code')
            .populate('designation', 'name level')
            .exec();
        if (!employee)
            continue;
        try {
            const ytd = await ytdForEmployee(employee._id, cycle.year, cycle.month);
            const url = await generatePayslipPdf(record, cycle, employee, company, ytd);
            record.payslipUrl = url;
            await record.save();
            generated += 1;
        }
        catch (err) {
            // Continue on individual failure — don't break the batch
            // eslint-disable-next-line no-console
            console.error('Payslip generation failed for', String(record._id), err);
        }
    }
    cycle.payslipGeneratedAt = new Date();
    await cycle.save();
    res.json({ success: true, data: { generated, total: records.length } });
}
/* ──────────────────────────────────────────────────────────── */
/* Lock / Mark paid                                              */
/* ──────────────────────────────────────────────────────────── */
export async function lockCycle(req, res) {
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    cycle.status = 'locked';
    await cycle.save();
    void audit({ action: 'update', entity: 'PayrollCycle', entityId: String(cycle._id), after: { status: 'locked' } });
    res.json({ success: true, data: cycle });
}
export const markPaidSchema = z.object({
    paymentRef: z.string().min(1),
    paidAt: z.coerce.date().optional(),
});
export async function markCyclePaid(req, res) {
    const body = req.body;
    const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
    if (!cycle)
        throw new NotFoundError('Cycle not found');
    cycle.status = 'paid';
    cycle.paidAt = body.paidAt ?? new Date();
    cycle.paymentRef = body.paymentRef;
    await cycle.save();
    await PayrollRecord.updateMany({ cycleId: cycle._id }, {
        paymentStatus: 'paid',
        paidAt: cycle.paidAt,
        paymentRef: body.paymentRef,
    });
    void audit({ action: 'update', entity: 'PayrollCycle', entityId: String(cycle._id), after: { status: 'paid' } });
    res.json({ success: true, data: cycle });
}
/* ──────────────────────────────────────────────────────────── */
/* Individual record / payslip                                   */
/* ──────────────────────────────────────────────────────────── */
export async function getRecord(req, res) {
    const record = await PayrollRecord.findById(String(req.params.id))
        .populate('employeeId', 'firstName lastName employeeId email')
        .populate('cycleId', 'month year status')
        .exec();
    if (!record)
        throw new NotFoundError('Record not found');
    // Ownership guard — non-privileged users may only view their own record.
    if (req.user && !isPayrollPrivileged(req.user)) {
        const employee = await Employee.findOne({ userId: req.user._id })
            .select('_id')
            .lean()
            .exec();
        if (!employee || String(record.employeeId) !== String(employee._id)) {
            throw new ForbiddenError('You can only view your own payroll record');
        }
    }
    res.json({ success: true, data: record });
}
const PRIVILEGED_PAYROLL_ROLES = new Set(['admin', 'hr_manager']);
function isPayrollPrivileged(user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slug = user?.role?.slug;
    return !!slug && PRIVILEGED_PAYROLL_ROLES.has(slug);
}
export async function downloadPayslip(req, res) {
    const record = await PayrollRecord.findById(String(req.params.id)).exec();
    if (!record)
        throw new NotFoundError('Record not found');
    // Ownership guard — non-privileged users may only download their own payslip.
    if (req.user && !isPayrollPrivileged(req.user)) {
        const employee = await Employee.findOne({ userId: req.user._id })
            .select('_id')
            .lean()
            .exec();
        if (!employee || String(record.employeeId) !== String(employee._id)) {
            throw new ForbiddenError('You can only download your own payslip');
        }
    }
    // Generate on demand if not already cached on the record.
    if (!record.payslipUrl) {
        const cycle = await PayrollCycle.findById(record.cycleId).exec();
        if (!cycle)
            throw new NotFoundError('Cycle not found');
        const employee = await Employee.findById(record.employeeId)
            .populate('department', 'name code')
            .populate('designation', 'name level')
            .exec();
        if (!employee)
            throw new NotFoundError('Employee not found');
        const company = {
            name: process.env.COMPANY_NAME || 'Company',
            email: process.env.COMPANY_EMAIL,
        };
        const ytd = await ytdForEmployee(employee._id, cycle.year, cycle.month);
        const url = await generatePayslipPdf(record, cycle, employee, company, ytd);
        record.payslipUrl = url;
        await record.save();
    }
    res.json({ success: true, data: { url: record.payslipUrl } });
}
/* ──────────────────────────────────────────────────────────── */
/* Reports                                                        */
/* ──────────────────────────────────────────────────────────── */
export const monthlyReportQuery = z.object({
    year: z.coerce.number().int(),
    month: z.coerce.number().int().min(1).max(12),
});
export async function monthlyReport(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const cycle = await PayrollCycle.findOne({ month: q.month, year: q.year }).exec();
    if (!cycle) {
        res.json({ success: true, data: null });
        return;
    }
    const records = await PayrollRecord.find({ cycleId: cycle._id })
        .populate('employeeId', 'firstName lastName employeeId')
        .lean()
        .exec();
    res.json({ success: true, data: { cycle, records } });
}
export const yearlyReportQuery = z.object({
    year: z.coerce.number().int(),
});
export async function yearlyReport(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const cycles = await PayrollCycle.find({ year: q.year }).sort('month').lean().exec();
    res.json({
        success: true,
        data: {
            year: q.year,
            cycles,
            totals: {
                gross: round2(cycles.reduce((s, c) => s + (c.totalGross || 0), 0)),
                deductions: round2(cycles.reduce((s, c) => s + (c.totalDeductions || 0), 0)),
                net: round2(cycles.reduce((s, c) => s + (c.totalNet || 0), 0)),
            },
        },
    });
}
export async function statutoryReport(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const filter = {};
    if (q.year)
        filter.year = Number(q.year);
    if (q.month)
        filter.month = Number(q.month);
    const cycles = await PayrollCycle.find(filter).select('_id month year').lean().exec();
    const cycleIds = cycles.map((c) => c._id);
    const records = await PayrollRecord.find({ cycleId: { $in: cycleIds } })
        .populate('employeeId', 'firstName lastName employeeId')
        .lean()
        .exec();
    const byType = {
        pfEmployee: 0,
        pfEmployer: 0,
        esicEmployee: 0,
        esicEmployer: 0,
        professionalTax: 0,
    };
    for (const r of records) {
        for (const d of r.deductions ?? []) {
            if (d.name.includes('PF'))
                byType.pfEmployee += d.amount;
            if (d.name.includes('ESIC'))
                byType.esicEmployee += d.amount;
            if (d.name.includes('Professional'))
                byType.professionalTax += d.amount;
        }
        for (const e of r.employerContributions ?? []) {
            if (e.name.includes('PF'))
                byType.pfEmployer += e.amount;
            if (e.name.includes('ESIC'))
                byType.esicEmployer += e.amount;
        }
    }
    res.json({
        success: true,
        data: {
            filter,
            totals: {
                pfEmployee: round2(byType.pfEmployee),
                pfEmployer: round2(byType.pfEmployer),
                esicEmployee: round2(byType.esicEmployee),
                esicEmployer: round2(byType.esicEmployer),
                professionalTax: round2(byType.professionalTax),
            },
            records,
        },
    });
}
/* ──────────────────────────────────────────────────────────── */
/* Employee self-service                                         */
/* ──────────────────────────────────────────────────────────── */
export async function myPayslips(_req, res) {
    const userId = getUserId();
    if (!userId) {
        res.json({ success: true, data: [] });
        return;
    }
    const employee = await Employee.findOne({ userId: new Types.ObjectId(userId) }).exec();
    if (!employee) {
        res.json({ success: true, data: [] });
        return;
    }
    const records = await PayrollRecord.find({ employeeId: employee._id })
        .populate('cycleId', 'month year status')
        .sort('-createdAt')
        .lean()
        .exec();
    res.json({ success: true, data: records });
}
//# sourceMappingURL=payroll.controller.js.map