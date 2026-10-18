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
import { type IPayrollCycle, type PayrollCycleStatus } from '../models/payroll-cycle.model.js';
import { type IPayrollLine, type IPayrollManualAdjustments } from '../models/payroll-record.model.js';
export type CycleAction = 'process' | 'edit' | 'lock' | 'markPaid' | 'settle' | 'generatePayslips';
/** The statuses each action may start from. */
export declare const CYCLE_ACTION_FROM: Readonly<Record<CycleAction, readonly PayrollCycleStatus[]>>;
/**
 * A `processing` cycle untouched this long is taken to be a crashed run and
 * may be processed again. A live run refreshes `updatedAt` (`touchProcessing`)
 * well inside this window.
 */
export declare const STALE_PROCESSING_MS: number;
type CycleState = Pick<IPayrollCycle, 'status'> & Partial<Pick<IPayrollCycle, 'updatedAt'>>;
/** True when `action` may start from the cycle's current state. */
export declare function isTransitionAllowed(cycle: CycleState, action: CycleAction, now?: number): boolean;
/**
 * Cycles whose payslips employees may see. Before lock the figures can still
 * change (re-process, HR edits), so a processed cycle is HR-only.
 */
export declare const EMPLOYEE_VISIBLE_STATUSES: readonly PayrollCycleStatus[];
/** The 409 `CYCLE_NOT_EDITABLE` error for `action` on a cycle in `status`. */
export declare function cycleNotEditable(status: PayrollCycleStatus, action: CycleAction): AppError;
/** 409 `CYCLE_NOT_EDITABLE` unless `action` is allowed from the cycle's state. */
export declare function assertTransition(cycle: CycleState, action: CycleAction): void;
/**
 * `assertTransition`, then apply `set` only while the cycle is still in a
 * status `action` is allowed from. A request that loses a race to another
 * transition gets the same 409 instead of overwriting it. Returns the
 * updated cycle.
 */
export declare function claimTransition(cycle: CycleState & Pick<IPayrollCycle, '_id'>, action: CycleAction, set: Record<string, unknown>): Promise<IPayrollCycle>;
/** "September 2026" for a cycle, in messages. */
export declare function cycleLabel(cycle: Pick<IPayrollCycle, 'year' | 'month'>): string;
/** Marks a run as alive: refreshes `updatedAt` while the cycle is still `processing`. */
export declare function touchProcessing(cycleId: Types.ObjectId): Promise<void>;
export interface CycleTotals {
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    employeeCount: number;
}
/** Writes the sum of the cycle's records into its totals; returns them. */
export declare function recomputeCycleTotals(cycleId: Types.ObjectId): Promise<CycleTotals>;
/** The money fields HR may override (`manualAdjustments.<field>`). */
export declare const ADJUSTABLE_FIELDS: readonly ["arrears", "advance", "expense", "reimbursements", "loanDeduction", "tds"];
export type AdjustableField = (typeof ADJUSTABLE_FIELDS)[number];
type LineField = 'overtimeAmount' | 'expense' | 'arrears' | 'reimbursements' | 'advance' | 'lateDeduction' | 'loanDeduction';
/**
 * Record fields that print as a line of their own, in display order after
 * the computed salary/statutory lines. A line exists exactly when its field
 * is positive. (TDS is a statutory line and handled separately: an override
 * replaces its amount where it stands.)
 */
export declare const EARNING_FIELD_LINES: ReadonlyArray<{
    field: LineField;
    name: string;
}>;
export declare const DEDUCTION_FIELD_LINES: ReadonlyArray<{
    field: LineField;
    name: string;
}>;
/**
 * A TDS deduction line: typed `tds`, or — on lines written before types — named
 * "TDS". A salary-structure line (it carries a `componentId`) is never one.
 */
export declare function isTdsLine(line: Pick<IPayrollLine, 'name' | 'statutoryType' | 'componentId'>): boolean;
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
/**
 * Applies `record.manualAdjustments` on top of the record's figures:
 *
 * 1. every non-null override (0 included) replaces its field;
 * 2. the field lines (Over Time, Expense, Arrears, Reimbursements / Advance,
 *    Late Deduction, Loan Deduction) are stripped and re-added from the
 *    fields (a structure line of the same name — it has a `componentId` —
 *    stays); the TDS line takes the `tds` override in place (added as
 *    `{ name: 'TDS', statutoryType: 'tds' }` when there is none, dropped at 0);
 * 3. totals are recomputed from the lines.
 *
 * Mutates and returns `record`. Used by both `processCycle` (re-applying
 * overrides to freshly computed records) and `updateRecord`.
 */
export declare function applyManualAdjustments<T extends AdjustableRecord>(record: T): T;
/**
 * Sets (number) or clears (`null`) one override on the record; the caller
 * then runs `applyManualAdjustments`. Clearing puts the field back to its
 * computed value (`record.computed`: the loan EMI due, the approved claims,
 * the declared TDS; 0 for arrears/advance/expense and on records computed
 * before figures were kept) — the same figure re-processing would give.
 */
export declare function setManualAdjustment(record: AdjustableRecord & {
    manualAdjustments: Partial<IPayrollManualAdjustments>;
}, field: AdjustableField, value: number | null): void;
/** True when the record carries any override or note worth carrying across a re-process. */
export declare function hasManualAdjustments(manual: Partial<IPayrollManualAdjustments> | null | undefined): boolean;
export {};
//# sourceMappingURL=payroll-cycle.d.ts.map