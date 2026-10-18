/**
 * What an employee's exit does beyond their own status.
 *
 * Whether HR exits someone on the spot (`PATCH /employees/:id/status`) or the
 * day-close applies an exit scheduled for a past day (`applyScheduledExits`),
 * the same three things follow:
 *   • approved leave starting after the exit day is cancelled through the one
 *     cancellation path (`cancelAndReleaseLeave`) — its attendance rows go,
 *     its days are refunded — because nobody takes leave from a job they have
 *     left;
 *   • their login is deactivated;
 *   • HR (everyone holding `employees.update`) gets one in-app notice saying
 *     which assets to collect and which loans are still open.
 */
import type { Types } from 'mongoose';
import { Asset } from '../models/asset.model.js';
import type { ExitStatus, IEmployee } from '../models/employee.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { Loan } from '../models/loan.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { cancelAndReleaseLeave } from './leave-attendance.service.js';
import { createNotification, formatBusinessDate } from './notification.service.js';

/** Statuses that end employment. */
export const EXIT_STATUSES: readonly ExitStatus[] = ['resigned', 'terminated', 'inactive'];

export const isExitStatus = (status: string): status is ExitStatus =>
  (EXIT_STATUSES as readonly string[]).includes(status);

/** Most HR users one exit notifies. */
const MAX_HR_RECIPIENTS = 50;
/** Most assets / loans one notice lists by name. */
const MAX_LISTED = 20;

export const EXIT_CANCEL_REASON = 'Employee exited';

type ExitingEmployee = Pick<IEmployee, '_id' | 'firstName' | 'lastName' | 'employeeId'> & {
  userId?: Types.ObjectId | null;
};

/**
 * Cancel (and release) every approved leave of the employee that starts after
 * `day` (a day label), and deactivate their login. Idempotent, so a failed
 * exit can simply be run again. Returns how many requests were cancelled.
 */
export async function releaseOnExit(employee: ExitingEmployee, day: Date): Promise<number> {
  // Coarse pre-filter; the exact business-day comparison follows, so a
  // start stored at UTC or IST midnight is read as the day it names.
  const candidates = await LeaveRequest.find({
    employeeId: employee._id,
    status: 'approved',
    startDate: { $gte: day },
  }).exec();
  let cancelled = 0;
  for (const leave of candidates) {
    if (startOfBusinessDay(leave.startDate).getTime() <= day.getTime()) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await cancelAndReleaseLeave(leave, { cancelReason: EXIT_CANCEL_REASON })) cancelled += 1;
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
export async function hrRecipients(): Promise<Types.ObjectId[]> {
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
  return users.map((u) => u._id as Types.ObjectId);
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function listed(items: string[], total: number): string {
  const more = total > items.length ? ` and ${total - items.length} more` : '';
  return `${items.join(', ')}${more}`;
}

/**
 * Tell HR the employee has left, listing the assets assigned to them and
 * their loans that are not closed. One notice per HR user; never throws for a
 * notice that could not be written (`createNotification` logs it).
 */
export async function notifyHrOfExit(
  employee: ExitingEmployee,
  status: ExitStatus,
  exitDay: Date,
  recipients?: Types.ObjectId[],
): Promise<void> {
  const to = (recipients ?? (await hrRecipients())).filter(
    (id) => !employee.userId || String(id) !== String(employee.userId),
  );
  if (to.length === 0) return;

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
  if (assetCount === 0 && loanCount === 0) parts.push('No assigned assets or open loans.');

  await Promise.all(
    to.map((userId) =>
      createNotification({
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
      }),
    ),
  );
}
