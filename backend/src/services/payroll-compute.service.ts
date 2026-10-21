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
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee, type EmployeeStatus, type IEmployee } from '../models/employee.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import type { ILeaveType } from '../models/leave-type.model.js';
import { Loan, type InstallmentStatus, type LoanStatus } from '../models/loan.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { PayrollCycle, type IPayrollCycle } from '../models/payroll-cycle.model.js';
import {
  PayrollRecord,
  type IPayrollRecord,
  type IPayrollComputedFigures,
  type IPayrollLine,
  type IPayrollManualAdjustments,
  type IPayrollSettlement,
  type IPayrollSettlementInstallment,
} from '../models/payroll-record.model.js';
import type { CalculationType, ComponentType, ISalaryComponent } from '../models/salary-component.model.js';
import { applyManualAdjustments, cycleLabel } from '../lib/payroll-cycle.js';
import { AppError } from '../lib/errors.js';
import { DAY_MS, atBusinessTime, startOfBusinessDay } from '../lib/business-day.js';
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
import { saveEsiDecision } from './employee-statutory.service.js';
import { isUnpaidLeaveType, leaveWorkingDays, type LeaveEmployee } from './leave-attendance.service.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number => Number(v ?? 0) || 0;

/* ──────────────────────────────────────────────────────────── */
/* Period and paid window                                        */
/* ──────────────────────────────────────────────────────────── */

/** Paid for the whole cycle — up to an exit date, when one is set. */
export const PAYROLL_STATUSES: readonly EmployeeStatus[] = ['active', 'onNotice'];
/** People who have left: paid only in the month their exit date falls in. */
export const LEAVER_STATUSES: readonly EmployeeStatus[] = ['resigned', 'terminated', 'inactive'];

interface Period {
  start: Date;
  end: Date;
  monthDays: number;
}

/** The month as day labels: the 1st and the last day. */
function periodOf(year: number, month: number): Period {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start, end, monthDays: end.getUTCDate() };
}

/** The instants `[from, to)` business days `start` … `end` (labels) span. */
function instantsOf(start: Date, end: Date): { from: Date; to: Date } {
  return {
    from: atBusinessTime(start, '00:00'),
    to: atBusinessTime(new Date(end.getTime() + DAY_MS), '00:00'),
  };
}

/** The day label of the business day `d` falls on. */
const dayLabel = (d: Date | string): Date => startOfBusinessDay(new Date(d));

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
export function paidWindow(
  employee: { joiningDate?: Date | null; exitDate?: Date | null; status?: EmployeeStatus | null },
  year: number,
  month: number,
): PaidWindow | null {
  const period = periodOf(year, month);
  const exit = employee.exitDate ? dayLabel(employee.exitDate) : null;
  const exitsInPeriod = !!exit && exit >= period.start && exit <= period.end;
  if (employee.status && LEAVER_STATUSES.includes(employee.status) && !exitsInPeriod) return null;

  const joined = employee.joiningDate ? dayLabel(employee.joiningDate) : period.start;
  const start = joined > period.start ? joined : period.start;
  const end = exit && exit < period.end ? exit : period.end;
  if (start > end) return null;
  return {
    start,
    end,
    calendarDays: Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1,
    monthDays: period.monthDays,
  };
}

/**
 * The employees a cycle is processed for: active and on-notice staff, and
 * leavers whose exit date is in the month. (`paidWindow` then drops anyone
 * with no paid day — e.g. a joiner after the month.)
 */
export function payrollEmployeeFilter(year: number, month: number): FilterQuery<IEmployee> {
  const period = periodOf(year, month);
  const { from, to } = instantsOf(period.start, period.end);
  return {
    $or: [
      { status: { $in: PAYROLL_STATUSES } },
      { status: { $in: LEAVER_STATUSES }, exitDate: { $gte: from, $lt: to } },
    ],
  };
}

