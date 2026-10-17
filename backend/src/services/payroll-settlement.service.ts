/**
 * What happens once a payroll cycle has been paid out: the loan instalments
 * its records deducted are paid, the expense claims they reimbursed are
 * reimbursed.
 *
 * Each record lists what it counted (`record.settlement`, written by
 * `computeRecord`); what it actually paid is the record's `loanDeduction` /
 * `reimbursements` after HR's overrides. That amount is applied to the
 * listed items in order:
 *   - instalments: each takes up to the amount counted for it — covered in
 *     full → `paid`, in part → `partial`; an override of 0 pays none;
 *   - claims: reimbursed while the amount still covers the whole claim (a
 *     claim cannot be part-reimbursed); an override of 0 reimburses none.
 * Every write is conditional on the item not having been settled by this
 * cycle (and records the cycle), so settling twice — `markCyclePaid`, then a
 * retry through POST /payroll/cycles/:id/settle — never pays twice. No
 * transactions (standalone Mongo): a failure part-way leaves the rest open
 * for the retry.
 *
 * While a cycle is not yet paid, the items it will settle are held: a manual
 * claim reimbursement or loan payment of the same item is refused
 * (`payrollReimbursingClaim` / `payrollDeductingInstallment`).
 */
import type { Types } from 'mongoose';
import { logger } from '../config/logger.js';
import { assertTransition } from '../lib/payroll-cycle.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { Loan, type LoanStatus } from '../models/loan.model.js';
import { PayrollCycle, type IPayrollCycle } from '../models/payroll-cycle.model.js';
import { PayrollRecord, type IPayrollSettlement } from '../models/payroll-record.model.js';
import { claimValue } from './payroll-compute.service.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Half a paisa: amounts closer than this are equal. */
const EPSILON = 0.005;

export interface SettlementResult {
  /** Instalments paid into (in full or in part) by this call. */
  installmentsPaid: number;
  /** Claims marked reimbursed by this call. */
  claimsReimbursed: number;
}

type SettlingCycle = Pick<IPayrollCycle, '_id' | 'status' | 'year' | 'month' | 'paidAt'>;

interface SettlingRecord {
  _id: unknown;
  loanDeduction?: number;
  reimbursements?: number;
  settlement?: Partial<IPayrollSettlement> | null;
}

/**
 * Settles every record of a `paid` cycle (409 `CYCLE_NOT_EDITABLE` for any
 * other status). Instalments are paid on, and claims reimbursed at, the
 * cycle's `paidAt`; claims get `reimbursementRef` `PAYROLL-<year>-<month>`.
 * Idempotent: returns how much THIS call settled.
 */
export async function settleCycle(cycle: SettlingCycle): Promise<SettlementResult> {
  assertTransition(cycle, 'settle');
  const cycleId = cycle._id as Types.ObjectId;
  const paidOn = cycle.paidAt ?? new Date();
  const ref = `PAYROLL-${cycle.year}-${String(cycle.month).padStart(2, '0')}`;

  const records = await PayrollRecord.find({ cycleId })
    .select('loanDeduction reimbursements settlement')
    .lean<SettlingRecord[]>()
    .exec();
  const result: SettlementResult = { installmentsPaid: 0, claimsReimbursed: 0 };
  for (const record of records) {
    result.installmentsPaid += await settleInstallments(record, cycleId, paidOn);
    result.claimsReimbursed += await settleClaims(record, cycleId, paidOn, ref);
  }
  return result;
}

/* ──────────────────────────────────────────────────────────── */
/* Loan instalments                                              */
/* ──────────────────────────────────────────────────────────── */

const REPAYING_LOANS: LoanStatus[] = ['active', 'disbursed'];
/** How often a payment is re-tried when the loan changed between read and write. */
const MAX_ATTEMPTS = 3;

async function settleInstallments(record: SettlingRecord, cycleId: Types.ObjectId, paidOn: Date): Promise<number> {
  const items = record.settlement?.loanInstallments ?? [];
  let left = round2(record.loanDeduction ?? 0);
  let paid = 0;
  for (const item of items) {
    if (left <= 0) break;
    const share = round2(Math.min(left, item.amount));
    left = round2(left - share);
    if (await payInstallment(item.loanId, item.installmentId, share, cycleId, paidOn)) paid += 1;
  }
  if (left > EPSILON && items.length > 0) {
    logger.warn(
      { recordId: String(record._id), unapplied: left },
      'payroll settlement: loan deduction exceeds the instalments it counted; the excess was not applied to a loan',
    );
  }
  return paid;
}

/**
 * Pays `share` into one instalment for the cycle — unless it is already paid,
 * skipped, or was settled by this cycle. Updates the loan's totals as
 * `recordPayment` does and closes the loan when nothing is left to pay. The
 * write is a compare-and-set on the loan as read, re-tried when it changed
 * meanwhile. Returns whether it paid.
 */
