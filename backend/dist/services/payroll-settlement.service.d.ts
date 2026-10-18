import type { IPayrollCycle } from '../models/payroll-cycle.model.js';
export interface SettlementResult {
    /** Instalments paid into (in full or in part) by this call. */
    installmentsPaid: number;
    /** Claims marked reimbursed by this call. */
    claimsReimbursed: number;
}
type SettlingCycle = Pick<IPayrollCycle, '_id' | 'status' | 'year' | 'month' | 'paidAt'>;
/**
 * Settles every record of a `paid` cycle not settled yet (409
 * `CYCLE_NOT_EDITABLE` for any other status) and marks it
 * `settlement.settledAt`, which releases what it held. Instalments are paid
 * on, and claims reimbursed at, the cycle's `paidAt`; claims get
 * `reimbursementRef` `PAYROLL-<year>-<month>`. Idempotent: returns how much
 * THIS call settled.
 */
export declare function settleCycle(cycle: SettlingCycle): Promise<SettlementResult>;
export {};
//# sourceMappingURL=payroll-settlement.service.d.ts.map