/* ──────────────────────────────────────────────────────────── */
/* Day tally                                                     */
/* ──────────────────────────────────────────────────────────── */

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
export async function dayTally(
  employeeId: Types.ObjectId,
  window: Pick<PaidWindow, 'start' | 'end'>,
  opts: { employee?: LeaveEmployee } = {},
): Promise<DayTally> {
  const tally: DayTally = {
    present: 0,
    late: 0,
    halfDay: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    absent: 0,
    weeklyOff: 0,
    lateLogins: 0,
    lopDays: 0,
  };
  const { from, to } = instantsOf(window.start, window.end);

  const rows = await Attendance.find({ employeeId, date: { $gte: from, $lt: to } })
    .select('date status isPaidLeave leaveRequestId lateBy checkIn.time')
    .lean()
    .exec();
  const today = startOfBusinessDay(new Date()).getTime();
  const counted = new Set<number>();
  for (const row of rows) {
    counted.add(dayLabel(row.date).getTime());
    const paid = row.isPaidLeave === true;
    const unpaidLeave = row.isPaidLeave === false || !!row.leaveRequestId;
    if (row.status === 'weekend' || row.status === 'holiday') {
      tally.weeklyOff += 1;
    } else if (row.status === 'half_day') {
      tally.halfDay += 1;
      const leaveStamped = row.leaveRequestId != null || row.isPaidLeave != null;
      if (!paid) {
        tally.lopDays += 0.5;
      } else if (leaveStamped && !row.checkIn?.time && dayLabel(row.date).getTime() < today) {
        // A paid half day of leave on a day that is over, with no punch: the
        // other half was never worked.
        tally.lopDays += 0.5;
      }
    } else if (paid) {
      tally.paidLeave += 1;
    } else if (row.status === 'absent' || (row.status === 'on_leave' && row.isPaidLeave === false)) {
      if (unpaidLeave) tally.unpaidLeave += 1;
      else tally.absent += 1;
      tally.lopDays += 1;
    } else if (row.status === 'on_leave') {
      tally.paidLeave += 1;
    } else if (row.status === 'late') {
      tally.late += 1;
      tally.lateLogins += 1;
    } else {
      tally.present += 1;
      if ((row.lateBy ?? 0) > 0) tally.lateLogins += 1;
    }
  }

  const leaves = await LeaveRequest.find({
    employeeId,
    status: 'approved',
    startDate: { $lt: to },
    endDate: { $gte: from },
  })
    .select('startDate endDate isHalfDay leaveTypeId')
    .populate<{ leaveTypeId: Pick<ILeaveType, 'paidLeave' | 'code' | 'name'> | null }>('leaveTypeId', 'paidLeave code name')
    .lean()
    .exec();
  const unpaid = leaves.filter((l) => isUnpaidLeaveType(l.leaveTypeId));
  if (unpaid.length > 0) {
    const employee =
      opts.employee ??
      ((await Employee.findById(employeeId).select('shift department').lean().exec()) as LeaveEmployee | null) ??
      ({} as LeaveEmployee);
    for (const leave of unpaid) {
      const first = dayLabel(leave.startDate);
      const last = dayLabel(leave.endDate);
      const start = first > window.start ? first : window.start;
      const end = last < window.end ? last : window.end;
      if (start > end) continue;
      for (const day of await leaveWorkingDays(start, end, employee)) {
        if (counted.has(day.getTime())) continue;
        counted.add(day.getTime());
        if (leave.isHalfDay) {
          tally.halfDay += 1;
          tally.lopDays += 0.5;
        } else {
          tally.unpaidLeave += 1;
          tally.lopDays += 1;
        }
      }
    }
  }

  tally.lopDays = round2(tally.lopDays);
  return tally;
}

/* ──────────────────────────────────────────────────────────── */
/* Earnings                                                      */
/* ──────────────────────────────────────────────────────────── */

/** Loads the employee's salary structure with its components (see `earningsFor`). */
export const STRUCTURE_POPULATE = {
  path: 'salaryStructureId',
  populate: { path: 'components.componentId' },
};

type StructureComponent = Pick<ISalaryComponent, 'name' | 'type' | 'isStatutory' | 'statutoryType' | 'isActive'> & {
  _id: Types.ObjectId;
  calculationType?: CalculationType;
  statutoryBase?: ISalaryComponent['statutoryBase'];
};

interface StructureAmount {
  component: StructureComponent;
  /** The full-month amount, before pro-rating. */
  fullMonth: number;
}

type SalaryEmployee = Pick<IEmployee, 'salary' | 'salaryStructureId'>;

/**
 * Basic + HRA + DA + special allowance from the salary components: the
 * full-month gross without a structure, and what `percentage_of_gross`
 * structure components are a percentage of.
 */
