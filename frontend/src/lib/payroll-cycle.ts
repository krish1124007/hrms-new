import type { PayrollCycle, PayrollCycleStatus } from './payroll.api';

/**
 * The payroll cycle lifecycle, as the API enforces it (`backend/src/lib/payroll-cycle.ts`):
 *
 *   draft ─process─▶ processing ─▶ processed ─lock─▶ locked ─markPaid─▶ paid
 *                                    ▲     │
 *                                    └─────┘ process (re-run), edit records
 *
 * The UI offers an action only where the API would accept it; anything else
 * is a 409 `CYCLE_NOT_EDITABLE`.
 */
export type CycleAction = 'process' | 'edit' | 'lock' | 'markPaid' | 'settle' | 'generatePayslips';

/** The statuses each action may start from. */
export const CYCLE_ACTION_FROM: Readonly<Record<CycleAction, readonly PayrollCycleStatus[]>> = {
  process: ['draft', 'processed'],
  edit: ['draft', 'processed'],
  lock: ['processed'],
  markPaid: ['locked'],
  settle: ['paid'],
  generatePayslips: ['processed', 'locked', 'paid'],
};

/** A `processing` cycle untouched this long is a crashed run and may be processed again. */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

/** True when `action` may start from the cycle's current state. */
export function canRunCycleAction(
  cycle: Pick<PayrollCycle, 'status' | 'updatedAt'>,
  action: CycleAction,
  now: number = Date.now(),
): boolean {
  if (CYCLE_ACTION_FROM[action].includes(cycle.status)) return true;
  return action === 'process' && isStaleProcessing(cycle, now);
}

/** A `processing` cycle whose run has gone quiet for longer than the API's 10-minute window. */
export function isStaleProcessing(
  cycle: Pick<PayrollCycle, 'status' | 'updatedAt'>,
  now: number = Date.now(),
): boolean {
  if (cycle.status !== 'processing' || !cycle.updatedAt) return false;
  const updated = new Date(cycle.updatedAt).getTime();
  return Number.isFinite(updated) && now - updated > STALE_PROCESSING_MS;
}

export const CYCLE_STATUS_VARIANT: Record<
  PayrollCycleStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
> = {
  draft: 'outline',
  processing: 'warning',
  processed: 'secondary',
  locked: 'destructive',
  paid: 'success',
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** "September 2026". */
export function cyclePeriod(cycle: Pick<PayrollCycle, 'month' | 'year'>): string {
  return `${MONTH_NAMES[cycle.month - 1] ?? cycle.month} ${cycle.year}`;
}
