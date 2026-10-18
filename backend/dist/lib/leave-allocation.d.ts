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
export declare function proRataAllocation(daysAllowed: number, joiningDate: Date, year: number): number;
/** Is `err` MongoDB's duplicate-key error (E11000)? */
export declare const isDuplicateKey: (err: unknown) => boolean;
//# sourceMappingURL=leave-allocation.d.ts.map