export function salaryComponentsGross(employee: Pick<IEmployee, 'salary'>): number {
  const s = employee.salary;
  return round2(num(s?.basic) + num(s?.hra) + num(s?.da) + num(s?.specialAllowance));
}

function isComponent(value: unknown): value is StructureComponent {
  return !!value && typeof value === 'object' && !(value instanceof Types.ObjectId) && 'type' in value && 'name' in value;
}

/**
 * The full-month amount of each usable component of the employee's structure,
 * when `salaryStructureId` is populated (`STRUCTURE_POPULATE`):
 * `fixed` → the value, `percentage_of_basic` → value % of the basic,
 * `percentage_of_gross` → value % of `salaryComponentsGross`. Components
 * that were deleted or deactivated are left out, and so are statutory ones
 * (PF / ESI / PT / TDS come from lib/statutory.ts and the declared TDS).
 * `null` — use the salary components instead — without a structure, or when
 * the structure has no earning to pay.
 */
function structureAmounts(employee: SalaryEmployee): StructureAmount[] | null {
  const structure = employee.salaryStructureId as unknown;
  if (!structure || structure instanceof Types.ObjectId || typeof structure !== 'object') return null;
  const entries = (structure as { components?: unknown }).components;
  if (!Array.isArray(entries)) return null;

  const basic = num(employee.salary?.basic);
  const gross = salaryComponentsGross(employee);
  const amounts: StructureAmount[] = [];
  for (const entry of entries as Array<{ componentId?: unknown; calculationType?: CalculationType; value?: number }>) {
    const component = entry.componentId;
    if (!isComponent(component) || component.isActive === false) continue;
    if (component.isStatutory || component.statutoryType) continue;
    const value = num(entry.value);
    const calculation = entry.calculationType ?? component.calculationType ?? 'fixed';
    const fullMonth =
      calculation === 'percentage_of_basic'
        ? (value * basic) / 100
        : calculation === 'percentage_of_gross'
          ? (value * gross) / 100
          : value;
    amounts.push({ component, fullMonth });
  }
  return amounts.some((a) => a.component.type === 'earning') ? amounts : null;
}

/** `amount × daysPaid / monthDays`, to the paisa. */
function proRater(daysPaid: number, monthDays: number): (amount: number) => number {
  return (amount) => (monthDays > 0 ? round2((amount * daysPaid) / monthDays) : 0);
}

/**
 * The earning lines, from the structure's amounts (`structureAmounts`) when
 * there are any, else from the salary components.
 */
function earningLines(
  employee: SalaryEmployee,
  structure: StructureAmount[] | null,
  proRate: (amount: number) => number,
): IPayrollLine[] {
  if (structure) {
    return structure
      .filter((a) => a.component.type === 'earning')
      .map((a) => ({ componentId: a.component._id, name: a.component.name, amount: proRate(a.fullMonth) }));
  }
  const s = employee.salary;
  const lines: IPayrollLine[] = [
    { name: 'Basic', amount: proRate(num(s?.basic)) },
    { name: 'HRA', amount: proRate(num(s?.hra)) },
  ];
  if (num(s?.da) > 0) lines.push({ name: 'DA', amount: proRate(num(s?.da)) });
  lines.push({ name: 'Other Allowance', amount: proRate(num(s?.specialAllowance)) });
  return lines;
}

/**
 * The earning lines for `daysPaid` paid days of a `monthDays`-day month.
 * With a populated salary structure: one line per earning component (named
 * after it, carrying its `componentId`), pro-rated. Without: Basic, HRA, DA
 * (when there is one) and Other Allowance (`specialAllowance`), pro-rated.
 */
export function earningsFor(employee: SalaryEmployee, daysPaid: number, monthDays: number): IPayrollLine[] {
  return earningLines(employee, structureAmounts(employee), proRater(daysPaid, monthDays));
}

/** The full-month gross: the structure's earnings, or the salary components. */
function fullMonthGrossOf(employee: SalaryEmployee, structure: StructureAmount[] | null): number {
  if (!structure) return salaryComponentsGross(employee);
  return round2(structure.filter((a) => a.component.type === 'earning').reduce((s, a) => s + a.fullMonth, 0));
}

