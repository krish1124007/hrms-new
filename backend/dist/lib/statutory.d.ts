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
 * Employee PF: the rate on the earned basic + DA, up to the wage ceiling
 * (12% of at most 15,000 by default, i.e. never more than 1,800).
 */
export declare function pfEmployee(earnedBasicPlusDa: number, cfg?: StatutoryConfig): number;
/**
 * Employer PF: same wage and rate as the employee's (the Group's policy is the
 * 12% alone — EDLI and admin charges are not bundled in).
 */
export declare function pfEmployer(earnedBasicPlusDa: number, cfg?: StatutoryConfig): number;
/**
 * The ESI contribution period a date falls in: `'YYYY-H1'` for April–September
 * and `'YYYY-H2'` for October–March, named for the year the period began
 * (February 2027 is `'2026-H2'`). Reads the date in UTC, so pass a UTC date
 * (`new Date(Date.UTC(year, month - 1, 1))`) for a payroll month.
 */
export declare function esiPeriodKey(date: Date): string;
export interface EsiEligibility {
    eligible: boolean;
    /** True when the decision is new for this period: the caller saves it as `employee.statutory`. */
    persist: boolean;
}
/**
 * Whether ESI applies to the employee for the contribution period `periodKey`.
 * A decision already saved for that period is reused — whatever the gross is
 * now. Otherwise it is decided on `fullMonthGross` (inclusive of the ceiling)
 * and `persist` tells the caller to save it — unless the saved decision is for
 * a LATER period (an earlier month processed again): that run is decided from
 * the gross but must not overwrite the newer record, so `persist` is false.
 * (Plain string comparison orders `YYYY-H1` / `YYYY-H2` correctly.)
 */
export declare function esiEligibility(employee: {
    statutory?: IEmployeeStatutory | null;
}, fullMonthGross: number, periodKey: string, cfg?: StatutoryConfig): EsiEligibility;
/**
 * Employee ESI on the earned gross, rounded UP to the next rupee (153.75 →
 * 154); an exact rupee stays as it is.
 */
export declare function esiEmployee(earnedGross: number, eligible: boolean, cfg?: StatutoryConfig): number;
/** Employer ESI on the earned gross, to the paisa. */
export declare function esiEmployer(earnedGross: number, eligible: boolean, cfg?: StatutoryConfig): number;
/**
 * The PT state code of an employee: the state their work location names, else
 * their current address's state, else — when they have no state on file at
 * all — the company's (`COMPANY_STATE_CODE`, Maharashtra by default, which is
 * where the legacy flat table came from). `undefined` (no Professional Tax)
 * when the state they name has no table here ("Delhi"), or the company's has
 * none. A work location that is not a state (a city, "Head office") says
 * nothing about the state either way.
 */
export declare function ptStateCodeOf(employee: {
    workLocation?: string | null;
    address?: {
        current?: {
            state?: string | null;
        } | null;
    } | null;
}, companyStateCode?: string | null | undefined): string | undefined;
//# sourceMappingURL=statutory.d.ts.map