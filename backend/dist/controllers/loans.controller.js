import { z } from 'zod';
import { Loan } from '../models/loan.model.js';
import { Employee } from '../models/employee.model.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationAppError } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { audit } from '../services/audit.service.js';
/** GET /api/v1/loans/me — loans belonging to the calling employee. Auth-only. */
export async function myLoans(_req, res) {
    const userId = getUserId();
    if (!userId) {
        res.json({ success: true, data: [] });
        return;
    }
    const emp = await Employee.findOne({ userId }).select('_id').lean().exec();
    if (!emp) {
        res.json({ success: true, data: [] });
        return;
    }
    const loans = await Loan.find({ employee: emp._id })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    res.json({ success: true, data: loans });
}
const LOAN_TYPES = [
    'salary_advance',
    'personal_loan',
    'emergency',
    'education',
    'medical',
    'other',
];
const LOAN_STATUSES = [
    'pending',
    'approved',
    'rejected',
    'disbursed',
    'active',
    'closed',
    'cancelled',
];
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');
export const createLoanSchema = z.object({
    employee: objectId,
    type: z.enum(LOAN_TYPES).default('personal_loan'),
    principalAmount: z.coerce.number().positive(),
    interestRate: z.coerce.number().min(0).max(100).default(0),
    tenureMonths: z.coerce.number().int().min(1).max(360),
    reason: z.string().optional(),
    startMonth: z.coerce.date().optional(),
    notes: z.string().optional(),
});
export const updateLoanSchema = z.object({
    type: z.enum(LOAN_TYPES).optional(),
    principalAmount: z.coerce.number().positive().optional(),
    interestRate: z.coerce.number().min(0).max(100).optional(),
    tenureMonths: z.coerce.number().int().min(1).max(360).optional(),
    reason: z.string().optional(),
    startMonth: z.coerce.date().optional(),
    notes: z.string().optional(),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    status: z.enum(['pending', 'approved', 'rejected', 'disbursed', 'active', 'closed', 'cancelled']).optional(),
    type: z.enum(LOAN_TYPES).optional(),
    employee: objectId.optional(),
    sort: z.string().optional(),
});
export const approveLoanSchema = z.object({
    notes: z.string().optional(),
});
export const rejectLoanSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required'),
});
export const disburseLoanSchema = z.object({
    disbursedOn: z.coerce.date().optional(),
    startMonth: z.coerce.date().optional(),
});
export const recordPaymentSchema = z.object({
    installmentId: objectId,
    amount: z.coerce.number().positive(),
    paidOn: z.coerce.date().optional(),
    notes: z.string().optional(),
});
/* ──────────────────────────── Helpers ──────────────────────────── */
/**
 * Compute EMI using the standard reducing-balance formula.
 * EMI = P * r * (1+r)^n / ((1+r)^n - 1) where r = monthly rate, n = tenure months.
 * For zero-interest loans (salary advances, etc.) EMI = P / n.
 */