/** A structure's deduction or employer-contribution components, at their full-month amount. */
function structureLines(structure: StructureAmount[] | null, type: Exclude<ComponentType, 'earning'>): IPayrollLine[] {
  return (structure ?? [])
    .filter((a) => a.component.type === type)
    .map((a) => ({ componentId: a.component._id, name: a.component.name, amount: round2(a.fullMonth) }))
    .filter((l) => l.amount > 0);
}

/** Name rule for a component without a PF flag: named like a basic or a dearness allowance. */
const PF_WAGE_COMPONENT = /basic|dearness|^da$/i;

/** Whether one earning component is a PF wage — decided by its own flag, else its own name. */
function isPfWageComponent(component: { name: string; statutoryBase?: ISalaryComponent['statutoryBase'] }): boolean {
  switch (component.statutoryBase) {
    case 'basic':
    case 'da':
      return true;
    case 'none':
      return false;
    default:
      return PF_WAGE_COMPONENT.test(component.name.trim());
  }
}

/**
 * The structure's earning components that are PF wages, each decided on its
 * own (`isPfWageComponent`): flagged `basic` / `da` → yes, flagged `none` →
 * no, not flagged → by its name. Flagging one component never changes how
 * another is read.
 */
function pfWageComponentIds(structure: StructureAmount[] | null): Set<string> {
  const earnings = (structure ?? []).filter((a) => a.component.type === 'earning');
  return new Set(earnings.filter((a) => isPfWageComponent(a.component)).map((a) => String(a.component._id)));
}

/**
 * The earned wage PF is on. With a structure: its earned lines whose
 * component is a PF wage (`pfWageComponentIds`); when none is, and without
 * a structure, the pro-rated `salary.basic + salary.da`.
 */
function pfWageOf(
  employee: SalaryEmployee,
  structure: StructureAmount[] | null,
  earnings: IPayrollLine[],
  proRate: (amount: number) => number,
): number {
  const ids = pfWageComponentIds(structure);
  const fromStructure = earnings.filter((l) => l.componentId && ids.has(String(l.componentId)));
  if (fromStructure.length > 0) return round2(fromStructure.reduce((s, l) => s + l.amount, 0));
  return round2(proRate(num(employee.salary?.basic)) + proRate(num(employee.salary?.da)));
}

/** Overtime pays on an 8-hour day (480 minutes). */
const OVERTIME_DAY_MINUTES = 480;

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
export function computeOvertimePay(fullMonthGross: number, otMinutes: number, monthDays: number): number {
  if (fullMonthGross <= 0 || otMinutes <= 0 || monthDays <= 0) return 0;
  return round2((fullMonthGross * otMinutes) / (monthDays * OVERTIME_DAY_MINUTES));
}

/* ──────────────────────────────────────────────────────────── */
/* Loans and claims                                              */
/* ──────────────────────────────────────────────────────────── */

/** Loans being repaid, and the instalments still to collect. */
const REPAYING_LOANS: LoanStatus[] = ['active', 'disbursed'];
const PENDING_INSTALLMENTS: InstallmentStatus[] = ['scheduled', 'overdue'];

/** The instalments of the employee's repaying loans due in the month, oldest due first. */
async function installmentsDue(employeeId: Types.ObjectId, period: Period): Promise<IPayrollSettlementInstallment[]> {
  const { from, to } = instantsOf(period.start, period.end);
  const loans = await Loan.find({
    employee: employeeId,
    status: { $in: REPAYING_LOANS },
    installments: { $elemMatch: { status: { $in: PENDING_INSTALLMENTS }, dueDate: { $gte: from, $lt: to } } },
  })
    .select('installments')
    .sort({ _id: 1 })
    .lean()
    .exec();

  const due: Array<IPayrollSettlementInstallment & { dueAt: number }> = [];
  for (const loan of loans) {
    for (const inst of loan.installments) {
      const dueAt = new Date(inst.dueDate).getTime();
      if (!PENDING_INSTALLMENTS.includes(inst.status) || dueAt < from.getTime() || dueAt >= to.getTime()) continue;
      const amount = round2(num(inst.amount) - num(inst.paidAmount));
      if (amount > 0 && inst._id) due.push({ loanId: loan._id as Types.ObjectId, installmentId: inst._id, amount, dueAt });
    }
  }
  return due.sort((a, b) => a.dueAt - b.dueAt).map(({ loanId, installmentId, amount }) => ({ loanId, installmentId, amount }));
}

