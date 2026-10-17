/**
 * Is an employee still on probation?
 *
 *   • `probationEndDate` set → on probation until that day (on the day itself
 *     they are confirmed).
 *   • no `probationEndDate` → on probation until `confirmationDate`; an
 *     employee with neither date has never been confirmed.
 *
 * Dates are compared as business days, so a date-only value stored at UTC or
 * IST midnight means the day it names.
 */
import type { IEmployee } from '../models/employee.model.js';
import { startOfBusinessDay } from './business-day.js';

export function isOnProbation(
  employee: Pick<Partial<IEmployee>, 'probationEndDate' | 'confirmationDate'>,
  today: Date = new Date(),
): boolean {
  const day = startOfBusinessDay(today).getTime();
  const after = (d: Date): boolean => startOfBusinessDay(d).getTime() > day;
  if (employee.probationEndDate) return after(employee.probationEndDate);
  return !employee.confirmationDate || after(employee.confirmationDate);
}
