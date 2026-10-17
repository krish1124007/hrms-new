/**
 * Statutory payroll rules — Provident Fund, ESI and Professional Tax.
 *
 * Pure functions: the caller supplies the wages and the rates/ceilings come
 * from `env` (overridable per call, so tests can pass their own).
 *
 *  - PF is a percentage of the wage EARNED (basic + DA, pro-rated for loss of
 *    pay) up to a ceiling.
 *  - ESI eligibility is decided on the full-month gross, once per contribution
 *    period (Apr–Sep, Oct–Mar) and then kept until the period ends — a raise
 *    mid-period does not drop the employee out. The contribution is on the
 *    earned gross.
 *  - Professional Tax depends on the state, the month and (Maharashtra) the
 *    employee's gender; see `config/professional-tax.ts`.
 */
import { env } from '../config/env.js';
import { resolvePtStateCode } from '../config/professional-tax.js';
import type { IEmployeeStatutory } from '../models/employee.model.js';

export { professionalTax, resolvePtStateCode } from '../config/professional-tax.js';
export type { ProfessionalTaxInput, PtGender } from '../config/professional-tax.js';

/** The rates and ceilings the rules read; `env` satisfies it. */
export interface StatutoryConfig {
  PF_WAGE_CEILING: number;
  PF_RATE_PERCENT: number;
  ESI_WAGE_CEILING: number;
  ESI_EMPLOYEE_PERCENT: number;
  ESI_EMPLOYER_PERCENT: number;
}

/**
 * `amount × percent / 100` as a count of paise, rounded to the nearest paisa.
 * Done on integers (paise × percent in 1/10,000ths) so that 0.75% of 20,500
 * is exactly 153.75 and not 153.74999… — which matters when ESI rounds up.
 */
function scaledPercentOf(amount: number, percent: number): number {
  const paise = Math.round(amount * 100);
  const percentUnits = Math.round(percent * 10_000);
  return paise * percentUnits; // rupees × 10⁸
}

/** Rupees to the paisa from a `scaledPercentOf` result. */
const toRupees = (scaled: number): number => Math.round(scaled / 1e6) / 100;

/* ──────────────────────────────────────────────────────────── */
/* Provident Fund                                                */
/* ──────────────────────────────────────────────────────────── */

/**
 * Employee PF: the rate on the earned basic + DA, up to the wage ceiling
 * (12% of at most 15,000 by default, i.e. never more than 1,800).
 */
export function pfEmployee(earnedBasicPlusDa: number, cfg: StatutoryConfig = env): number {
  if (!(earnedBasicPlusDa > 0)) return 0;
  const wage = Math.min(earnedBasicPlusDa, cfg.PF_WAGE_CEILING);
  return toRupees(scaledPercentOf(wage, cfg.PF_RATE_PERCENT));
}

/**
 * Employer PF: same wage and rate as the employee's (the Group's policy is the
 * 12% alone — EDLI and admin charges are not bundled in).
 */
export function pfEmployer(earnedBasicPlusDa: number, cfg: StatutoryConfig = env): number {
  return pfEmployee(earnedBasicPlusDa, cfg);
}

/* ──────────────────────────────────────────────────────────── */
/* ESI                                                           */
/* ──────────────────────────────────────────────────────────── */

/**
 * The ESI contribution period a date falls in: `'YYYY-H1'` for April–September
 * and `'YYYY-H2'` for October–March, named for the year the period began
 * (February 2027 is `'2026-H2'`). Reads the date in UTC, so pass a UTC date
 * (`new Date(Date.UTC(year, month - 1, 1))`) for a payroll month.
 */
export function esiPeriodKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1–12
  if (month >= 4 && month <= 9) return `${year}-H1`;
  return month >= 10 ? `${year}-H2` : `${year - 1}-H2`;
}

export interface EsiEligibility {
  eligible: boolean;
  /** True when the decision is new for this period: the caller saves it as `employee.statutory`. */
  persist: boolean;
}

/**
 * Whether ESI applies to the employee for the contribution period `periodKey`.
 * A decision already saved for that period is reused — whatever the gross is
 * now. Otherwise it is decided on `fullMonthGross` (inclusive of the ceiling)
 * and `persist` tells the caller to save it.
 */
export function esiEligibility(
  employee: { statutory?: IEmployeeStatutory | null },
  fullMonthGross: number,
  periodKey: string,
  cfg: StatutoryConfig = env,
): EsiEligibility {
  const saved = employee.statutory;
  if (saved?.esiPeriodKey === periodKey && typeof saved.esiEligible === 'boolean') {
    return { eligible: saved.esiEligible, persist: false };
  }
  return { eligible: fullMonthGross <= cfg.ESI_WAGE_CEILING, persist: true };
}

/**
 * Employee ESI on the earned gross, rounded UP to the next rupee (153.75 →
 * 154); an exact rupee stays as it is.
 */
export function esiEmployee(earnedGross: number, eligible: boolean, cfg: StatutoryConfig = env): number {
  if (!eligible || !(earnedGross > 0)) return 0;
  return Math.ceil(scaledPercentOf(earnedGross, cfg.ESI_EMPLOYEE_PERCENT) / 1e8);
}

/** Employer ESI on the earned gross, to the paisa. */
export function esiEmployer(earnedGross: number, eligible: boolean, cfg: StatutoryConfig = env): number {
  if (!eligible || !(earnedGross > 0)) return 0;
  return toRupees(scaledPercentOf(earnedGross, cfg.ESI_EMPLOYER_PERCENT));
}

/* ──────────────────────────────────────────────────────────── */
/* Professional Tax                                              */
/* ──────────────────────────────────────────────────────────── */

/**
 * The PT state code of an employee: the state their work location names, else
 * their current address's state. `undefined` when neither names a state we
 * hold a table for (a city in the work location, no address, another state) —
 * such an employee pays no Professional Tax.
 */
export function ptStateCodeOf(employee: {
  workLocation?: string | null;
  address?: { current?: { state?: string | null } | null } | null;
}): string | undefined {
  return resolvePtStateCode(employee.workLocation) ?? resolvePtStateCode(employee.address?.current?.state);
}
