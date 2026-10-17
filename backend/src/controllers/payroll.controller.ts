import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  SalaryComponent,
  SalaryStructure,
  PayrollCycle,
  PayrollRecord,
  Employee,
  Attendance,
  OvertimeRequest,
  type IPayrollLine,
  type IPayrollRecord,
} from '../models/index.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import type { IPayrollManualAdjustments, PayrollStatutoryType } from '../models/payroll-record.model.js';
import type { PayrollCycleStatus } from '../models/payroll-cycle.model.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { hasPermission, isOwnRecord } from '../lib/access.js';
import {
  ADJUSTABLE_FIELDS,
  EMPLOYEE_VISIBLE_STATUSES,
  applyManualAdjustments,
  assertTransition,
  claimTransition,
  cycleNotEditable,
  hasManualAdjustments,
  isTransitionAllowed,
  recomputeCycleTotals,
  setManualAdjustment,
  touchProcessing,
} from '../lib/payroll-cycle.js';
import { settleCycle } from '../services/payroll-settlement.service.js';
import { saveEsiDecision } from '../services/employee-statutory.service.js';
import {
  generatePayslipPdf,
  type YtdTotals,
} from '../services/payslip-pdf.service.js';
import { deleteFile } from '../lib/local-storage.js';
import { logger } from '../config/logger.js';
import {
  esiEligibility,
  esiEmployee,
  esiEmployer,
  esiPeriodKey,
  pfEmployee,
  pfEmployer,
  professionalTax,
  ptStateCodeOf,
} from '../lib/statutory.js';

/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                       */
/* ──────────────────────────────────────────────────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;

function daysInMonth(year: number, month: number): number {
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
function computeOvertimePay(
  fullMonthGross: number,
  otMinutes: number,
  actualWorkingDays: number,
): number {
  if (
    fullMonthGross <= 0 ||
    otMinutes <= 0 ||
    actualWorkingDays <= 0
  ) {
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

export async function listComponents(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.type) filter.type = q.type;
  const result = await SalaryComponent.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: 'order name',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function createComponent(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof componentSchema>;
  const c = await SalaryComponent.create(body);
  void audit({ action: 'create', entity: 'SalaryComponent', entityId: String(c._id) });
  res.status(201).json({ success: true, data: c });
}

export async function getComponent(req: Request, res: Response): Promise<void> {
  const c = await SalaryComponent.findById(String(req.params.id)).exec();
  if (!c) throw new NotFoundError('Component not found');
  res.json({ success: true, data: c });
}

export async function updateComponent(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateComponentSchema>;
  const c = await SalaryComponent.findByIdAndUpdate(String(req.params.id), body, {
    new: true,
  }).exec();
  if (!c) throw new NotFoundError('Component not found');
  void audit({ action: 'update', entity: 'SalaryComponent', entityId: String(c._id) });
  res.json({ success: true, data: c });
}

export async function deleteComponent(req: Request, res: Response): Promise<void> {
  const c = await SalaryComponent.findById(String(req.params.id)).exec();
  if (!c) throw new NotFoundError('Component not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (c as any).softDelete();
  void audit({ action: 'delete', entity: 'SalaryComponent', entityId: String(c._id) });
  res.json({ success: true, message: 'Component deleted' });
}

/* ──────────────────────────────────────────────────────────── */
/* Salary Structures                                             */
/* ──────────────────────────────────────────────────────────── */

