/**
 * Professional Tax — a state levy, so the slabs differ by state. Each table
 * lists the monthly deduction for a monthly gross: the first slab whose
 * `upTo` the gross does not exceed applies (bounds are inclusive, in rupees).
 *
 * Add a state by adding a table to `PT_TABLES` (and its names to
 * `STATE_NAMES`); a state with no table pays nothing.
 */
export type PtGender = 'male' | 'female' | 'other';
export interface PtSlab {
    /** Upper bound of the slab, inclusive: the slab applies while gross ≤ upTo. */
    readonly upTo: number;
    readonly amount: number;
}
export interface PtTable {
    readonly slabs: readonly PtSlab[];
    /** Replaces the slab amount in a given month (1 = January), above `exceeding`. */
    readonly monthOverride?: {
        readonly month: number;
        readonly amount: number;
        readonly exceeding: number;
    };
    /** Women whose gross does not exceed this pay nothing. */
    readonly womenExemptUpTo?: number;
}
/** The amounts are rupees per month; Tamil Nadu's half-yearly slabs are shown monthly. */
export declare const PT_TABLES: Readonly<Record<string, PtTable>>;
/**
 * The PT state code for a state given as a free-text name or as a code
 * ("Maharashtra", "tamil  nadu", "MH"), or `undefined` when it names no state
 * we hold a table for — a city ("Mumbai") is not a state.
 */
export declare function resolvePtStateCode(state: string | null | undefined): string | undefined;
export interface ProfessionalTaxInput {
    /** The state's code (`MH`, `GJ`, …); see `resolvePtStateCode`. Unknown or missing → no tax. */
    stateCode?: string | null;
    /** The gross wage for the month. */
    monthlyGross: number;
    /** Calendar month, 1 = January … 12 = December. */
    month: number;
    gender?: PtGender | null;
}
/** Professional Tax to deduct for the month; 0 for an unknown state or no wage. */
export declare function professionalTax({ stateCode, monthlyGross, month, gender }: ProfessionalTaxInput): number;
//# sourceMappingURL=professional-tax.d.ts.map