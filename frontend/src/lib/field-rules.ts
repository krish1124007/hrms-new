import { refId, type OrderStatus, type OrderStatusChange, type PaymentCollection, type ProductOrder } from './field.api';

/*
 * Which buttons a field user sees — the server's rules
 * (`field-orders.controller.ts`, `field-payments.controller.ts`), so nobody is
 * offered an action that can only 403.
 */

/** Legacy `draft` reads as pending; legacy `processing`/`shipped` as confirmed. */
export function normaliseOrderStatus(s: OrderStatus): 'pending' | 'confirmed' | 'delivered' | 'cancelled' {
  if (s === 'draft') return 'pending';
  if (s === 'processing' || s === 'shipped') return 'confirmed';
  return s;
}

export interface FieldActor {
  /** Holds `field-sales.manage`. */
  canManage: boolean;
  /** The signed-in user's employee `_id`, if any. */
  myEmployeeId?: string;
}

/**
 * Status changes `actor` may make on `order`: confirm and deliver need
 * `field-sales.manage`; a manager may cancel a pending or confirmed order, a
 * rep only their own pending one.
 */
export function allowedOrderActions(
  order: Pick<ProductOrder, 'status' | 'employeeId'>,
  actor: FieldActor,
): OrderStatusChange[] {
  const s = normaliseOrderStatus(order.status);
  const mine = !!actor.myEmployeeId && refId(order.employeeId) === actor.myEmployeeId;
  const out: OrderStatusChange[] = [];
  if (actor.canManage && s === 'pending') out.push('confirmed');
  if (actor.canManage && s === 'confirmed') out.push('delivered');
  if ((actor.canManage && (s === 'pending' || s === 'confirmed')) || (mine && s === 'pending')) out.push('cancelled');
  return out;
}

export type PaymentAction = 'deposit' | 'verify' | 'bounce' | 'delete';

/**
 * Payment actions for `actor`: the collector (or a manager) marks a collected
 * payment deposited; a manager verifies, marks bounced, or deletes.
 */
export function allowedPaymentActions(
  p: Pick<PaymentCollection, 'status' | 'employeeId'>,
  actor: FieldActor,
): PaymentAction[] {
  const mine = !!actor.myEmployeeId && refId(p.employeeId) === actor.myEmployeeId;
  const out: PaymentAction[] = [];
  if (p.status === 'collected' && (mine || actor.canManage)) out.push('deposit');
  if (actor.canManage && (p.status === 'collected' || p.status === 'deposited')) out.push('verify');
  if (actor.canManage && p.status !== 'bounced') out.push('bounce');
  if (actor.canManage) out.push('delete');
  return out;
}