export const structureSchema = z.object({
  name: z.string().min(1),
  components: z
    .array(
      z.object({
        componentId: z.string(),
        calculationType: z.enum(['fixed', 'percentage_of_basic', 'percentage_of_gross']),
        value: z.coerce.number(),
      }),
    )
    .default([]),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateStructureSchema = structureSchema.partial();

export async function listStructures(_req: Request, res: Response): Promise<void> {
  const list = await SalaryStructure.find()
    .populate('components.componentId', 'name code type calculationType')
    .sort('name')
    .lean()
    .exec();
  res.json({ success: true, data: list });
}

export async function createStructure(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof structureSchema>;
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

export async function getStructure(req: Request, res: Response): Promise<void> {
  const s = await SalaryStructure.findById(String(req.params.id))
    .populate('components.componentId')
    .exec();
  if (!s) throw new NotFoundError('Structure not found');
  res.json({ success: true, data: s });
}

export async function updateStructure(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateStructureSchema>;
  if (body.isDefault) {
    await SalaryStructure.updateMany(
      { _id: { $ne: new Types.ObjectId(String(req.params.id)) }, isDefault: true },
      { isDefault: false },
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { ...body };
  if (body.components) {
    update.components = body.components.map((c) => ({
      ...c,
      componentId: new Types.ObjectId(c.componentId),
    }));
  }
  const s = await SalaryStructure.findByIdAndUpdate(String(req.params.id), update, {
    new: true,
  }).exec();
  if (!s) throw new NotFoundError('Structure not found');
  void audit({ action: 'update', entity: 'SalaryStructure', entityId: String(s._id) });
  res.json({ success: true, data: s });
}

export async function deleteStructure(req: Request, res: Response): Promise<void> {
  const s = await SalaryStructure.findById(String(req.params.id)).exec();
  if (!s) throw new NotFoundError('Structure not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (s as any).softDelete();
  void audit({ action: 'delete', entity: 'SalaryStructure', entityId: String(s._id) });
  res.json({ success: true, message: 'Structure deleted' });
}

export const assignStructureSchema = z.object({
  employeeIds: z.array(z.string()).min(1),
});

export async function assignStructure(req: Request, res: Response): Promise<void> {
  // For now we just record an audit; actual structure-employee join could be added
  // as a future enhancement. Each employee already carries its own salary breakdown.
  const { employeeIds } = req.body as z.infer<typeof assignStructureSchema>;
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

export async function listCycles(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.year) filter.year = q.year;
  if (q.status) filter.status = q.status;
  const result = await PayrollCycle.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-year -month',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function createCycle(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createCycleSchema>;
  const exists = await PayrollCycle.findOne({ month: body.month, year: body.year }).exec();
  if (exists) throw new ConflictError('Payroll cycle for this month already exists');
  const cycle = await PayrollCycle.create({ ...body, status: 'draft' });
  void audit({ action: 'create', entity: 'PayrollCycle', entityId: String(cycle._id) });
  res.status(201).json({ success: true, data: cycle });
}

export async function getCycle(req: Request, res: Response): Promise<void> {
  const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!cycle) throw new NotFoundError('Cycle not found');
  res.json({ success: true, data: cycle });
}

/* ──────────────────────────────────────────────────────────── */
/* Process payroll for a cycle                                   */
/* ──────────────────────────────────────────────────────────── */

interface ComputedRecord {
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
  expense: number;
  advance: number;
  lateDeduction: number;
}

async function computeForEmployee(
  employee: typeof Employee.prototype,
  cycle: typeof PayrollCycle.prototype,
): Promise<ComputedRecord> {
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
  const weeklyOffDays = records.filter(
    (r) => r.status === 'weekend' || r.status === 'holiday',
  ).length;
  const unpaidDays = records.filter((r) => r.status === 'absent').length;
  // Late logins = late-status rows + any present rows that were flagged late.
  // Also count `lateDays` separately so we can include them in earned days.
  const lateLoginCount =
    lateDays + records.filter((r) => r.status === 'present' && (r.lateBy ?? 0) > 0).length;

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
  const proRate = (val: number): number =>
    monthDays > 0 ? round2((val * daysPaid) / monthDays) : 0;

  const earnedBasic = proRate(basic);
  const earnedDa = da > 0 ? proRate(da) : 0;
  const earnings: IPayrollLine[] = [
    { name: 'Basic', amount: earnedBasic },
    { name: 'HRA', amount: proRate(hra) },
  ];
  if (da > 0) earnings.push({ name: 'DA', amount: earnedDa });
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
  if (overtimeAmount > 0) earnings.push({ name: 'Over Time', amount: overtimeAmount });
  if (expense > 0) earnings.push({ name: 'Expense', amount: expense });

  const grossEarnings = round2(earnings.reduce((s, l) => s + l.amount, 0));
  const lopAmount = round2((fullMonthGross / monthDays) * lopDaysFinal);

  // Statutory deductions (rules and rates live in lib/statutory.ts).
  // PF is on what was EARNED: the pro-rated basic + DA, capped at the wage
  // ceiling. ESI is on the earned gross; whether it applies is decided once
  // per Apr–Sep / Oct–Mar period from the full-month gross and then kept.
  const pfWage = round2(earnedBasic + earnedDa);
  const pfEmp = pfEmployee(pfWage);

  const periodKey = esiPeriodKey(new Date(Date.UTC(cycle.year, cycle.month - 1, 1)));
  // Eligibility is decided on the full-month gross of the salary COMPONENTS —
  // not the stored `salary.grossSalary`, which the employee pre-save hook also
  // adds every `otherAllowances` value into (the CSV import stashes its PF,
  // CTC, net pay … there).
  const esi = esiEligibility(employee, fullMonthGross, periodKey);
  if (esi.persist) {
    const statutory = { esiEligible: esi.eligible, esiPeriodKey: periodKey };
    if (await saveEsiDecision(employee._id as Types.ObjectId, statutory)) employee.statutory = statutory;
  }
  const esicEmp = esiEmployee(grossEarnings, esi.eligible);

  const pt = professionalTax({
    stateCode: ptStateCodeOf(employee),
    monthlyGross: grossEarnings,
    month: cycle.month,
    gender: employee.gender,
  });

  const deductions: IPayrollLine[] = [];
  if (pt > 0) deductions.push({ name: 'P.Tax', amount: pt, statutoryType: 'pt' });
  deductions.push({ name: 'PF Employee', amount: pfEmp, statutoryType: 'pf' });
  deductions.push({ name: 'ESI Employee', amount: esicEmp, statutoryType: 'esi' });

  // Manual deductions — defaulted to 0; HR can edit on the record.
  const advance = 0;

  // Auto late deduction: every late check-in beyond the monthly free quota
  // (default 3) costs half a day's gross. HR can override via record edit.
  const cfg = await AttendanceConfig.findOne({}).lean().exec();
  const freeLateDays = cfg?.settings?.freeLateDaysPerMonth ?? 3;
  const penalisableLate = Math.max(0, lateLoginCount - freeLateDays);
  const lateDeduction =
    monthDays > 0 ? round2((fullMonthGross / monthDays) * 0.5 * penalisableLate) : 0;

  if (advance > 0) deductions.push({ name: 'Advance', amount: advance });
  if (lateDeduction > 0) deductions.push({ name: 'Late Deduction', amount: lateDeduction });

  // Employer contributions
  const pfErp = pfEmployer(pfWage);
  const esicErp = esiEmployer(grossEarnings, esi.eligible);
  const employerContributions: IPayrollLine[] = [];
  employerContributions.push({ name: 'PF Employer', amount: pfErp, statutoryType: 'pf' });
  employerContributions.push({ name: 'ESI Employer', amount: esicErp, statutoryType: 'esi' });

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

/** The acting user as an ObjectId, when the request has one. */
function actingUserId(): Types.ObjectId | undefined {
  const userId = getUserId();
  return userId ? new Types.ObjectId(userId) : undefined;
}

/** Keep a run's `processing` claim fresh at most this often (see STALE_PROCESSING_MS). */
const PROCESSING_HEARTBEAT_MS = 60 * 1000;

/**
 * (Re)builds every record of a draft or processed cycle (or of one left in
 * `processing` by a crashed run). HR overrides (`manualAdjustments`) on the
 * records being replaced are carried over by employee and re-applied to the
 * fresh figures.
 *
 * Failure handling (no transactions): before the old records are deleted a
 * failure puts the cycle back where it was. After, the cycle drops to
 * `draft` — it can be re-processed but not locked — with totals from the
 * records that were saved; overrides of the employees not yet saved are
 * lost and logged.
 */
export async function processCycle(req: Request, res: Response): Promise<void> {
  const found = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!found) throw new NotFoundError('Cycle not found');
  // A crashed run's records are in an unknown state: never go back to it.
  const restoreTo: PayrollCycleStatus = found.status === 'processing' ? 'draft' : found.status;
  // While `processing`, edits, lock and a second run are all refused (409).
  const cycle = await claimTransition(found, 'process', { status: 'processing' });
  const cycleId = cycle._id as Types.ObjectId;

  let oldRecordsDeleted = false;
  /** Employees whose carried override is on a rebuilt record / whose record is saved. */
  const carried = new Set<string>();
  const saved = new Set<string>();

  try {
    const previous = await PayrollRecord.find({ cycleId })
      .select('employeeId manualAdjustments')
      .lean()
      .exec();
    const overrides = new Map<string, IPayrollManualAdjustments>();
    for (const r of previous) {
      if (hasManualAdjustments(r.manualAdjustments)) overrides.set(String(r.employeeId), r.manualAdjustments);
    }

    // Compute everything before touching the stored records, so a failure
    // here leaves them (and their overrides) exactly as they were.
    const employees = await Employee.find({ status: 'active' }).exec();
    const rebuilt: IPayrollRecord[] = [];
    let lastBeat = Date.now();
    for (const emp of employees) {
      const computed = await computeForEmployee(emp, cycle);
      const carry = overrides.get(String(emp._id));
      if (carry) carried.add(String(emp._id));
      const record = new PayrollRecord({
        cycleId,
        employeeId: emp._id,
        ...computed,
        manualAdjustments: carry ?? {},
        bankDetails: {
          bankName: emp.bankDetails?.bankName,
          accountNumber: emp.bankDetails?.accountNumber,
          ifscCode: emp.bankDetails?.ifscCode,
        },
        paymentStatus: 'pending',
      });
      rebuilt.push(applyManualAdjustments(record));
      if (Date.now() - lastBeat > PROCESSING_HEARTBEAT_MS) {
        await touchProcessing(cycleId);
        lastBeat = Date.now();
      }
    }

    const dropped = [...overrides.keys()].filter((id) => !carried.has(id));
    if (dropped.length) {
      logger.warn(
        { cycleId: String(cycleId), droppedOverrides: dropped },
        'payroll: overrides of employees no longer active were not carried over',
      );
    }

    await PayrollRecord.deleteMany({ cycleId });
    oldRecordsDeleted = true;
    for (const record of rebuilt) {
      await record.save();
      saved.add(String(record.employeeId));
    }
    await recomputeCycleTotals(cycleId);

    const by = actingUserId();
    const processed = await PayrollCycle.findOneAndUpdate(
      { _id: cycleId, status: 'processing' },
      { $set: { status: 'processed', processedAt: new Date(), ...(by ? { processedBy: by } : {}) } },
      { new: true },
    ).exec();
    if (!processed) throw new NotFoundError('Cycle not found');

    void audit({
      action: 'update',
      entity: 'PayrollCycle',
      entityId: String(cycleId),
      after: { status: 'processed', carriedOverrides: carried.size },
    });
    res.json({ success: true, data: processed });
  } catch (err) {
    await recoverFailedRun(cycleId, oldRecordsDeleted ? 'draft' : restoreTo, oldRecordsDeleted, carried, saved);
    throw err;
  }
}

/**
 * Never leave a failed run's cycle in `processing` (which refuses every
 * action). Best effort: a failure here is logged, the run's own error wins.
 */
async function recoverFailedRun(
  cycleId: Types.ObjectId,
  status: PayrollCycleStatus,
  oldRecordsDeleted: boolean,
  carried: Set<string>,
  saved: Set<string>,
): Promise<void> {
  try {
    await PayrollCycle.updateOne({ _id: cycleId, status: 'processing' }, { $set: { status } }).exec();
    if (!oldRecordsDeleted) return;
    await recomputeCycleTotals(cycleId);
    const lost = [...carried].filter((id) => !saved.has(id));
    if (lost.length) {
      logger.warn(
        { cycleId: String(cycleId), lostOverrides: lost },
        'payroll: run failed after replacing records; these overrides were lost',
      );
    }
  } catch (restoreErr) {
    logger.error({ err: restoreErr, cycleId: String(cycleId) }, 'payroll: could not reset a failed run');
  }
}

/* ──────────────────────────────────────────────────────────── */
/* Records                                                        */
/* ──────────────────────────────────────────────────────────── */

export async function listCycleRecords(req: Request, res: Response): Promise<void> {
  const cycle = await PayrollCycle.findById(String(req.params.id)).select('_id').lean().exec();
  if (!cycle) throw new NotFoundError('Cycle not found');
  const records = await PayrollRecord.find({ cycleId: cycle._id })
    .populate('employeeId', 'firstName lastName employeeId email')
    .sort('employeeId')
    .lean()
    .exec();
  res.json({ success: true, data: records });
}

/** An override amount, or `null` to clear the override (back to the computed figure). */
const overrideAmount = z.union([z.null(), z.coerce.number().finite().min(0)]).optional();

/**
 * HR edits a record only through its manual adjustments. Line arrays and the
 * computed fields (overtime, late deduction, leave balance) are not editable;
 * unknown keys are dropped.
 */
export const updateRecordSchema = z.object({
  arrears: overrideAmount,
  advance: overrideAmount,
  expense: overrideAmount,
  reimbursements: overrideAmount,
  loanDeduction: overrideAmount,
  tds: overrideAmount,
  note: z.string().trim().max(500).nullable().optional(),
});

/** Plain snapshot of a record's overrides, for the audit trail. */
function adjustmentsSnapshot(manual: IPayrollManualAdjustments): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of ADJUSTABLE_FIELDS) out[field] = manual[field] ?? null;
  out.note = manual.note ?? null;
  return out;
}

/** Everything an edit can change on a record — what a reverted edit puts back. */
const EDITED_PATHS = [
  'earnings',
  'deductions',
  ...ADJUSTABLE_FIELDS,
  'grossSalary',
  'totalDeductions',
  'netSalary',
  'manualAdjustments',
  'payslipUrl',
] as const;

/** Writes `original`'s values of EDITED_PATHS back onto the stored record. */
async function restoreRecord(recordId: unknown, original: Record<string, unknown>): Promise<void> {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const p of EDITED_PATHS) {
    if (original[p] === undefined) $unset[p] = 1;
    else $set[p] = original[p];
  }
  await PayrollRecord.updateOne(
    { _id: recordId },
    Object.keys($unset).length ? { $set, $unset } : { $set },
  ).exec();
}

/** Deletes a stored payslip file. Best effort: logged, never thrown. */
async function discardPayslipFile(url: string | undefined): Promise<void> {
  if (!url?.startsWith('/uploads/')) return;
  await deleteFile(url.slice('/uploads/'.length)).catch((err: unknown) =>
    logger.warn({ err, url }, 'payroll: could not delete superseded payslip'),
  );
}

export async function updateRecord(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateRecordSchema>;
  const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!cycle) throw new NotFoundError('Cycle not found');
  const cycleId = cycle._id as Types.ObjectId;
  const record = await PayrollRecord.findById(String(req.params.recordId)).exec();
  if (!record || !record.cycleId.equals(cycleId)) {
    throw new NotFoundError('Record not found');
  }
  assertTransition(cycle, 'edit');

  const original = record.toObject() as unknown as Record<string, unknown>;
  const before = adjustmentsSnapshot(record.manualAdjustments);
  for (const field of ADJUSTABLE_FIELDS) {
    const value = body[field];
    if (value !== undefined) setManualAdjustment(record, field, value);
  }
  if (body.note !== undefined) record.manualAdjustments.note = body.note || undefined;
  applyManualAdjustments(record);
  // A generated payslip shows the old figures: drop it. The next download
  // (or generate-payslips run) renders it again from the edited record.
  const stalePayslip = record.payslipUrl;
  record.payslipUrl = undefined;
  await record.save();

  // The status was checked before the save; if the cycle was locked (or
  // claimed by a process run) meanwhile, put the record back and refuse.
  const current = await PayrollCycle.findById(cycleId).select('status updatedAt').lean().exec();
  if (!current || !isTransitionAllowed(current, 'edit')) {
    await restoreRecord(record._id, original);
    await recomputeCycleTotals(cycleId);
    if (!current) throw new NotFoundError('Cycle not found');
    throw cycleNotEditable(current.status, 'edit');
  }
  await recomputeCycleTotals(cycleId);
  await discardPayslipFile(stalePayslip);

  void audit({
    action: 'update',
    entity: 'PayrollRecord',
    entityId: String(record._id),
    before: { manualAdjustments: before },
    after: { manualAdjustments: adjustmentsSnapshot(record.manualAdjustments) },
  });
  res.json({ success: true, data: record });
}

/* ──────────────────────────────────────────────────────────── */
/* Generate payslips for cycle                                   */
/* ──────────────────────────────────────────────────────────── */

async function ytdForEmployee(
  employeeId: Types.ObjectId,
  year: number,
  uptoMonth: number,
): Promise<YtdTotals> {
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

export async function generatePayslips(req: Request, res: Response): Promise<void> {
  const cycle = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!cycle) throw new NotFoundError('Cycle not found');
  assertTransition(cycle, 'generatePayslips');

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
    if (!employee) continue;
    try {
      const ytd = await ytdForEmployee(
        employee._id as Types.ObjectId,
        cycle.year,
        cycle.month,
      );
      const previousUrl = record.payslipUrl;
      const url = await generatePayslipPdf(
        record as IPayrollRecord,
        cycle,
        employee,
        company,
        ytd,
      );
      record.payslipUrl = url;
      await record.save();
      generated += 1;
      // Each generation writes a new random key; drop the file it supersedes.
      if (previousUrl !== url) await discardPayslipFile(previousUrl);
    } catch (err) {
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

/** processed → locked. From here the figures are final and employees can see them. */
export async function lockCycle(req: Request, res: Response): Promise<void> {
  const found = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!found) throw new NotFoundError('Cycle not found');
  const by = actingUserId();
  const cycle = await claimTransition(found, 'lock', {
    status: 'locked',
    lockedAt: new Date(),
    ...(by ? { lockedBy: by } : {}),
  });
  void audit({ action: 'update', entity: 'PayrollCycle', entityId: String(cycle._id), after: { status: 'locked' } });
  res.json({ success: true, data: cycle });
}

export const markPaidSchema = z.object({
  paymentRef: z.string().min(1),
  paidAt: z.coerce.date().optional(),
});

/** locked → paid: every record is marked paid, then loans/claims settle. */
export async function markCyclePaid(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof markPaidSchema>;
  const found = await PayrollCycle.findById(String(req.params.id)).exec();
  if (!found) throw new NotFoundError('Cycle not found');

  const paidAt = body.paidAt ?? new Date();
  const by = actingUserId();
  const cycle = await claimTransition(found, 'markPaid', {
    status: 'paid',
    paidAt,
    paymentRef: body.paymentRef,
    ...(by ? { paidBy: by } : {}),
  });

  await PayrollRecord.updateMany(
    { cycleId: cycle._id },
    { $set: { paymentStatus: 'paid', paidAt, paymentRef: body.paymentRef } },
  );
  await settleCycle(cycle);

  void audit({ action: 'update', entity: 'PayrollCycle', entityId: String(cycle._id), after: { status: 'paid' } });
  res.json({ success: true, data: cycle });
}

/* ──────────────────────────────────────────────────────────── */
/* Individual record / payslip                                   */
/* ──────────────────────────────────────────────────────────── */

export async function getRecord(req: Request, res: Response): Promise<void> {
  const record = await PayrollRecord.findById(String(req.params.id))
    .populate('employeeId', 'firstName lastName employeeId email')
    .populate('cycleId', 'month year status')
    .exec();

  if (!record) throw new NotFoundError('Record not found');

  const cycleStatus = (record.cycleId as unknown as { status?: PayrollCycleStatus } | null)?.status;
  await assertPayslipAccess(req, record.employeeId, cycleStatus);

  res.json({ success: true, data: record });
}

const PAYROLL_PRIVILEGE = 'payroll.process';

/**
 * Payroll staff (`payroll.process`) reach any record. Everyone else reaches
 * only their own (403 otherwise), and only once its cycle is locked or paid —
 * before that it is a 404, as if the payslip did not exist yet.
 */
async function assertPayslipAccess(
  req: Request,
  ownerEmployeeId: unknown,
  cycleStatus: PayrollCycleStatus | undefined,
): Promise<void> {
  if (hasPermission(req.user, PAYROLL_PRIVILEGE)) return;
  if (!(await isOwnRecord(req, ownerEmployeeId))) {
    throw new ForbiddenError('You can only access your own records');
  }
  if (!cycleStatus || !EMPLOYEE_VISIBLE_STATUSES.includes(cycleStatus)) {
    throw new NotFoundError('Record not found');
  }
}

export async function downloadPayslip(req: Request, res: Response): Promise<void> {
  const record = await PayrollRecord.findById(String(req.params.id)).exec();
  if (!record) throw new NotFoundError('Record not found');
  const cycle = await PayrollCycle.findById(record.cycleId).exec();
  await assertPayslipAccess(req, record.employeeId, cycle?.status);

  // Generate on demand if not already cached on the record (an edit drops
  // the cached one), under the same rule as generate-payslips.
  if (!record.payslipUrl) {
    if (!cycle) throw new NotFoundError('Cycle not found');
    assertTransition(cycle, 'generatePayslips');

    const employee = await Employee.findById(record.employeeId)
      .populate('department', 'name code')
      .populate('designation', 'name level')
      .exec();
    if (!employee) throw new NotFoundError('Employee not found');

    const company = {
      name: process.env.COMPANY_NAME || 'Company',
      email: process.env.COMPANY_EMAIL,
    };
    const ytd = await ytdForEmployee(
      employee._id as Types.ObjectId,
      cycle.year,
      cycle.month,
    );
    const url = await generatePayslipPdf(
      record as IPayrollRecord,
      cycle,
      employee,
      company,
      ytd,
    );
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

export async function monthlyReport(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
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

export async function yearlyReport(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
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

export async function statutoryReport(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const filter: { year?: number; month?: number } = {};
  if (q.year) filter.year = Number(q.year);
  if (q.month) filter.month = Number(q.month);

  const cycles = await PayrollCycle.find(filter).select('_id month year').lean().exec();
  const cycleIds = cycles.map((c) => c._id);
  const records = await PayrollRecord.find({ cycleId: { $in: cycleIds } })
    .populate('employeeId', 'firstName lastName employeeId')
    .lean()
    .exec();

  const employee: Record<PayrollStatutoryType, number> = { pf: 0, esi: 0, pt: 0, tds: 0 };
  const employer: Record<PayrollStatutoryType, number> = { pf: 0, esi: 0, pt: 0, tds: 0 };

  for (const r of records) {
    for (const d of r.deductions ?? []) {
      const type = statutoryTypeOf(d);
      if (type) employee[type] += d.amount || 0;
    }
    for (const e of r.employerContributions ?? []) {
      const type = statutoryTypeOf(e);
      if (type) employer[type] += e.amount || 0;
    }
  }

  res.json({
    success: true,
    data: {
      filter,
      totals: {
        pfEmployee: round2(employee.pf),
        pfEmployer: round2(employer.pf),
        esicEmployee: round2(employee.esi),
        esicEmployer: round2(employer.esi),
        professionalTax: round2(employee.pt),
        tds: round2(employee.tds),
      },
      records,
    },
  });
}

/**
 * Which statutory deduction a line is: its `statutoryType`, or — for lines
 * written before lines carried a type — the names payroll has used for them
 * ("PF Employee", "ESI Employee"/"ESIC …", "P.Tax"/"Professional Tax", "TDS").
 */
function statutoryTypeOf(line: Pick<IPayrollLine, 'name' | 'statutoryType'>): PayrollStatutoryType | null {
  if (line.statutoryType) return line.statutoryType;
  const name = line.name ?? '';
  if (name.includes('PF')) return 'pf';
  if (/\bESIC?\b/.test(name)) return 'esi';
  if (name.includes('Professional') || /\bP\.?\s?Tax\b/i.test(name)) return 'pt';
  if (/\bTDS\b/.test(name)) return 'tds';
  return null;
}

/* ──────────────────────────────────────────────────────────── */
/* Employee self-service                                         */
/* ──────────────────────────────────────────────────────────── */

export async function myPayslips(_req: Request, res: Response): Promise<void> {
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
  // Only finalised cycles: a processed cycle can still be re-run or edited.
  const visible = await PayrollCycle.find({ status: { $in: EMPLOYEE_VISIBLE_STATUSES } })
    .select('_id')
    .lean()
    .exec();
  const records = await PayrollRecord.find({
    employeeId: employee._id,
    cycleId: { $in: visible.map((c) => c._id) },
  })
    .populate('cycleId', 'month year status')
    .sort('-createdAt')
    .lean()
    .exec();
  res.json({ success: true, data: records });
}
