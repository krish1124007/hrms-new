/**
 * Is an employee still on probation? The first date that is set decides:
 *
 *   1. `probationEndDate` → on probation until that day;
 *   2. else `confirmationDate` → on probation until that day;
 *   3. else `joiningDate` + `DEFAULT_PROBATION_MONTHS` → on probation until then.
 *
 * "Until" is exclusive: on the end day itself the employee is confirmed. So
 * an employee with neither date (every imported record) who joined more than
 * six months ago is not on probation.
 *
 * Month arithmetic clamps to the end of a shorter month: joining on 31 Aug
 * ends probation on 28 Feb (29 Feb in a leap year), never rolling over into
 * March.
 *
 * Dates are compared as business days, so a date-only value stored at UTC or
 * IST midnight means the day it names.
 */
import type { IEmployee } from '../models/employee.model.js';
export declare const DEFAULT_PROBATION_MONTHS = 6;
/**
 * The day label `months` calendar months after the business day `date`
 * falls on, clamped to the last day of the target month when it is shorter.
 */
export declare function addBusinessMonths(date: Date, months: number): Date;
export declare function isOnProbation(employee: Pick<Partial<IEmployee>, 'probationEndDate' | 'confirmationDate' | 'joiningDate'>, today?: Date): boolean;
//# sourceMappingURL=probation.d.ts.map