/** What an approved claim pays: the accepted amount, else the amount claimed. */
export function claimValue(claim: { amount?: number | null; acceptedAmount?: number | null }): number {
  return round2(num(claim.acceptedAmount ?? claim.amount));
}

/** Approved claims not reimbursed yet nor held by another record, oldest first. */
async function claimsToReimburse(
  employeeId: Types.ObjectId,
  held: HeldItems,
): Promise<Array<{ id: Types.ObjectId; amount: number }>> {
  const claims = await ExpenseClaim.find({ employeeId, status: 'approved' })
    .select('amount acceptedAmount')
    .sort({ date: 1, _id: 1 })
    .lean()
    .exec();
  return claims
    .filter((c) => !held.claimIds.has(String(c._id)))
    .map((c) => ({ id: c._id as Types.ObjectId, amount: claimValue(c) }));
}

/* ──────────────────────────────────────────────────────────── */
/* Items held by a payroll record                                */
/* ──────────────────────────────────────────────────────────── */

/*
 * A record HOLDS the claims and loan instalments it counted
 * (`record.settlement`) from processing until `settleCycle` settles it
 * (`settlement.settledAt`) — whatever its cycle's status, except a draft
 * (a run that failed part-way; re-processing replaces it). While held, an
 * item is not counted by another cycle and cannot be paid by hand, so it is
 * paid exactly once, by the record that holds it.
 */

/** The claims and instalments held by records, as id strings. */
export interface HeldItems {
  claimIds: Set<string>;
  installmentIds: Set<string>;
}

interface HoldingRecord {
  _id: Types.ObjectId;
  cycleId: Types.ObjectId;
  settlement?: Partial<IPayrollSettlement> | null;
}

type CycleName = Pick<IPayrollCycle, 'year' | 'month'>;

/**
 * The records holding items (not settled, of a cycle that is not a draft,
 * counting something) that also match `filter`, leaving out the records of
 * `exceptCycleId`; with each one's cycle. Two queries.
 */
async function holdingRecords(
  filter: FilterQuery<IPayrollRecord>,
  exceptCycleId?: Types.ObjectId,
): Promise<Array<HoldingRecord & { cycle: CycleName }>> {
  const cycles = await PayrollCycle.find({
    status: { $ne: 'draft' },
    ...(exceptCycleId ? { _id: { $ne: exceptCycleId } } : {}),
  })
    .select('year month')
    .lean()
    .exec();
  if (cycles.length === 0) return [];
  const byId = new Map(cycles.map((c) => [String(c._id), { year: c.year, month: c.month }]));
  const records = await PayrollRecord.find({
    ...filter,
    cycleId: { $in: cycles.map((c) => c._id) },
    'settlement.settledAt': null,
    $or: [{ 'settlement.claimIds.0': { $exists: true } }, { 'settlement.loanInstallments.0': { $exists: true } }],
  })
    .select('cycleId settlement')
    .lean<HoldingRecord[]>()
    .exec();
  return records.map((r) => ({ ...r, cycle: byId.get(String(r.cycleId))! }));
}

/**
 * Every item held by a record of a cycle other than `exceptCycleId` (of one
 * employee, when given). `processCycle` loads this once per run.
 */
export async function heldItems(exceptCycleId?: Types.ObjectId, employeeId?: Types.ObjectId): Promise<HeldItems> {
  const held: HeldItems = { claimIds: new Set(), installmentIds: new Set() };
  for (const record of await holdingRecords(employeeId ? { employeeId } : {}, exceptCycleId)) {
    for (const id of record.settlement?.claimIds ?? []) held.claimIds.add(String(id));
    for (const item of record.settlement?.loanInstallments ?? []) held.installmentIds.add(String(item.installmentId));
  }
  return held;
}

/** The cycle whose record holds this claim, or `null`. */
export async function cycleHoldingClaim(claimId: Types.ObjectId): Promise<CycleName | null> {
  const [holder] = await holdingRecords({ 'settlement.claimIds': claimId });
  return holder?.cycle ?? null;
}

/** The cycle whose record holds this loan instalment, or `null`. */
export async function cycleHoldingInstallment(installmentId: Types.ObjectId): Promise<CycleName | null> {
  const [holder] = await holdingRecords({ 'settlement.loanInstallments.installmentId': installmentId });
  return holder?.cycle ?? null;
}

