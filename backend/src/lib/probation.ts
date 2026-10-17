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
import { startOfBusinessDay } from './business-day.js';

export const DEFAULT_PROBATION_MONTHS = 6;

/**
 * The day label `months` calendar months after the business day `date`
 * falls on, clamped to the last day of the target month when it is shorter.
 */
export function addBusinessMonths(date: Date, months: number): Date {
  const day = startOfBusinessDay(date);
  const target = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, 1));
  const lastOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day.getUTCDate(), lastOfTarget));
  return target;
}

export function isOnProbation(
  employee: Pick<Partial<IEmployee>, 'probationEndDate' | 'confirmationDate' | 'joiningDate'>,
  today: Date = new Date(),
): boolean {
  const day = startOfBusinessDay(today).getTime();
  const after = (d: Date): boolean => startOfBusinessDay(d).getTime() > day;
  if (employee.probationEndDate) return after(employee.probationEndDate);
  if (employee.confirmationDate) return after(employee.confirmationDate);
  if (!employee.joiningDate) return false;
  return addBusinessMonths(employee.joiningDate, DEFAULT_PROBATION_MONTHS).getTime() > day;
}
