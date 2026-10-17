/**
 * What happens once a payroll cycle has actually been paid out.
 *
 * `markCyclePaid` calls `settleCycle` after the cycle is `paid` and every
 * record carries `paymentStatus: 'paid'`.
 *
 * Task 8 fills this: loan instalments and expense claims settle here — the
 * instalments a record deducted become paid, the claims it reimbursed become
 * reimbursed (idempotently, so a retry never settles twice). Until then it
 * is deliberately a no-op.
 */
import type { IPayrollCycle } from '../models/payroll-cycle.model.js';

export async function settleCycle(_cycle: IPayrollCycle): Promise<void> {
  // Intentionally empty until Task 8 (see the module comment).
}
