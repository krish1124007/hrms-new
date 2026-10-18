import { Types } from 'mongoose';
import { z } from 'zod';
import { LeaveType, LeaveBalance, LeaveRequest, Employee, User } from '../models/index.js';
import { NotFoundError, ValidationAppError, ForbiddenError, AppError } from '../lib/errors.js';
import { assertNotSelfApproval, assertOwnOrPermission, currentEmployeeId, hasPermission, } from '../lib/access.js';
import { assertCanDecide, assertOwnOrCanDecide, canSeeAll, isApprover, scopeFilter, scopeFilterFor, } from '../lib/approvals.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { isSameBusinessDay, startOfBusinessDay } from '../lib/business-day.js';
import { isOnProbation } from '../lib/probation.js';
import { logger } from '../config/logger.js';
import { availableBalance, cancelAndReleaseLeave, chargeLeaveBalance, ensureLeaveBalance, isUnpaidLeaveType, leaveWorkingDays, leaveYear, refundLeaveBalance, stampLeaveDays, unstampLeaveDays, } from '../services/leave-attendance.service.js';
import { formatLeaveDates, leaveDecisionEmail, notifyLeaveDecision, notifyLeaveRequest, reportingManagerUserId, } from '../services/notification.service.js';
import { sendMail } from '../services/email.service.js';
import { LeaveYearIncompleteError, allocateLeaveType, openLeaveYear } from '../services/leave-year.service.js';
// ---------- Helpers ----------
export { isUnpaidLeaveType };
async function getCurrentEmployee() {
    const userId = getUserId();
    if (!userId)
        return null;
    return Employee.findOne({ userId: new Types.ObjectId(userId) }).exec();
}
const SELF_APPROVAL_MESSAGE = 'You cannot approve or reject your own leave';
const DECIDED_MEANWHILE = 'This request was decided or withdrawn meanwhile — reload and try again';
/** 409: the request moved on between our read and our write (the code regularization uses too). */
const decidedMeanwhile = () => new AppError(DECIDED_MEANWHILE, 409, 'DECIDED_MEANWHILE');
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');
/**
 * The rules a leave type sets on who may take it and how. Checked on every
 * application, including one HR files on an employee's behalf — they are
 * about the employee, not the person filing.
 */
