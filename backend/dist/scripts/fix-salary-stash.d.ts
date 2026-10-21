/**
 * Remove statutory figures parked in `salary.otherAllowances` and recompute
 * `salary.grossSalary`.
 *
 *   npm run salary:fix-stash                      dry run: prints what would change
 *   npm run salary:fix-stash -- --apply           writes the changes
 *   node dist/scripts/fix-salary-stash.js [--apply]   (from a built deploy)
 *
 * The CSV seed and the one-off import scripts stored PF, ESIC, Professional
 * Tax, net pay and CTC under named keys in `salary.otherAllowances`
 * (`STASHED_KEYS`), and the employee pre-save hook adds every allowance into
 * `grossSalary` — so those employees show an inflated gross. Payroll computes
 * from the salary components and ignores both, but the employee screens and
 * exports do not. For every employee (soft-deleted ones included) holding any
 * of those keys this drops them and sets
 *   grossSalary = basic + hra + da + specialAllowance + Σ(remaining otherAllowances)
 * — the pre-save hook's formula. Nothing else on the employee is touched.
 * Re-running is harmless: a clean employee is not listed.
 *
 * Reads MONGODB_URI (backend/.env or the shell) like the other scripts.
 */
import 'dotenv/config';
/** The keys the seed/import scripts parked in `salary.otherAllowances`. */
export declare const STASHED_KEYS: readonly ["employeePf", "employeeEsic", "employerPf", "employerEsic", "pt", "professionalTax", "net", "netPay", "ctc"];
export interface SalaryStashChange {
    /** The employee's `_id`. */
    id: string;
    /** The employee code (EMP000123). */
    employeeId?: string;
    name: string;
    removed: Record<string, unknown>;
    otherAllowancesAfter: Record<string, unknown>;
    grossBefore: number;
    grossAfter: number;
}
export interface SalaryStashResult {
    applied: boolean;
    changes: SalaryStashChange[];
}
/**
 * Finds every employee with a stashed key and — with `--apply` — removes the
 * keys and recomputes the gross. Prints one line per employee through `print`.
 * Expects an open mongoose connection.
 */
export declare function runFixSalaryStash(argv: readonly string[], print?: (line: string) => void): Promise<SalaryStashResult>;
//# sourceMappingURL=fix-salary-stash.d.ts.map