async function payInstallment(
  loanId: Types.ObjectId,
  installmentId: Types.ObjectId,
  share: number,
  cycleId: Types.ObjectId,
  paidOn: Date,
): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const loan = await Loan.findById(loanId).lean().exec();
    if (!loan) return false;
    const inst = loan.installments.find((i) => String(i._id) === String(installmentId));
    if (!inst || inst.status === 'paid' || inst.status === 'skipped') return false;
    if (inst.payrollCycleId && String(inst.payrollCycleId) === String(cycleId)) return false;

    const before = inst.paidAmount ?? 0;
    const pay = round2(Math.min(share, inst.amount - before));
    if (pay <= 0) return false;
    const paidAmount = round2(before + pay);
    const status = paidAmount >= inst.amount - 0.01 ? 'paid' : 'partial';
    const principalShare = inst.amount > 0 ? (inst.principalAmount / inst.amount) * pay : pay;
    const closes =
      status === 'paid' &&
      REPAYING_LOANS.includes(loan.status) &&
      loan.installments.every((i) => i === inst || i.status === 'paid');

    const { modifiedCount } = await Loan.updateOne(
      {
        _id: loanId,
        ...(loan.updatedAt ? { updatedAt: loan.updatedAt } : {}),
        totalPaid: loan.totalPaid,
        installments: {
          $elemMatch: { _id: installmentId, paidAmount: before, status: inst.status, payrollCycleId: { $ne: cycleId } },
        },
      },
      {
        $set: {
          'installments.$.paidAmount': paidAmount,
          'installments.$.status': status,
          'installments.$.paidOn': paidOn,
          'installments.$.payrollCycleId': cycleId,
          totalPaid: round2(loan.totalPaid + pay),
          outstandingTotal: closes ? 0 : round2(Math.max(0, loan.outstandingTotal - pay)),
          outstandingPrincipal: closes ? 0 : round2(Math.max(0, loan.outstandingPrincipal - principalShare)),
          ...(closes ? { status: 'closed', closedAt: paidOn } : {}),
        },
      },
    ).exec();
    if (modifiedCount > 0) return true;
  }
  throw new Error(`payroll settlement: loan ${String(loanId)} kept changing while being settled`);
}

/* ──────────────────────────────────────────────────────────── */
/* Expense claims                                                */
/* ──────────────────────────────────────────────────────────── */

async function settleClaims(
  record: SettlingRecord,
  cycleId: Types.ObjectId,
  paidOn: Date,
  ref: string,
): Promise<number> {
  const ids = record.settlement?.claimIds ?? [];
  if (ids.length === 0) return 0;
  const claims = await ExpenseClaim.find({ _id: { $in: ids } })
    .select('status amount acceptedAmount payrollCycleId')
    .lean()
    .exec();
  const byId = new Map(claims.map((c) => [String(c._id), c]));

  let left = round2(record.reimbursements ?? 0);
  let reimbursed = 0;
  for (const id of ids) {
    const claim = byId.get(String(id));
    if (!claim) continue;
    const value = claimValue(claim);
    if (claim.status === 'reimbursed') {
      // Settled by an earlier run of this cycle: it still used its share.
      if (claim.payrollCycleId && String(claim.payrollCycleId) === String(cycleId)) left = round2(left - value);
      continue;
    }
    if (claim.status !== 'approved' || value > left + EPSILON) continue;

    const { modifiedCount } = await ExpenseClaim.updateOne(
      { _id: claim._id, status: 'approved' },
      { $set: { status: 'reimbursed', reimbursedAt: paidOn, reimbursementRef: ref, payrollCycleId: cycleId } },
    ).exec();
    left = round2(left - value);
    if (modifiedCount > 0) reimbursed += 1;
  }
  return reimbursed;
}

/* ──────────────────────────────────────────────────────────── */
/* Items held by an unpaid cycle                                 */
/* ──────────────────────────────────────────────────────────── */

/** The first cycle not yet paid among those with a record matching `filter`. */
async function unpaidCycleWith(filter: Record<string, unknown>): Promise<Pick<IPayrollCycle, 'year' | 'month'> | null> {
  const cycleIds = await PayrollRecord.find(filter).distinct('cycleId').exec();
  if (cycleIds.length === 0) return null;
  return PayrollCycle.findOne({ _id: { $in: cycleIds }, status: { $ne: 'paid' } })
    .select('year month')
    .lean<Pick<IPayrollCycle, 'year' | 'month'>>()
    .exec();
}

/**
 * The unpaid cycle that will reimburse this claim when it is paid out — a
 * record counted it and pays reimbursements — or `null`.
 */
export function payrollReimbursingClaim(claimId: Types.ObjectId): Promise<Pick<IPayrollCycle, 'year' | 'month'> | null> {
  return unpaidCycleWith({ 'settlement.claimIds': claimId, reimbursements: { $gt: 0 } });
}

/**
 * The unpaid cycle that will pay into this loan instalment when it is paid
 * out — a record counted it and makes a loan deduction — or `null`.
 */
export function payrollDeductingInstallment(
  installmentId: Types.ObjectId,
): Promise<Pick<IPayrollCycle, 'year' | 'month'> | null> {
  return unpaidCycleWith({ 'settlement.loanInstallments.installmentId': installmentId, loanDeduction: { $gt: 0 } });
}

/** "September 2026" for a cycle, in messages. */
export function cycleLabel(cycle: Pick<IPayrollCycle, 'year' | 'month'>): string {
  const name = new Date(Date.UTC(cycle.year, cycle.month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${name} ${cycle.year}`;
}
