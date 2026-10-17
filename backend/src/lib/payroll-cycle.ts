/**
 * The lifecycle around payroll records — not the salary maths.
 *
 *   draft ─process─▶ processing ─▶ processed ─lock─▶ locked ─markPaid─▶ paid
 *                                    ▲     │
 *                                    └─────┘ process (re-run), edit records
 *
 * - `assertTransition` / `claimTransition`: which actions each status allows
 *   (409 `CYCLE_NOT_EDITABLE` otherwise). `claimTransition` also moves the
 *   cycle with a compare-and-set on its status, so two concurrent requests
 *   cannot both pass the check (no transactions on standalone Mongo). A
 *   cycle left in `processing` by a crashed run may be processed again once
 *   it has been untouched for `STALE_PROCESSING_MS`; a live run keeps it
 *   fresh with `touchProcessing`.
 * - `applyManualAdjustments`: HR overrides sit in `record.manualAdjustments`
 *   on top of the computed figures. Applying them writes each override into
 *   its field, rebuilds the lines those fields show as, and recomputes the
 *   record totals from the lines — the line arrays are the single source the
 *   payslip prints, so gross = Σ earnings, deductions = Σ deduction lines.
 * - `recomputeCycleTotals`: the cycle's totals are the sum of its records.
 */
import type { Types } from 'mongoose';
import { AppError } from './errors.js';
import {
  PayrollCycle,
  type IPayrollCycle,
  type PayrollCycleStatus,
} from '../models/payroll-cycle.model.js';
import {
  PayrollRecord,
  type IPayrollLine,
  type IPayrollManualAdjustments,
} from '../models/payroll-record.model.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/* ──────────────────────────────────────────────────────────── */
/* State machine                                                 */
/* ──────────────────────────────────────────────────────────── */

export type CycleAction = 'process' | 'edit' | 'lock' | 'markPaid' | 'settle' | 'generatePayslips';

/** The statuses each action may start from. */
export const CYCLE_ACTION_FROM: Readonly<Record<CycleAction, readonly PayrollCycleStatus[]>> = {
  process: ['draft', 'processed'],
  edit: ['draft', 'processed'],
  lock: ['processed'],
  markPaid: ['locked'],
  // Loans and claims settle once the money has gone out (and again on a retry).
  settle: ['paid'],
  // Never while `processing`: the records are being replaced.
  generatePayslips: ['processed', 'locked', 'paid'],
};

/**
 * A `processing` cycle untouched this long is taken to be a crashed run and
 * may be processed again. A live run refreshes `updatedAt` (`touchProcessing`)
 * well inside this window.
 */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

type CycleState = Pick<IPayrollCycle, 'status'> & Partial<Pick<IPayrollCycle, 'updatedAt'>>;

/** True when `action` may start from the cycle's current state. */
export function isTransitionAllowed(cycle: CycleState, action: CycleAction, now = Date.now()): boolean {
  if (CYCLE_ACTION_FROM[action].includes(cycle.status)) return true;
  return (
    action === 'process' &&
    cycle.status === 'processing' &&
    !!cycle.updatedAt &&
    now - cycle.updatedAt.getTime() > STALE_PROCESSING_MS
  );
}

/**
 * Cycles whose payslips employees may see. Before lock the figures can still
 * change (re-process, HR edits), so a processed cycle is HR-only.
 */
export const EMPLOYEE_VISIBLE_STATUSES: readonly PayrollCycleStatus[] = ['locked', 'paid'];

const ACTION_PAST: Record<CycleAction, string> = {
  process: 'processed',
  edit: 'edited',
  lock: 'locked',
  markPaid: 'marked paid',
  settle: 'settled',
  generatePayslips: 'given payslips',
};

/** The 409 `CYCLE_NOT_EDITABLE` error for `action` on a cycle in `status`. */
export function cycleNotEditable(status: PayrollCycleStatus, action: CycleAction): AppError {
  return new AppError(
    `A ${status} payroll cycle cannot be ${ACTION_PAST[action]}`,
    409,
    'CYCLE_NOT_EDITABLE',
  );
}

/** 409 `CYCLE_NOT_EDITABLE` unless `action` is allowed from the cycle's state. */
export function assertTransition(cycle: CycleState, action: CycleAction): void {
  if (!isTransitionAllowed(cycle, action)) throw cycleNotEditable(cycle.status, action);
}

/**
 * `assertTransition`, then apply `set` only while the cycle is still in a
 * status `action` is allowed from. A request that loses a race to another
 * transition gets the same 409 instead of overwriting it. Returns the
 * updated cycle.
 */
