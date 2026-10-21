import { refId, type OrderStatus, type OrderStatusChange, type PaymentCollection, type ProductOrder } from './field.api';

/*
 * Which buttons a field user sees — the server's rules
 * (`field-orders.controller.ts`, `field-payments.controller.ts`), so nobody is
 * offered an action that can only 403 or 409.
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
 * Status changes `actor` may make on `order`:
 * - confirm and deliver need `field-sales.manage`, and nobody confirms or
 *   delivers their own order (the server answers 403 `SELF_APPROVAL`);
 * - a manager may cancel a pending or confirmed order;
 * - a rep may cancel only their own pending order, and only while nothing is
 *   paid against it (403 `ORDER_HAS_PAYMENTS`).
 */
export function allowedOrderActions(
  order: Pick<ProductOrder, 'status' | 'employeeId' | 'paymentStatus'>,
  actor: FieldActor,
): OrderStatusChange[] {
  const s = normaliseOrderStatus(order.status);
  const mine = !!actor.myEmployeeId && refId(order.employeeId) === actor.myEmployeeId;
  const unpaid = (order.paymentStatus ?? 'pending') === 'pending';
  const out: OrderStatusChange[] = [];
  if (actor.canManage && !mine && s === 'pending') out.push('confirmed');
  if (actor.canManage && !mine && s === 'confirmed') out.push('delivered');
  if ((actor.canManage && (s === 'pending' || s === 'confirmed')) || (mine && s === 'pending' && unpaid)) {
    out.push('cancelled');
  }
  return out;
}

/** `unbounce` = "Take back bounce" (`bounced → collected`). */
export type PaymentAction = 'verify' | 'deposit' | 'bounce' | 'unbounce' | 'delete';

/**
 * Payment actions for `actor`, along the server's status machine
 * `collected → verified → deposited`:
 * - a manager verifies a collected payment;
 * - the collector (or a manager) marks a verified payment deposited;
 * - a manager marks any payment bounced, takes a bounce back
 *   (`bounced → collected`, refused when the order no longer has room for
 *   it), or deletes a payment.
 */
export function allowedPaymentActions(
  p: Pick<PaymentCollection, 'status' | 'employeeId'>,
  actor: FieldActor,
): PaymentAction[] {
  const mine = !!actor.myEmployeeId && refId(p.employeeId) === actor.myEmployeeId;
  const out: PaymentAction[] = [];
  if (actor.canManage && p.status === 'collected') out.push('verify');
  if (p.status === 'verified' && (mine || actor.canManage)) out.push('deposit');
  if (actor.canManage && p.status !== 'bounced') out.push('bounce');
  if (actor.canManage && p.status === 'bounced') out.push('unbounce');
  if (actor.canManage) out.push('delete');
  return out;
}
