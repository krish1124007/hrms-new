import { logger } from '../config/logger.js';
import { assertTransition } from '../lib/payroll-cycle.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { Loan } from '../models/loan.model.js';
import { PayrollRecord } from '../models/payroll-record.model.js';
import { claimValue } from './payroll-compute.service.js';
const round2 = (n) => Math.round(n * 100) / 100;
/** Half a paisa: amounts closer than this are equal. */
const EPSILON = 0.005;
/**
 * Settles every record of a `paid` cycle not settled yet (409
 * `CYCLE_NOT_EDITABLE` for any other status) and marks it
 * `settlement.settledAt`, which releases what it held. Instalments are paid
 * on, and claims reimbursed at, the cycle's `paidAt`; claims get
 * `reimbursementRef` `PAYROLL-<year>-<month>`. Idempotent: returns how much
 * THIS call settled.
 */
export async function settleCycle(cycle) {
    assertTransition(cycle, 'settle');
    const cycleId = cycle._id;
    const paidOn = cycle.paidAt ?? new Date();
    const ref = `PAYROLL-${cycle.year}-${String(cycle.month).padStart(2, '0')}`;
    const records = await PayrollRecord.find({ cycleId })
        .select('loanDeduction reimbursements settlement')
        .lean()
        .exec();
    const result = { installmentsPaid: 0, claimsReimbursed: 0 };
    for (const record of records) {
        if (record.settlement?.settledAt)
            continue;
        result.installmentsPaid += await settleInstallments(record, cycleId, paidOn);
        result.claimsReimbursed += await settleClaims(record, cycleId, paidOn, ref);
        await PayrollRecord.updateOne({ _id: record._id, 'settlement.settledAt': null }, { $set: { 'settlement.settledAt': new Date() } }).exec();
    }
    return result;
}
/* ──────────────────────────────────────────────────────────── */
/* Loan instalments                                              */
/* ──────────────────────────────────────────────────────────── */
const REPAYING_LOANS = ['active', 'disbursed'];
/** How often a payment is re-tried when the loan changed between read and write. */
const MAX_ATTEMPTS = 3;
async function settleInstallments(record, cycleId, paidOn) {
    const items = record.settlement?.loanInstallments ?? [];
    let left = round2(record.loanDeduction ?? 0);
    let paid = 0;
    for (const item of items) {
        if (left <= 0)
            break;
        const share = round2(Math.min(left, item.amount));
        left = round2(left - share);
        if (await payInstallment(item.loanId, item.installmentId, share, cycleId, paidOn))
            paid += 1;
    }
    if (left > EPSILON && items.length > 0) {
        logger.warn({ recordId: String(record._id), unapplied: left }, 'payroll settlement: loan deduction exceeds the instalments it counted; the excess was not applied to a loan');
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
async function payInstallment(loanId, installmentId, share, cycleId, paidOn) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const loan = await Loan.findById(loanId).lean().exec();
        if (!loan)
            return false;
        const inst = loan.installments.find((i) => String(i._id) === String(installmentId));
        if (!inst || inst.status === 'paid' || inst.status === 'skipped')
            return false;
        if (inst.payrollCycleId && String(inst.payrollCycleId) === String(cycleId))
            return false;
        const before = inst.paidAmount ?? 0;
        const pay = round2(Math.min(share, inst.amount - before));
        if (pay <= 0)
            return false;
        const paidAmount = round2(before + pay);
        const status = paidAmount >= inst.amount - 0.01 ? 'paid' : 'partial';
        const principalShare = inst.amount > 0 ? (inst.principalAmount / inst.amount) * pay : pay;
        const closes = status === 'paid' &&
            REPAYING_LOANS.includes(loan.status) &&
            loan.installments.every((i) => i === inst || i.status === 'paid');
        const { modifiedCount } = await Loan.updateOne({
            _id: loanId,
            ...(loan.updatedAt ? { updatedAt: loan.updatedAt } : {}),
            totalPaid: loan.totalPaid,
            installments: {
                $elemMatch: { _id: installmentId, paidAmount: before, status: inst.status, payrollCycleId: { $ne: cycleId } },
            },
        }, {
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
        }).exec();
        if (modifiedCount > 0)
            return true;
    }
    throw new Error(`payroll settlement: loan ${String(loanId)} kept changing while being settled`);
}
/* ──────────────────────────────────────────────────────────── */
/* Expense claims                                                */
/* ──────────────────────────────────────────────────────────── */
async function settleClaims(record, cycleId, paidOn, ref) {
    const ids = record.settlement?.claimIds ?? [];
    if (ids.length === 0)
        return 0;
    const claims = await ExpenseClaim.find({ _id: { $in: ids } })
        .select('status amount acceptedAmount payrollCycleId')
        .lean()
        .exec();
    const byId = new Map(claims.map((c) => [String(c._id), c]));
    let left = round2(record.reimbursements ?? 0);
    let reimbursed = 0;
    for (const id of ids) {
        const claim = byId.get(String(id));
        if (!claim)
            continue;
        const value = claimValue(claim);
        if (claim.status === 'reimbursed') {
            // Settled by an earlier run of this cycle: it still used its share.
            if (claim.payrollCycleId && String(claim.payrollCycleId) === String(cycleId))
                left = round2(left - value);
            continue;
        }
        if (claim.status !== 'approved' || value > left + EPSILON)
            continue;
        const { modifiedCount } = await ExpenseClaim.updateOne({ _id: claim._id, status: 'approved' }, { $set: { status: 'reimbursed', reimbursedAt: paidOn, reimbursementRef: ref, payrollCycleId: cycleId } }).exec();
        left = round2(left - value);
        if (modifiedCount > 0)
            reimbursed += 1;
    }
    if (left > EPSILON) {
        logger.warn({ recordId: String(record._id), unapplied: left }, 'payroll settlement: reimbursements do not match the claims they counted; the remainder was not applied to a claim');
    }
    return reimbursed;
}
//# sourceMappingURL=payroll-settlement.service.js.map