export async function claimTransition(
  cycle: CycleState & Pick<IPayrollCycle, '_id'>,
  action: CycleAction,
  set: Record<string, unknown>,
): Promise<IPayrollCycle> {
  assertTransition(cycle, action);
  const allowed: Array<Record<string, unknown>> = [{ status: { $in: CYCLE_ACTION_FROM[action] } }];
  if (action === 'process') {
    allowed.push({ status: 'processing', updatedAt: { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } });
  }
  // The update refreshes `updatedAt` (timestamps), so a taken-over run is fresh again.
  const updated = await PayrollCycle.findOneAndUpdate(
    { _id: cycle._id, $or: allowed },
    { $set: set },
    { new: true },
  ).exec();
  if (!updated) {
    const now = await PayrollCycle.findById(cycle._id).select('status').lean().exec();
    throw cycleNotEditable(now?.status ?? cycle.status, action);
  }
  return updated;
}

/** Marks a run as alive: refreshes `updatedAt` while the cycle is still `processing`. */
export async function touchProcessing(cycleId: Types.ObjectId): Promise<void> {
  await PayrollCycle.updateOne({ _id: cycleId, status: 'processing' }, { $set: { status: 'processing' } }).exec();
}

/* ──────────────────────────────────────────────────────────── */
/* Cycle totals                                                  */
/* ──────────────────────────────────────────────────────────── */

export interface CycleTotals {
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  employeeCount: number;
}

/** Writes the sum of the cycle's records into its totals; returns them. */
export async function recomputeCycleTotals(cycleId: Types.ObjectId): Promise<CycleTotals> {
  const records = await PayrollRecord.find({ cycleId })
    .select('grossSalary totalDeductions netSalary')
    .lean()
    .exec();
  const total = (pick: (r: (typeof records)[number]) => number): number =>
    round2(records.reduce((s, r) => s + (pick(r) || 0), 0));
  const totals: CycleTotals = {
    totalGross: total((r) => r.grossSalary),
    totalDeductions: total((r) => r.totalDeductions),
    totalNet: total((r) => r.netSalary),
    employeeCount: records.length,
  };
  await PayrollCycle.updateOne({ _id: cycleId }, { $set: totals }).exec();
  return totals;
}

/* ──────────────────────────────────────────────────────────── */
/* Manual adjustments                                            */
/* ──────────────────────────────────────────────────────────── */

/** The money fields HR may override (`manualAdjustments.<field>`). */
export const ADJUSTABLE_FIELDS = [
  'arrears',
  'advance',
  'expense',
  'reimbursements',
  'loanDeduction',
  'tds',
] as const;
export type AdjustableField = (typeof ADJUSTABLE_FIELDS)[number];

type LineField =
  | 'overtimeAmount'
  | 'expense'
  | 'arrears'
  | 'reimbursements'
  | 'advance'
  | 'lateDeduction'
  | 'loanDeduction';

/**
 * Record fields that print as a line of their own, in display order after
 * the computed salary/statutory lines. A line exists exactly when its field
 * is positive. (TDS is a statutory line and handled separately: an override
 * replaces its amount where it stands.)
 */
export const EARNING_FIELD_LINES: ReadonlyArray<{ field: LineField; name: string }> = [
  { field: 'overtimeAmount', name: 'Over Time' },
  { field: 'expense', name: 'Expense' },
  { field: 'arrears', name: 'Arrears' },
  { field: 'reimbursements', name: 'Reimbursements' },
];
export const DEDUCTION_FIELD_LINES: ReadonlyArray<{ field: LineField; name: string }> = [
  { field: 'advance', name: 'Advance' },
  { field: 'lateDeduction', name: 'Late Deduction' },
  { field: 'loanDeduction', name: 'Loan Deduction' },
];

/** A TDS deduction line: typed `tds`, or — on lines written before types — named "TDS". */
export function isTdsLine(line: Pick<IPayrollLine, 'name' | 'statutoryType'>): boolean {
  if (line.statutoryType) return line.statutoryType === 'tds';
  return line.name.trim().toUpperCase() === 'TDS';
}

/** The parts of a payroll record (document or plain object) adjustments touch. */
export interface AdjustableRecord extends Record<LineField | AdjustableField, number> {
  earnings: IPayrollLine[];
  deductions: IPayrollLine[];
  manualAdjustments?: Partial<IPayrollManualAdjustments> | null;
  /** The computed figures under the overrides (what clearing an override goes back to). */
  computed?: Partial<Record<AdjustableField, number>> | null;
  grossSalary: number;
  totalDeductions: number;
  netSalary: number;
}