export function validateLeaveTypeRules(leaveType, employee, body, today = new Date()) {
    if (leaveType.isActive === false) {
        throw new ValidationAppError(`${leaveType.name} is no longer available`);
    }
    if (leaveType.applicableGender && leaveType.applicableGender !== 'all' && employee.gender !== leaveType.applicableGender) {
        throw new ValidationAppError(`${leaveType.name} is only available to ${leaveType.applicableGender} employees`);
    }
    // Unpaid leave costs the company nothing, so probation never bars it.
    if (leaveType.probationAllowed === false && !isUnpaidLeaveType(leaveType) && isOnProbation(employee, today)) {
        throw new ValidationAppError(`${leaveType.name} is not available during probation`);
    }
    if (body.isHalfDay && leaveType.halfDayAllowed === false) {
        throw new ValidationAppError(`${leaveType.name} cannot be taken as a half day`);
    }
    if (leaveType.attachmentRequired && !body.attachments?.length) {
        throw new ValidationAppError(`${leaveType.name} requires a supporting attachment`);
    }
}
/** Tell the applicant's reporting manager about a new application. Never throws. */
async function notifyReportingManager(emp, leaveType, doc) {
    try {
        const managerUserId = await reportingManagerUserId(emp);
        if (!managerUserId)
            return;
        await notifyLeaveRequest(managerUserId, `${emp.firstName} ${emp.lastName}`, leaveType.name, formatLeaveDates(doc.startDate, doc.endDate), { leaveRequestId: String(doc._id) });
    }
    catch (err) {
        logger.warn({ err, leaveRequestId: String(doc._id) }, 'leave: manager notification failed');
    }
}
/** Tell the employee their request was decided — in-app and by e-mail. Never throws. */
async function notifyEmployeeOfDecision(doc, status, leaveType, reason) {
    try {
        const emp = await Employee.findById(doc.employeeId).setOptions({ withDeleted: true }).select('userId').lean().exec();
        if (!emp?.userId)
            return;
        const decision = {
            status,
            leaveTypeName: leaveType?.name ?? 'leave',
            startDate: doc.startDate,
            endDate: doc.endDate,
            link: '/leaves',
            reason,
            leaveRequestId: String(doc._id),
        };
        await notifyLeaveDecision(String(emp.userId), decision);
        const user = await User.findById(emp.userId).select('email firstName').lean().exec();
        if (user?.email)
            void sendMail({ to: user.email, ...leaveDecisionEmail(user.firstName ?? '', decision) });
    }
    catch (err) {
        logger.warn({ err, leaveRequestId: String(doc._id) }, 'leave: decision notification failed');
    }
}
// ---------- Leave Type ----------
export const createLeaveTypeSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    daysAllowed: z.coerce.number().min(0),
    carryForward: z
        .object({
        enabled: z.boolean().default(false),
        maxDays: z.coerce.number().min(0).default(0),
    })
        .default({ enabled: false, maxDays: 0 }),
    encashable: z.boolean().default(false),
    paidLeave: z.boolean().default(true),
    applicableGender: z.enum(['all', 'male', 'female']).default('all'),
    probationAllowed: z.boolean().default(true),
    halfDayAllowed: z.boolean().default(true),
    attachmentRequired: z.boolean().default(false),
    color: z.string().default('#3b82f6'),
    isActive: z.boolean().default(true),
});
export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
export const leaveTypeQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    isActive: z.coerce.boolean().optional(),
});
export async function listLeaveTypes(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (typeof q.isActive === 'boolean')
        filter.isActive = q.isActive;
    const result = await LeaveType.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: 'name',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createLeaveType(req, res) {
    const body = req.body;
    const doc = await LeaveType.create(body);
    void audit({ action: 'create', entity: 'LeaveType', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function getLeaveType(req, res) {
    const doc = await LeaveType.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave type not found');
    res.json({ success: true, data: doc });
}
export async function updateLeaveType(req, res) {
    const doc = await LeaveType.findByIdAndUpdate(String(req.params.id), req.body, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Leave type not found');
    void audit({ action: 'update', entity: 'LeaveType', entityId: String(doc._id) });
    res.json({ success: true, data: doc });
}
export async function deleteLeaveType(req, res) {
    const doc = await LeaveType.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave type not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    void audit({ action: 'delete', entity: 'LeaveType', entityId: String(doc._id) });
    res.json({ success: true, message: 'Leave type deleted' });
}
// ---------- Leave Balance ----------
export const balanceQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    employeeId: objectId.optional(),
    leaveTypeId: z.string().optional(),
    year: z.coerce.number().int().optional(),
});
export const allocateBalanceSchema = z.object({
    employeeIds: z.array(z.string()).min(1),
    leaveTypeId: z.string(),
    year: z.coerce.number().int(),
    allocated: z.coerce.number().min(0),
});
export const adjustBalanceSchema = z.object({
    delta: z.coerce.number(),
    reason: z.string().optional(),
});
export async function listLeaveBalances(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // HR sees every employee; a manager their direct reports and themselves;
    // everyone else only their own. (No employee record matches nothing.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = await scopeFilterFor(req, 'leaves', q.employeeId);
    if (q.leaveTypeId)
        filter.leaveTypeId = new Types.ObjectId(q.leaveTypeId);
    if (q.year)
        filter.year = q.year;
    const result = await LeaveBalance.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: '-year',
        populate: [
            { path: 'employeeId', select: 'firstName lastName employeeId' },
            { path: 'leaveTypeId', select: 'name code color paidLeave' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myLeaveBalances(req, res) {
    const employee = await getCurrentEmployee();
    if (!employee)
        throw new NotFoundError('Employee profile not found');
    const year = Number(req.query.year ?? leaveYear(new Date()));
    // Get all active leave types
    const types = await LeaveType.find({ isActive: true }).lean().exec();
    // Get existing balances for this employee and year
    const existingBalances = await LeaveBalance.find({ employeeId: employee._id, year })
        .populate('leaveTypeId', 'name code color paidLeave')
        .lean()
        .exec();
    // Merge: for each type, if no balance exists, create a virtual 0 balance
    const list = types.map((t) => {
        const existing = existingBalances.find((b) => String(typeof b.leaveTypeId === 'object' ? b.leaveTypeId._id : b.leaveTypeId) === String(t._id));
        const unpaid = isUnpaidLeaveType(t);
        if (existing) {
            if (typeof existing.leaveTypeId === 'object' && existing.leaveTypeId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                existing.leaveTypeId.paidLeave = !unpaid;
            }
            return existing;
        }
        return {
            _id: `virtual_${t._id}`,
            employeeId: employee._id,
            leaveTypeId: {
                _id: t._id,
                name: t.name,
                code: t.code,
                color: t.color,
                paidLeave: !unpaid,
            },
            year,
            allocated: 0,
            used: 0,
            carried: 0,
            adjusted: 0,
            balance: 0,
        };
    });
    res.json({ success: true, data: list });
}
export async function allocateLeaveBalances(req, res) {
    const body = req.body;
    const ops = body.employeeIds.map((eid) => ({
        updateOne: {
            filter: {
                employeeId: new Types.ObjectId(eid),
                leaveTypeId: new Types.ObjectId(body.leaveTypeId),
                year: body.year,
            },
            update: { $set: { allocated: body.allocated } },
            upsert: true,
        },
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await LeaveBalance.bulkWrite(ops);
    void audit({ action: 'update', entity: 'LeaveBalance', after: { count: ops.length } });
    res.json({ success: true, data: { matched: result.matchedCount, upserted: result.upsertedCount } });
}
export async function adjustLeaveBalance(req, res) {
    const body = req.body;
    const doc = await LeaveBalance.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave balance not found');
    doc.adjusted = (doc.adjusted ?? 0) + body.delta;
    await doc.save();
    void audit({
        action: 'update',
        entity: 'LeaveBalance',
        entityId: String(doc._id),
        after: { delta: body.delta, reason: body.reason },
    });
    res.json({ success: true, data: doc });
}
/**
 * `year` is bounded to 2000–2100 and no further ahead than next year (in the
 * business timezone), so a typo cannot allocate 2072. The upper bound is
 * judged per request, not when the module loads.
 */
export const openYearSchema = z
    .object({
    year: z.coerce.number().int().min(2000).max(2100),
})
    .superRefine(({ year }, ctx) => {
    const latest = leaveYear(new Date()) + 1;
    if (year > latest) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['year'],
            message: `year cannot be later than ${latest}`,
        });
    }
});
/**
 * Open a leave year: create the balances still missing (pro-rated for
 * mid-year joiners) and carry the previous year's unused days forward.
 * Idempotent — nothing already set is overwritten — so HR can run it again
 * after adding an employee or leave type, or after a failed run.
 *
 * Audited whatever the outcome: a run that stops part way records the
 * progress it made (and how many employees failed), one that never started
 * records the error.
 */
export async function openLeaveYearBalances(req, res) {
    const { year } = req.body;
    const outcome = { openYear: year, completed: false };
    try {
        const counts = await openLeaveYear(year);
        Object.assign(outcome, counts, { completed: true });
        res.json({ success: true, data: counts });
    }
    catch (err) {
        if (err instanceof LeaveYearIncompleteError) {
            Object.assign(outcome, err.counts, { failed: err.failed });
        }
        else {
            outcome.error = err instanceof Error ? err.message : String(err);
        }
        throw err;
    }
    finally {
        void audit({ action: 'update', entity: 'LeaveBalance', after: outcome });
    }
}
export const resetBalanceSchema = z.object({
    year: z.coerce.number().int(),
    leaveTypeId: z.string().optional(),
});
export async function resetLeaveBalances(req, res) {
    const body = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { year: body.year };
    if (body.leaveTypeId) {
        filter.leaveTypeId = new Types.ObjectId(body.leaveTypeId);
    }
    const result = await LeaveBalance.updateMany(filter, {
        // `allocated` and `adjusted` are HR's figures and stay; the year's usage
        // and carry-forward are what is cleared.
        $set: { used: 0, carried: 0 },
    }).exec();
    void audit({
        action: 'update',
        entity: 'LeaveBalance',
        after: { resetYear: body.year, modifiedCount: result.modifiedCount },
    });
    res.json({ success: true, data: { modifiedCount: result.modifiedCount } });
}
// ---------- Leave Request ----------
export const createLeaveRequestSchema = z.object({
    employeeId: objectId.optional(), // optional — defaults to current employee
    leaveTypeId: z.string(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isHalfDay: z.boolean().default(false),
    halfDayType: z.enum(['first_half', 'second_half']).optional(),
    reason: z.string().min(1),
    attachments: z
        .array(z.object({
        name: z.string(),
        fileUrl: z.string().url(),
    }))
        .default([]),
});
export const leaveRequestQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
    employeeId: objectId.optional(),
    leaveTypeId: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.string().optional(),
});
export const rejectLeaveSchema = z.object({
    reason: z.string().min(1),
});
/** Optional for the owner withdrawing their own request; HR must give one. */
export const cancelLeaveSchema = z
    .object({
    reason: z.string().trim().min(3).optional(),
})
    .default({});
export async function listLeaveRequests(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // HR sees every employee; a manager their direct reports and themselves;
    // everyone else only their own. (No employee record matches nothing.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = await scopeFilterFor(req, 'leaves', q.employeeId);
    if (q.status)
        filter.status = q.status;
    if (q.leaveTypeId)
        filter.leaveTypeId = new Types.ObjectId(q.leaveTypeId);
    if (q.from || q.to) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const range = {};
        if (q.from)
            range.$gte = q.from;
        if (q.to)
            range.$lte = q.to;
        filter.startDate = range;
    }
    const result = await LeaveRequest.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'employeeId', select: 'firstName lastName employeeId' },
            { path: 'leaveTypeId', select: 'name code color' },
            { path: 'approvedBy', select: 'firstName lastName email' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myLeaveRequests(req, res) {
    const employee = await getCurrentEmployee();
    if (!employee)
        throw new NotFoundError('Employee profile not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const result = await LeaveRequest.paginate({ employeeId: employee._id }, {
        page: Number(q.page ?? 1),
        limit: Number(q.limit ?? 20),
        sort: '-createdAt',
        populate: [{ path: 'leaveTypeId', select: 'name code color' }],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function teamLeaveRequests(req, res) {
    const manager = await getCurrentEmployee();
    if (!manager)
        throw new NotFoundError('Employee profile not found');
    const team = await Employee.find({ reportingManager: manager._id }).select('_id').lean().exec();
    const teamIds = team.map((t) => t._id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { employeeId: { $in: teamIds } };
    if (q.status)
        filter.status = q.status;
    const result = await LeaveRequest.paginate(filter, {
        page: Number(q.page ?? 1),
        limit: Number(q.limit ?? 20),
        sort: '-createdAt',
        populate: [
            { path: 'employeeId', select: 'firstName lastName employeeId' },
            { path: 'leaveTypeId', select: 'name code color' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/**
 * Fields of other people's leave that every employee may see on the shared
 * calendar: who is off, when and for how long. The reason, attachments
 * (often medical certificates) and approval trail are for approvers only.
 */
const CALENDAR_PUBLIC_FIELDS = '_id employeeId leaveTypeId startDate endDate days isHalfDay status';
export async function leaveCalendar(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = q.to ? new Date(q.to) : new Date(from.getFullYear(), from.getMonth() + 1, 0);
    const inRange = {
        status: { $in: ['approved', 'pending'] },
        startDate: { $lte: to },
        endDate: { $gte: from },
    };
    const detailed = (filter) => LeaveRequest.find(filter)
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('leaveTypeId', 'name code color')
        .lean()
        .exec();
    // `color` is presentation only — the calendar paints each leave type with it.
    const publicOnly = (filter) => LeaveRequest.find(filter)
        .select(CALENDAR_PUBLIC_FIELDS)
        .populate('employeeId', 'firstName lastName')
        .populate('leaveTypeId', 'name color')
        .lean()
        .exec();
    let list;
    if (canSeeAll(req, 'leaves')) {
        list = await detailed(inRange);
    }
    else if (isApprover(req, 'leaves')) {
        // A manager sees the full request for their reports (and themselves) and
        // the shared-calendar view of everybody else.
        const scope = await scopeFilter(req, 'leaves');
        const [mine, others] = await Promise.all([
            detailed({ ...inRange, ...scope }),
            publicOnly({ ...inRange, $nor: [scope] }),
        ]);
        list = [...mine, ...others];
    }
    else {
        list = await publicOnly(inRange);
    }
    res.json({ success: true, data: list });
}
/**
 * Whose leave this application is: the caller's own, unless a `leaves.update`
 * holder (HR) is applying on someone else's behalf.
 */
async function resolveApplicant(req, requested) {
    const me = await currentEmployeeId(req);
    if (requested && !(me && me.equals(requested))) {
        if (!hasPermission(req.user, 'leaves.update')) {
            throw new ForbiddenError('You can only apply for your own leave');
        }
        return new Types.ObjectId(requested);
    }
    if (!me)
        throw new NotFoundError('Employee profile not found');
    return me;
}
export async function applyLeave(req, res) {
    const body = req.body;
    const employeeId = await resolveApplicant(req, body.employeeId);
    if (body.endDate < body.startDate) {
        throw new ValidationAppError('endDate must be on or after startDate');
    }
    // Balances are per year: one request must draw on one year's balance.
    if (leaveYear(body.startDate) !== leaveYear(body.endDate)) {
        throw new ValidationAppError('Leave spanning two years must be applied separately per year');
    }
    if (body.isHalfDay && !isSameBusinessDay(body.startDate, body.endDate)) {
        throw new ValidationAppError('Half day leave must be on a single date');
    }
    const emp = await Employee.findById(employeeId).populate('shift').exec();
    if (!emp)
        throw new NotFoundError('Employee not found');
    const leaveType = await LeaveType.findById(body.leaveTypeId).exec();
    if (!leaveType)
        throw new ValidationAppError('Invalid leave type');
    validateLeaveTypeRules(leaveType, emp, body);
    // Counted with the same working-day verdict approval stamps attendance with.
    const workingDays = (await leaveWorkingDays(body.startDate, body.endDate, emp)).length;
    const days = body.isHalfDay && workingDays > 0 ? workingDays - 0.5 : workingDays;
    if (days <= 0) {
        throw new ValidationAppError('Selected range has no working days');
    }
    const overlap = await LeaveRequest.findOne({
        employeeId,
        status: { $in: ['pending', 'approved'] },
        startDate: { $lte: body.endDate },
        endDate: { $gte: body.startDate },
    }).exec();
    if (overlap) {
        throw new ValidationAppError('Overlapping leave request exists for this period');
    }
    const isUnpaid = isUnpaidLeaveType(leaveType);
    if (isUnpaid && leaveType.paidLeave !== false) {
        leaveType.paidLeave = false;
        await leaveType.save().catch(() => { });
    }
    // The balance row is allocated on first use, so HR need not open the year
    // before employees apply — pro-rated to when they joined, exactly as
    // opening the year would have. Unpaid leave has no allocation: its row just
    // records `used`.
    const year = leaveYear(body.startDate);
    const balanceKey = { employeeId, leaveTypeId: leaveType._id, year };
    if (isUnpaid) {
        await ensureLeaveBalance(balanceKey, leaveType);
    }
    else {
        await allocateLeaveType(emp, leaveType, year);
        if (!(await LeaveBalance.exists(balanceKey))) {
            throw new ValidationAppError(`${leaveType.name} has no annual allocation — please contact HR to set one`);
        }
        // Days already asked for and still pending are spoken for.
        const { remaining, pending } = await availableBalance(employeeId, balanceKey.leaveTypeId, year);
        const available = remaining - pending;
        if (days > available) {
            const pendingNote = pending > 0 ? `; ${pending} day(s) already pending` : '';
            throw new AppError(`Insufficient leave balance (available: ${available}, requested: ${days}${pendingNote})`, 400, 'INSUFFICIENT_BALANCE');
        }
    }
    const doc = await LeaveRequest.create({
        employeeId,
        leaveTypeId: leaveType._id,
        startDate: body.startDate,
        endDate: body.endDate,
        days,
        isHalfDay: body.isHalfDay,
        halfDayType: body.halfDayType,
        reason: body.reason,
        attachments: body.attachments.map((a) => ({ ...a, uploadedAt: new Date() })),
        status: 'pending',
        appliedAt: new Date(),
    });
    void audit({ action: 'create', entity: 'LeaveRequest', entityId: String(doc._id) });
    await notifyReportingManager(emp, leaveType, doc);
    res.status(201).json({ success: true, data: doc });
}
export async function getLeaveRequest(req, res) {
    const doc = await LeaveRequest.findById(String(req.params.id))
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('leaveTypeId', 'name code color')
        .populate('approvedBy', 'firstName lastName email')
        .exec();
    if (!doc)
        throw new NotFoundError('Leave request not found');
    await assertOwnOrCanDecide(req, doc.employeeId, 'leaves');
    res.json({ success: true, data: doc });
}
/** `approvedBy` / `approvedAt` for a decision made now by the caller. */
function decidedNow() {
    const userId = getUserId();
    return { ...(userId ? { approvedBy: new Types.ObjectId(userId) } : {}), approvedAt: new Date() };
}
/**
 * Undo an approval whose attendance stamping failed: take the rows back, and
 * return the request to `pending` with its days refunded. Only the side that
 * moves the request back refunds — a cancel that won meanwhile already did.
 * A rollback step that fails is logged with the stamping error that caused
 * it; the caller rethrows that original error.
 */
async function rollBackApproval(approved, cause) {
    const requestId = String(approved._id);
    try {
        await unstampLeaveDays(approved);
    }
    catch (err) {
        logger.error({ err, cause, requestId }, 'leave approve rollback: unstamping failed');
    }
    try {
        const reverted = await LeaveRequest.updateOne({ _id: approved._id, status: 'approved' }, { $set: { status: 'pending' }, $unset: { approvedBy: 1, approvedAt: 1 } }).exec();
        if (reverted.modifiedCount > 0)
            await refundLeaveBalance(approved);
    }
    catch (err) {
        logger.error({ err, cause, requestId }, 'leave approve rollback: reverting to pending / refunding failed — the request may stay approved and charged');
    }
}
/**
 * Approve: charge the balance, then the request, then its attendance — each
 * step undone if a later one fails, since there is no transaction to roll
 * back.
 */
export async function approveLeaveRequest(req, res) {
    const doc = await LeaveRequest.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave request not found');
    await assertNotSelfApproval(req, doc.employeeId, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, doc.employeeId, 'leaves');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot approve a ${doc.status} request`);
    }
    const [leaveType, employee] = await Promise.all([
        // A since-deleted type still decides whether its leave is paid.
        LeaveType.findById(doc.leaveTypeId).setOptions({ withDeleted: true }).exec(),
        Employee.findById(doc.employeeId).setOptions({ withDeleted: true }).populate('shift').exec(),
    ]);
    if (!employee)
        throw new NotFoundError('Employee not found');
    // 1. Atomic: `used` moves only if the balance still covers the request.
    await chargeLeaveBalance(doc, leaveType);
    // 2. Only one decision on a pending request wins.
    const approved = await LeaveRequest.findOneAndUpdate({ _id: doc._id, status: 'pending' }, { $set: { status: 'approved', ...decidedNow() } }, { new: true }).exec();
    if (!approved) {
        await refundLeaveBalance(doc);
        throw decidedMeanwhile();
    }
    // 3. The attendance payroll reads.
    let stamped;
    try {
        stamped = await stampLeaveDays(approved, leaveType, employee);
    }
    catch (err) {
        await rollBackApproval(approved, err);
        throw err;
    }
    // A cancel or delete may have landed while the rows were being written,
    // and its unstamping may have run before ours finished: take back anything
    // still tagged to the request. (Its refund is the canceller's to make.)
    const current = await LeaveRequest.findById(approved._id).select('status').lean().exec();
    if (current?.status !== 'approved') {
        await unstampLeaveDays(approved);
        throw decidedMeanwhile();
    }
    // The calendar or shift changed since the request was counted.
    const expected = Math.ceil(approved.days);
    if (stamped !== expected) {
        logger.warn({ requestId: String(approved._id), expected, stamped }, 'leave approve: stamped days differ from the days charged');
    }
    void audit({ action: 'update', entity: 'LeaveRequest', entityId: String(doc._id), after: { status: 'approved' } });
    await notifyEmployeeOfDecision(approved, 'approved', leaveType);
    res.json({ success: true, data: approved });
}
export async function rejectLeaveRequest(req, res) {
    const body = req.body;
    const doc = await LeaveRequest.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave request not found');
    await assertNotSelfApproval(req, doc.employeeId, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, doc.employeeId, 'leaves');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot reject a ${doc.status} request`);
    }
    const rejected = await LeaveRequest.findOneAndUpdate({ _id: doc._id, status: 'pending' }, { $set: { status: 'rejected', rejectedReason: body.reason, ...decidedNow() } }, { new: true }).exec();
    if (!rejected)
        throw decidedMeanwhile();
    void audit({ action: 'update', entity: 'LeaveRequest', entityId: String(doc._id), after: { status: 'rejected' } });
    const leaveType = await LeaveType.findById(doc.leaveTypeId).setOptions({ withDeleted: true }).exec();
    await notifyEmployeeOfDecision(rejected, 'rejected', leaveType, body.reason);
    res.json({ success: true, data: rejected });
}
/**
 * Cancel a request and, if it was approved, release its attendance rows and
 * charged days (`cancelAndReleaseLeave`). 409 `DECIDED_MEANWHILE` when it was
 * decided or withdrawn meanwhile.
 */
async function cancelAndRelease(doc, set = {}) {
    const cancelled = await cancelAndReleaseLeave(doc, set);
    if (!cancelled)
        throw decidedMeanwhile();
    return cancelled;
}
/**
 * Cancel. The owner may withdraw a pending request at any time, and an
 * approved one only until the day it starts — taken leave is not refundable
 * on the employee's say-so. HR (`leaves.update`) may cancel anyone else's
 * request at any time, with a reason. Cancelling an approved request removes
 * its attendance rows and refunds its days.
 */
export async function cancelLeaveRequest(req, res) {
    const body = (req.body ?? {});
    const doc = await LeaveRequest.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave request not found');
    await assertOwnOrPermission(req, doc.employeeId, 'leaves.update');
    if (doc.status === 'cancelled' || doc.status === 'rejected') {
        throw new ValidationAppError(`Cannot cancel a ${doc.status} request`);
    }
    const me = await currentEmployeeId(req);
    const isOwner = me !== null && me.equals(doc.employeeId);
    const started = startOfBusinessDay(doc.startDate).getTime() <= startOfBusinessDay(new Date()).getTime();
    if (isOwner && doc.status === 'approved' && started) {
        throw new ForbiddenError('Leave that has already started cannot be withdrawn — ask HR to cancel it');
    }
    if (!isOwner && !body.reason) {
        throw new ValidationAppError("A reason (at least 3 characters) is required to cancel someone else's leave");
    }
    const cancelled = await cancelAndRelease(doc, body.reason ? { cancelReason: body.reason } : {});
    void audit({
        action: 'update',
        entity: 'LeaveRequest',
        entityId: String(doc._id),
        after: { status: 'cancelled', ...(body.reason ? { reason: body.reason } : {}) },
    });
    res.json({ success: true, data: cancelled });
}
export async function deleteLeaveRequest(req, res) {
    const doc = await LeaveRequest.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Leave request not found');
    // An approved request takes its attendance rows and charged days with it.
    // Claiming it first means two concurrent deletes refund once.
    let status = doc.status;
    if (status === 'approved') {
        await cancelAndRelease(doc);
        status = 'cancelled';
    }
    // Soft-delete only if the request is still in the state just read: an
    // approval landing meanwhile (charged days, stamped rows) must not end up
    // under a deleted request nobody can cancel.
    const userId = getUserId();
    const deleted = await LeaveRequest.findOneAndUpdate({ _id: doc._id, status }, {
        $set: {
            isDeleted: true,
            deletedAt: new Date(),
            ...(userId ? { deletedBy: new Types.ObjectId(userId) } : {}),
        },
    }).exec();
    if (!deleted)
        throw decidedMeanwhile();
    void audit({ action: 'delete', entity: 'LeaveRequest', entityId: String(doc._id) });
    res.json({ success: true, message: 'Leave request deleted and balance restored' });
}
// ---------- Reports ----------
export async function leaveReports(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const year = Number(q.year ?? new Date().getFullYear());
    const [byStatus, byType, totalDays] = await Promise.all([
        LeaveRequest.aggregate([
            { $match: { startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) } } },
            { $group: { _id: '$status', n: { $sum: 1 }, days: { $sum: '$days' } } },
        ]),
        LeaveRequest.aggregate([
            {
                $match: {
                    status: 'approved',
                    startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) },
                },
            },
            { $group: { _id: '$leaveTypeId', days: { $sum: '$days' } } },
            { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 'leaveType' } },
            { $unwind: { path: '$leaveType', preserveNullAndEmptyArrays: true } },
            { $project: { leaveTypeId: '$_id', name: '$leaveType.name', color: '$leaveType.color', days: 1, _id: 0 } },
        ]),
        LeaveRequest.aggregate([
            {
                $match: {
                    status: 'approved',
                    startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) },
                },
            },
            { $group: { _id: null, days: { $sum: '$days' } } },
        ]),
    ]);
    res.json({
        success: true,
        data: { year, byStatus, byType, totalApprovedDays: totalDays[0]?.days ?? 0 },
    });
}
//# sourceMappingURL=leaves.controller.js.map