const itemHeld = (message: string): AppError => new AppError(message, 409, 'ITEM_HELD');

/**
 * Before an edit that makes the record pay what it counted — its
 * reimbursements or loan deduction back to the computed figure (override
 * cleared) or set to an amount — 409 `ITEM_HELD` when one of the counted
 * claims / instalments is held by another record, or was settled meanwhile:
 * paying this record would pay it a second time.
 */
export async function assertCountedItemsPayable(
  record: {
    _id: unknown;
    reimbursements?: number;
    loanDeduction?: number;
    settlement?: Partial<IPayrollSettlement> | null;
  },
  fields: ReadonlyArray<'reimbursements' | 'loanDeduction'>,
): Promise<void> {
  const otherRecords = { _id: { $ne: record._id } };

  const claimIds = record.settlement?.claimIds ?? [];
  if (fields.includes('reimbursements') && (record.reimbursements ?? 0) > 0 && claimIds.length > 0) {
    const [holder] = await holdingRecords({ ...otherRecords, 'settlement.claimIds': { $in: claimIds } });
    if (holder) {
      throw itemHeld(`An expense claim this record reimburses is held by the ${cycleLabel(holder.cycle)} payroll.`);
    }
    if (await ExpenseClaim.exists({ _id: { $in: claimIds }, status: { $ne: 'approved' } }).exec()) {
      throw itemHeld('An expense claim this record reimburses is no longer awaiting reimbursement. Re-process the cycle.');
    }
  }

  const installmentIds = (record.settlement?.loanInstallments ?? []).map((i) => i.installmentId);
  if (fields.includes('loanDeduction') && (record.loanDeduction ?? 0) > 0 && installmentIds.length > 0) {
    const [holder] = await holdingRecords({
      ...otherRecords,
      'settlement.loanInstallments.installmentId': { $in: installmentIds },
    });
    if (holder) {
      throw itemHeld(`A loan instalment this record deducts is held by the ${cycleLabel(holder.cycle)} payroll.`);
    }
    const settled = await Loan.exists({
      installments: { $elemMatch: { _id: { $in: installmentIds }, status: { $nin: PENDING_INSTALLMENTS } } },
    }).exec();
    if (settled) throw itemHeld('A loan instalment this record deducts has been paid meanwhile. Re-process the cycle.');
  }
}

/* ──────────────────────────────────────────────────────────── */
/* The record                                                    */
/* ──────────────────────────────────────────────────────────── */

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
export async function loadComputeConfig(cycleId?: Types.ObjectId): Promise<PayrollComputeConfig> {
  const cfg = await AttendanceConfig.findOne({}).lean().exec();
  return {
    freeLateDaysPerMonth: cfg?.settings?.freeLateDaysPerMonth ?? 3,
    ...(cycleId ? { held: await heldItems(cycleId) } : {}),
  };
}

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