/** Plain copy of a line (Mongoose subdocuments included), without empty keys. */
function copyLine(line: IPayrollLine): IPayrollLine {
  const out: IPayrollLine = { name: line.name, amount: round2(line.amount || 0) };
  if (line.componentId) out.componentId = line.componentId;
  if (line.statutoryType) out.statutoryType = line.statutoryType;
  return out;
}

/**
 * Applies `record.manualAdjustments` on top of the record's figures:
 *
 * 1. every non-null override (0 included) replaces its field;
 * 2. the field lines (Over Time, Expense, Arrears, Reimbursements / Advance,
 *    Late Deduction, Loan Deduction) are stripped and re-added from the
 *    fields; the TDS line takes the `tds` override in place (added as
 *    `{ name: 'TDS', statutoryType: 'tds' }` when there is none, dropped at 0);
 * 3. totals are recomputed from the lines.
 *
 * Mutates and returns `record`. Used by both `processCycle` (re-applying
 * overrides to freshly computed records) and `updateRecord`.
 */
export function applyManualAdjustments<T extends AdjustableRecord>(record: T): T {
  const manual = record.manualAdjustments ?? {};
  for (const field of ADJUSTABLE_FIELDS) {
    const value = manual[field];
    if (value !== null && value !== undefined) record[field] = round2(value);
  }

  // Earnings: computed lines, then one line per positive field.
  const earningNames = new Set(EARNING_FIELD_LINES.map((l) => l.name));
  const earnings = record.earnings.filter((l) => !earningNames.has(l.name)).map(copyLine);
  for (const { field, name } of EARNING_FIELD_LINES) {
    const amount = round2(record[field] || 0);
    if (amount > 0) earnings.push({ name, amount });
  }

  // Deductions: computed lines with TDS kept in its place, then field lines.
  const deductionNames = new Set(DEDUCTION_FIELD_LINES.map((l) => l.name));
  const base = record.deductions.filter((l) => !deductionNames.has(l.name)).map(copyLine);
  const tdsAt = base.findIndex(isTdsLine);
  const tdsTemplate = tdsAt >= 0 ? base[tdsAt]! : undefined;
  const deductions = base.filter((l) => !isTdsLine(l));
  if ((manual.tds === null || manual.tds === undefined) && tdsTemplate) {
    // Not overridden: the computed TDS line is the figure.
    record.tds = round2(base.filter(isTdsLine).reduce((s, l) => s + l.amount, 0));
  }
  const tds = round2(record.tds || 0);
  if (tds > 0) {
    const tdsLine: IPayrollLine = { ...(tdsTemplate ?? { name: 'TDS' }), amount: tds, statutoryType: 'tds' };
    deductions.splice(tdsAt >= 0 ? tdsAt : deductions.length, 0, tdsLine);
  }
  for (const { field, name } of DEDUCTION_FIELD_LINES) {
    const amount = round2(record[field] || 0);
    if (amount > 0) deductions.push({ name, amount });
  }

  record.earnings = earnings;
  record.deductions = deductions;
  record.grossSalary = round2(earnings.reduce((s, l) => s + l.amount, 0));
  record.totalDeductions = round2(deductions.reduce((s, l) => s + l.amount, 0));
  record.netSalary = round2(record.grossSalary - record.totalDeductions);
  return record;
}

/**
 * Sets (number) or clears (`null`) one override on the record; the caller
 * then runs `applyManualAdjustments`. Clearing puts the field back to its
 * computed value (`record.computed`: the loan EMI due, the approved claims,
 * the declared TDS; 0 for arrears/advance/expense and on records computed
 * before figures were kept) — the same figure re-processing would give.
 */
export function setManualAdjustment(
  record: AdjustableRecord & { manualAdjustments: Partial<IPayrollManualAdjustments> },
  field: AdjustableField,
  value: number | null,
): void {
  // Stored exactly as applied, so the override always equals the field.
  record.manualAdjustments[field] = value === null ? null : round2(value);
  if (value === null) {
    record[field] = round2(record.computed?.[field] ?? 0);
    // The TDS line is rebuilt from the field (it is not a field line).
    if (field === 'tds') record.deductions = record.deductions.filter((l) => !isTdsLine(l));
  }
}

/** True when the record carries any override or note worth carrying across a re-process. */
export function hasManualAdjustments(manual: Partial<IPayrollManualAdjustments> | null | undefined): boolean {
  if (!manual) return false;
  return ADJUSTABLE_FIELDS.some((f) => manual[f] !== null && manual[f] !== undefined) || !!manual.note;
}
