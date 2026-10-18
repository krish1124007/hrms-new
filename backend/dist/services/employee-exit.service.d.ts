/**
 * What an employee's exit does beyond their own status.
 *
 * Whether HR exits someone on the spot (`PATCH /employees/:id/status`) or the
 * day-close applies an exit scheduled for a past day (`applyScheduledExits`),
 * the same three things follow:
 *   • approved leave starting after the exit day is cancelled through the one
 *     cancellation path (`cancelAndReleaseLeave`) — its attendance rows go,
 *     its days are refunded — because nobody takes leave from a job they have
 *     left; pending leave starting after it is rejected ("Employee exited");
 *   • their login is deactivated;
 *   • HR (everyone holding `employees.update`) gets one in-app notice saying
 *     which assets to collect and which loans are still open.
 */
import type { Types } from 'mongoose';
import type { ExitStatus, IEmployee } from '../models/employee.model.js';
/** Statuses that end employment. */
export declare const EXIT_STATUSES: readonly ExitStatus[];
export declare const isExitStatus: (status: string) => status is ExitStatus;
export declare const EXIT_CANCEL_REASON = "Employee exited";
type ExitingEmployee = Pick<IEmployee, '_id' | 'firstName' | 'lastName' | 'employeeId'> & {
    userId?: Types.ObjectId | null;
};
/**
 * Cancel (and release) every approved leave of the employee that starts after
 * `day` (a day label), reject every pending one that does (reason
 * "Employee exited" — nobody should approve leave from a job already left),
 * and deactivate their login. Idempotent, so a failed exit can simply be run
 * again. Returns how many approved requests were cancelled.
 */
export declare function releaseOnExit(employee: ExitingEmployee, day: Date): Promise<number>;
/**
 * The active users who hold `employees.update` — through their role or
 * their own custom permissions, `*` included — at most {@link MAX_HR_RECIPIENTS}.
 */
export declare function hrRecipients(): Promise<Types.ObjectId[]>;
/**
 * Tell HR the employee has left, listing the assets assigned to them and
 * their loans that are not closed. One notice per HR user; never throws for a
 * notice that could not be written (`createNotification` logs it).
 */
export declare function notifyHrOfExit(employee: ExitingEmployee, status: ExitStatus, exitDay: Date, recipients?: Types.ObjectId[]): Promise<void>;
export {};
//# sourceMappingURL=employee-exit.service.d.ts.map