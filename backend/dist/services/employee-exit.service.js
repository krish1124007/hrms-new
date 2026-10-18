import { Asset } from '../models/asset.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { Loan } from '../models/loan.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { cancelAndReleaseLeave } from './leave-attendance.service.js';
import { createNotification, formatBusinessDate } from './notification.service.js';
/** Statuses that end employment. */
export const EXIT_STATUSES = ['resigned', 'terminated', 'inactive'];
export const isExitStatus = (status) => EXIT_STATUSES.includes(status);
/** Most HR users one exit notifies. */
const MAX_HR_RECIPIENTS = 50;
/** Most assets / loans one notice lists by name. */
const MAX_LISTED = 20;
export const EXIT_CANCEL_REASON = 'Employee exited';
/**
 * Cancel (and release) every approved leave of the employee that starts after
 * `day` (a day label), reject every pending one that does (reason
 * "Employee exited" — nobody should approve leave from a job already left),
 * and deactivate their login. Idempotent, so a failed exit can simply be run
 * again. Returns how many approved requests were cancelled.
 */
export async function releaseOnExit(employee, day) {
    // Coarse pre-filter; the exact business-day comparison follows, so a
    // start stored at UTC or IST midnight is read as the day it names.
    const candidates = await LeaveRequest.find({
        employeeId: employee._id,
        status: { $in: ['approved', 'pending'] },
        startDate: { $gte: day },
    }).exec();
    const afterExit = candidates.filter((l) => startOfBusinessDay(l.startDate).getTime() > day.getTime());
    const pendingIds = afterExit.filter((l) => l.status === 'pending').map((l) => l._id);
    if (pendingIds.length > 0) {
        // Conditional on still pending: one decided meanwhile keeps its decision.
        await LeaveRequest.updateMany({ _id: { $in: pendingIds }, status: 'pending' }, { $set: { status: 'rejected', rejectedReason: EXIT_CANCEL_REASON, approvedAt: new Date() } }).exec();
    }
    let cancelled = 0;
    for (const leave of afterExit) {
        if (leave.status !== 'approved')
            continue;
        // eslint-disable-next-line no-await-in-loop
        if (await cancelAndReleaseLeave(leave, { cancelReason: EXIT_CANCEL_REASON }))
            cancelled += 1;
    }
    if (employee.userId) {
        await User.updateOne({ _id: employee.userId }, { $set: { status: 'inactive' } }).exec();
    }
    return cancelled;
}
/**
 * The active users who hold `employees.update` — through their role or
 * their own custom permissions, `*` included — at most {@link MAX_HR_RECIPIENTS}.
 */
export async function hrRecipients() {
    const granting = ['employees.update', '*'];
    const roles = await Role.find({ permissions: { $in: granting } }).select('_id').lean().exec();
    const users = await User.find({
        status: 'active',
        $or: [{ role: { $in: roles.map((r) => r._id) } }, { customPermissions: { $in: granting } }],
    })
        .select('_id')
        .limit(MAX_HR_RECIPIENTS)
        .lean()
        .exec();
    return users.map((u) => u._id);
}
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
function listed(items, total) {
    const more = total > items.length ? ` and ${total - items.length} more` : '';
    return `${items.join(', ')}${more}`;
}
/**
 * Tell HR the employee has left, listing the assets assigned to them and
 * their loans that are not closed. One notice per HR user; never throws for a
 * notice that could not be written (`createNotification` logs it).
 */
export async function notifyHrOfExit(employee, status, exitDay, recipients) {
    const to = (recipients ?? (await hrRecipients())).filter((id) => !employee.userId || String(id) !== String(employee.userId));
    if (to.length === 0)
        return;
    const [assets, assetCount, loans, loanCount] = await Promise.all([
        Asset.find({ assignedTo: employee._id }).select('name assetCode').limit(MAX_LISTED).lean().exec(),
        Asset.countDocuments({ assignedTo: employee._id }).exec(),
        Loan.find({ employee: employee._id, status: { $nin: ['closed', 'rejected', 'cancelled'] } })
            .select('loanNumber status outstandingTotal')
            .limit(MAX_LISTED)
            .lean()
            .exec(),
        Loan.countDocuments({ employee: employee._id, status: { $nin: ['closed', 'rejected', 'cancelled'] } }).exec(),
    ]);
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    const parts = [`${name} (${employee.employeeId}) exited on ${formatBusinessDate(exitDay)} (${status}).`];
    if (assetCount > 0) {
        parts.push(`Assets to recover: ${listed(assets.map((a) => `${a.name} (${a.assetCode})`), assetCount)}.`);
    }
    if (loanCount > 0) {
        const described = loans.map((l) => `${l.loanNumber} — ${l.status}, ${inr.format(l.outstandingTotal ?? 0)} outstanding`);
        parts.push(`Open loans: ${listed(described, loanCount)}.`);
    }
    if (assetCount === 0 && loanCount === 0)
        parts.push('No assigned assets or open loans.');
    await Promise.all(to.map((userId) => createNotification({
        userId: String(userId),
        type: 'system_alert',
        title: `Employee exit: ${name}`,
        message: parts.join(' '),
        link: `/employees/${String(employee._id)}`,
        metadata: {
            event: 'employee_exit',
            employeeId: String(employee._id),
            status,
            assets: assets.map((a) => ({ id: String(a._id), name: a.name, assetCode: a.assetCode })),
            loans: loans.map((l) => ({ id: String(l._id), loanNumber: l.loanNumber, status: l.status, outstandingTotal: l.outstandingTotal })),
        },
    })));
}
//# sourceMappingURL=employee-exit.service.js.map