/** Populates the employee's salary structure when it is still a bare id. */
async function withStructure(employee: IEmployee): Promise<void> {
  if (employee.salaryStructureId instanceof Types.ObjectId) await employee.populate(STRUCTURE_POPULATE);
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
export async function computeRecord(
  employee: IEmployee,
  cycle: Pick<IPayrollCycle, '_id' | 'year' | 'month'>,
  cfg: PayrollComputeConfig,
  opts: { manual?: ManualAdjustments | null } = {},
): Promise<ComputedRecord | null> {
  const window = paidWindow(employee, cycle.year, cycle.month);
  if (!window) return null;
  await withStructure(employee);
  const employeeId = employee._id as Types.ObjectId;
  const { monthDays } = window;

  const tally = await dayTally(employeeId, window, { employee });
  const lopDays = tally.lopDays;
  const daysPaid = round2(Math.max(0, window.calendarDays - lopDays));
  const proRate = proRater(daysPaid, monthDays);

  const structure = structureAmounts(employee);
  const earnings = earningLines(employee, structure, proRate);
  const fullMonthGross = fullMonthGrossOf(employee, structure);

  // Overtime: only formally approved requests are paid, at the company rate.
  const { from, to } = instantsOf(window.start, window.end);
  const overtime = await OvertimeRequest.find({
    employee: employeeId,
    status: 'approved',
    date: { $gte: from, $lt: to },
  })
    .select('hours')
    .lean()
    .exec();
  const overtimeHours = round2(overtime.reduce((s, r) => s + (r.hours ?? 0), 0));
  const overtimeAmount = computeOvertimePay(fullMonthGross, overtimeHours * 60, monthDays);

  // Statutory deductions are on the wages earned: the pro-rated salary plus overtime.
  const earnedGross = round2(earnings.reduce((s, l) => s + l.amount, 0) + overtimeAmount);
  // PF on the earned basic + DA (capped at the wage ceiling in lib/statutory).
  const pfWage = pfWageOf(employee, structure, earnings, proRate);

  // ESI applicability is decided once per contribution period from the full-month gross.
  const periodKey = esiPeriodKey(new Date(Date.UTC(cycle.year, cycle.month - 1, 1)));
  const esi = esiEligibility(employee, fullMonthGross, periodKey);
  if (esi.persist) {
    const statutory = { esiEligible: esi.eligible, esiPeriodKey: periodKey };
    if (await saveEsiDecision(employeeId, statutory)) employee.statutory = statutory;
  }

  const pt = professionalTax({
    stateCode: ptStateCodeOf(employee),
    monthlyGross: earnedGross,
    month: cycle.month,
    gender: employee.gender,
  });
  const tds = round2(num(employee.salary?.tdsMonthly));

  const deductions: IPayrollLine[] = [];
  if (pt > 0) deductions.push({ name: 'P.Tax', amount: pt, statutoryType: 'pt' });
  deductions.push({ name: 'PF Employee', amount: pfEmployee(pfWage), statutoryType: 'pf' });
  deductions.push({ name: 'ESI Employee', amount: esiEmployee(earnedGross, esi.eligible), statutoryType: 'esi' });
  if (tds > 0) deductions.push({ name: 'TDS', amount: tds, statutoryType: 'tds' });
  deductions.push(...structureLines(structure, 'deduction'));

  const employerContributions: IPayrollLine[] = [
    { name: 'PF Employer', amount: pfEmployer(pfWage), statutoryType: 'pf' },
    { name: 'ESI Employer', amount: esiEmployer(earnedGross, esi.eligible), statutoryType: 'esi' },
    ...structureLines(structure, 'employer_contribution'),
  ];

  // Every late check-in beyond the monthly free quota costs half a day's gross.
  const dayRate = monthDays > 0 ? fullMonthGross / monthDays : 0;
  const penalisableLate = Math.max(0, tally.lateLogins - cfg.freeLateDaysPerMonth);
  const lateDeduction = round2(dayRate * 0.5 * penalisableLate);

  // Nothing another record holds (until it is settled) is counted again.
  const held = cfg.held ?? (await heldItems(cycle._id as Types.ObjectId, employeeId));
  const loanInstallments = (await installmentsDue(employeeId, periodOf(cycle.year, cycle.month))).filter(
    (i) => !held.installmentIds.has(String(i.installmentId)),
  );
  const claims = await claimsToReimburse(employeeId, held);

  const computed: IPayrollComputedFigures = {
    arrears: 0,
    advance: 0,
    expense: 0,
    reimbursements: round2(claims.reduce((s, c) => s + c.amount, 0)),
    loanDeduction: round2(loanInstallments.reduce((s, i) => s + i.amount, 0)),
    tds,
  };

  const record: ComputedRecord = {
    earnings,
    deductions,
    employerContributions,
    fullMonthGross,
    // Totals come from the lines, in applyManualAdjustments.
    grossSalary: 0,
    totalDeductions: 0,
    netSalary: 0,
    workingDays: monthDays,
    daysPaid,
    presentDays: tally.present,
    // Whole days of absence, unpaid leave included (as these two always counted).
    absentDays: tally.absent + tally.unpaidLeave,
    lopDays,
    lopAmount: round2(dayRate * lopDays),
    paidLeaveDays: tally.paidLeave,
    weeklyOffDays: tally.weeklyOff,
    unpaidDays: tally.absent + tally.unpaidLeave,
    lateLoginCount: tally.lateLogins,
    paidLeaveBalance: 0, // wire to the leave-balance module later
    overtimeHours,
    overtimeAmount,
    lateDeduction,
    ...computed,
    computed,
    manualAdjustments: { ...(opts.manual ?? {}) },
    settlement: { loanInstallments, claimIds: claims.map((c) => c.id) },
  };
  return applyManualAdjustments(record);
}
