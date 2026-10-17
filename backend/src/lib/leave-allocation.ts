/**
 * The one rule for how many days of a leave type's annual allowance an
 * employee is allocated for a year, and the one test for "that row already
 * exists". Pure — no models — so the leave-year service (opening a year) and
 * the leave-attendance service (first use of a balance) share it without
 * importing each other.
 */
import { startOfBusinessDay } from './business-day.js';

/**
 * The days of `daysAllowed` an employee who joined on `joiningDate` is
 * allocated for `year`:
 *   • joined before the year → the full allowance;
 *   • joined in January → the full allowance (12/12);
 *   • joined later in the year → `daysAllowed × (12 − joiningMonthIndex) / 12`,
 *     the joining month counting in full, rounded half-up to 0.5 day;
 *   • joined after the year → 0.
 * The joining month is read in the business timezone.
 */
export function proRataAllocation(daysAllowed: number, joiningDate: Date, year: number): number {
  const joined = startOfBusinessDay(joiningDate);
  const joinedYear = joined.getUTCFullYear();
  if (joinedYear < year) return daysAllowed;
  if (joinedYear > year) return 0;
  const monthsLeft = 12 - joined.getUTCMonth();
  if (monthsLeft === 12) return daysAllowed;
  return Math.round((daysAllowed * monthsLeft * 2) / 12) / 2;
}

/** Is `err` MongoDB's duplicate-key error (E11000)? */
export const isDuplicateKey = (err: unknown): boolean => (err as { code?: number } | null)?.code === 11000;