function computeEmi(principal, annualRatePct, tenureMonths) {
    if (annualRatePct <= 0)
        return principal / tenureMonths;
    const r = annualRatePct / 12 / 100;
    const pow = Math.pow(1 + r, tenureMonths);
    return (principal * r * pow) / (pow - 1);
}
function buildSchedule(principal, annualRatePct, tenureMonths, startMonth) {
    const emi = computeEmi(principal, annualRatePct, tenureMonths);
    const monthlyRate = annualRatePct / 12 / 100;
    const schedule = [];
    let balance = principal;
    let totalInterest = 0;
    for (let i = 1; i <= tenureMonths; i++) {
        const interest = balance * monthlyRate;
        let principalPart = emi - interest;
        if (i === tenureMonths) {
            // Last installment absorbs rounding so the schedule clears the balance exactly
            principalPart = balance;
        }
        const due = new Date(startMonth);
        due.setMonth(due.getMonth() + (i - 1));
        const installmentAmount = principalPart + interest;
        schedule.push({
            installmentNumber: i,
            dueDate: due,
            amount: round2(installmentAmount),
            principalAmount: round2(principalPart),
            interestAmount: round2(interest),
            paidAmount: 0,
            paidOn: null,
            status: 'scheduled',
        });
        totalInterest += interest;
        balance -= principalPart;
    }
    return {
        schedule,
        totalInterest: round2(totalInterest),
        totalPayable: round2(principal + totalInterest),
        emi: round2(emi),
    };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
async function nextLoanNumber() {
    const last = await Loan.findOne({ loanNumber: /^LN-/ })
        .sort({ loanNumber: -1 })
        .select('loanNumber')
        .lean()
        .exec();
    const lastNum = last?.loanNumber?.match(/LN-(\d+)/)?.[1];
    const next = lastNum ? Number(lastNum) + 1 : 1;
    return `LN-${String(next).padStart(5, '0')}`;
}
/* ──────────────────────────── Controllers ──────────────────────────── */
/** GET /api/v1/loans */
export async function listLoans(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.status)
        filter.status = q.status;
    if (q.type)
        filter.type = q.type;
    if (q.employee)
        filter.employee = q.employee;
    if (q.search) {
        filter.loanNumber = { $regex: q.search, $options: 'i' };
    }
    const result = await Loan.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: { path: 'employee', select: 'firstName lastName employeeId email profileImage' },
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** GET /api/v1/loans/stats */
export async function loanStats(_req, res) {
    const notDeleted = { isDeleted: { $ne: true } };
    const [total, byStatus, totals] = await Promise.all([
        Loan.countDocuments({}),
        Loan.aggregate([
            { $match: notDeleted },
            { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        Loan.aggregate([
            { $match: { ...notDeleted, status: { $in: ['active', 'disbursed'] } } },
            {
                $group: {
                    _id: null,
                    totalDisbursed: { $sum: '$principalAmount' },
                    totalOutstanding: { $sum: '$outstandingTotal' },
                    totalPaid: { $sum: '$totalPaid' },
                },
            },
        ]),
    ]);
    const statusCounts = {};
    for (const s of LOAN_STATUSES)
        statusCounts[s] = 0;
    for (const r of byStatus)
        statusCounts[r._id] = r.n;
    res.json({
        success: true,
        data: {
            total,
            byStatus: statusCounts,
            totalDisbursed: totals[0]?.totalDisbursed ?? 0,
            totalOutstanding: totals[0]?.totalOutstanding ?? 0,
            totalPaid: totals[0]?.totalPaid ?? 0,
        },
    });
}
/** POST /api/v1/loans */
export async function createLoan(req, res) {
    const body = req.body;
    const loanNumber = await nextLoanNumber();
    const startMonth = body.startMonth ?? nextMonthStart(new Date());
    const { schedule, totalInterest, totalPayable, emi } = buildSchedule(body.principalAmount, body.interestRate, body.tenureMonths, startMonth);
    try {
        const loan = await Loan.create({
            loanNumber,
            employee: body.employee,
            type: body.type,
            principalAmount: body.principalAmount,
            interestRate: body.interestRate,
            tenureMonths: body.tenureMonths,
            emiAmount: emi,
            totalPayable,
            totalInterest,
            reason: body.reason,
            notes: body.notes,
            startMonth,
            installments: schedule,
            outstandingPrincipal: body.principalAmount,
            outstandingTotal: totalPayable,
            totalPaid: 0,
        });
        void audit({ action: 'create', entity: 'Loan', entityId: String(loan._id) });
        res.status(201).json({ success: true, data: loan });
    }
    catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (err.code === 11000) {
            throw new ConflictError('Loan number collision — please retry');
        }
        throw err;
    }
}
/** GET /api/v1/loans/:id */
export async function getLoan(req, res) {
    const loan = await Loan.findById(String(req.params.id))
        .populate('employee', 'firstName lastName employeeId email profileImage')
        .populate('approvedBy', 'firstName lastName')
        .exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    res.json({ success: true, data: loan });
}
/** PATCH /api/v1/loans/:id */
export async function updateLoan(req, res) {
    const body = req.body;
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status !== 'pending') {
        throw new ValidationAppError('Only pending loans can be edited');
    }
    // If any of the schedule-affecting fields changed, rebuild the schedule.
    const principal = body.principalAmount ?? loan.principalAmount;
    const rate = body.interestRate ?? loan.interestRate;
    const tenure = body.tenureMonths ?? loan.tenureMonths;
    const startMonth = body.startMonth ?? loan.startMonth ?? nextMonthStart(new Date());
    const scheduleChanged = body.principalAmount !== undefined ||
        body.interestRate !== undefined ||
        body.tenureMonths !== undefined ||
        body.startMonth !== undefined;
    if (scheduleChanged) {
        const { schedule, totalInterest, totalPayable, emi } = buildSchedule(principal, rate, tenure, startMonth);
        loan.principalAmount = principal;
        loan.interestRate = rate;
        loan.tenureMonths = tenure;
        loan.startMonth = startMonth;
        loan.emiAmount = emi;
        loan.totalPayable = totalPayable;
        loan.totalInterest = totalInterest;
        loan.installments = schedule;
        loan.outstandingPrincipal = principal;
        loan.outstandingTotal = totalPayable;
    }
    if (body.type !== undefined)
        loan.type = body.type;
    if (body.reason !== undefined)
        loan.reason = body.reason;
    if (body.notes !== undefined)
        loan.notes = body.notes;
    await loan.save();
    void audit({ action: 'update', entity: 'Loan', entityId: String(loan._id) });
    res.json({ success: true, data: loan });
}
/** POST /api/v1/loans/:id/approve */
export async function approveLoan(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status !== 'pending') {
        throw new ValidationAppError(`Cannot approve a loan with status "${loan.status}"`);
    }
    loan.status = 'approved';
    loan.approvedBy = req.user._id;
    loan.approvedAt = new Date();
    await loan.save();
    void audit({
        action: 'update',
        entity: 'Loan',
        entityId: String(loan._id),
        metadata: { event: 'approved' },
    });
    res.json({ success: true, data: loan });
}
/** POST /api/v1/loans/:id/reject */
export async function rejectLoan(req, res) {
    const body = req.body;
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status !== 'pending') {
        throw new ValidationAppError(`Cannot reject a loan with status "${loan.status}"`);
    }
    loan.status = 'rejected';
    loan.rejectedReason = body.reason;
    await loan.save();
    void audit({
        action: 'update',
        entity: 'Loan',
        entityId: String(loan._id),
        metadata: { event: 'rejected', reason: body.reason },
    });
    res.json({ success: true, data: loan });
}
/** POST /api/v1/loans/:id/disburse */
export async function disburseLoan(req, res) {
    const body = req.body;
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status !== 'approved') {
        throw new ValidationAppError('Only approved loans can be disbursed');
    }
    loan.status = 'active';
    loan.disbursedOn = body.disbursedOn ?? new Date();
    if (body.startMonth) {
        // Re-sync the schedule if the user changed the start month at disbursement.
        const { schedule, totalInterest, totalPayable, emi } = buildSchedule(loan.principalAmount, loan.interestRate, loan.tenureMonths, body.startMonth);
        loan.startMonth = body.startMonth;
        loan.emiAmount = emi;
        loan.totalInterest = totalInterest;
        loan.totalPayable = totalPayable;
        loan.installments = schedule;
        loan.outstandingTotal = totalPayable;
    }
    await loan.save();
    void audit({ action: 'update', entity: 'Loan', entityId: String(loan._id), metadata: { event: 'disbursed' } });
    res.json({ success: true, data: loan });
}
/** POST /api/v1/loans/:id/payments */
export async function recordPayment(req, res) {
    const body = req.body;
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status !== 'active' && loan.status !== 'disbursed') {
        throw new ValidationAppError('Loan is not in a payable state');
    }
    // Mongoose adds _id to subdocs but the type interface omits it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inst = loan.installments.find((i) => String(i._id) === body.installmentId);
    if (!inst)
        throw new NotFoundError('Installment not found');
    if (inst.status === 'paid') {
        throw new ValidationAppError('This installment is already paid');
    }
    const remaining = round2(inst.amount - inst.paidAmount);
    if (body.amount > remaining + 0.01) {
        throw new ValidationAppError(`Payment exceeds remaining installment amount (₹${remaining.toFixed(2)})`);
    }
    inst.paidAmount = round2(inst.paidAmount + body.amount);
    inst.paidOn = body.paidOn ?? new Date();
    if (body.notes)
        inst.notes = body.notes;
    inst.status = inst.paidAmount >= inst.amount - 0.01 ? 'paid' : 'partial';
    loan.totalPaid = round2(loan.totalPaid + body.amount);
    loan.outstandingTotal = round2(Math.max(0, loan.outstandingTotal - body.amount));
    // Reduce outstanding principal proportionally to the principal share of the EMI.
    const principalShare = inst.amount > 0 ? (inst.principalAmount / inst.amount) * body.amount : body.amount;
    loan.outstandingPrincipal = round2(Math.max(0, loan.outstandingPrincipal - principalShare));
    // Close the loan if every installment is fully paid.
    const allPaid = loan.installments.every((i) => i.status === 'paid');
    if (allPaid) {
        loan.status = 'closed';
        loan.closedAt = new Date();
    }
    await loan.save();
    void audit({
        action: 'update',
        entity: 'Loan',
        entityId: String(loan._id),
        metadata: { event: 'payment', installment: inst.installmentNumber, amount: body.amount },
    });
    res.json({ success: true, data: loan });
}
/** DELETE /api/v1/loans/:id */
export async function deleteLoan(req, res) {
    const loan = await Loan.findById(String(req.params.id)).exec();
    if (!loan)
        throw new NotFoundError('Loan not found');
    if (loan.status === 'active' || loan.status === 'disbursed') {
        throw new ValidationAppError('Cannot delete an active loan — close it first');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loan.softDelete();
    void audit({ action: 'delete', entity: 'Loan', entityId: String(loan._id) });
    res.json({ success: true, message: 'Loan deleted' });
}
/** POST /api/v1/loans/preview-emi — quick EMI calculator without persisting */
export const previewEmiSchema = z.object({
    principalAmount: z.coerce.number().positive(),
    interestRate: z.coerce.number().min(0).max(100).default(0),
    tenureMonths: z.coerce.number().int().min(1).max(360),
});
export async function previewEmi(req, res) {
    const body = req.body;
    const startMonth = nextMonthStart(new Date());
    const { schedule, totalInterest, totalPayable, emi } = buildSchedule(body.principalAmount, body.interestRate, body.tenureMonths, startMonth);
    res.json({
        success: true,
        data: { emi, totalInterest, totalPayable, schedule },
    });
}
function nextMonthStart(d) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return next;
}
//# sourceMappingURL=loans.controller.js.map