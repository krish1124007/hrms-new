import { type OrderPaymentStatus } from '../models/product-order.model.js';
/**
 * Order statuses that are receivables: confirmed and delivered, plus the
 * legacy in-between statuses (`processing`, `shipped`) older orders may carry.
 */
export declare const RECEIVABLE_ORDER_STATUSES: readonly ["confirmed", "processing", "shipped", "delivered"];
export interface ClientLedger {
    totalOrders: number;
    totalOrderValue: number;
    totalPayments: number;
    outstandingAmount: number;
}
export interface OrderPayments {
    paidAmount: number;
    paymentStatus: OrderPaymentStatus;
}
/** A client's ledger figures computed from its orders and payments (nothing written). */
export declare function computeClientLedger(clientId: unknown): Promise<ClientLedger>;
/** Recompute and store a client's ledger figures; returns them. */
export declare function recomputeClientLedger(clientId: unknown): Promise<ClientLedger>;
/** Sum of the counted payments allocated to `orderId`, optionally leaving one payment out. */
export declare function paidTowardsOrder(orderId: unknown, excludePaymentId?: unknown): Promise<number>;
/** An order's `paidAmount` and `paymentStatus` computed from its payments (nothing written). */
export declare function computeOrderPayments(orderId: unknown): Promise<OrderPayments>;
/** Recompute and store an order's `paidAmount` and `paymentStatus`. */
export declare function recomputeOrderPayments(orderId: unknown): Promise<OrderPayments>;
/** Recompute every client and order touched by a mutation (duplicates and blanks skipped). */
export declare function recomputeAfterMutation(touched: {
    clients?: unknown[];
    orders?: unknown[];
}): Promise<void>;
/**
 * `recomputeAfterMutation` after a write that has already been committed: a
 * failure is logged, never thrown. Failing the request would tell the client
 * the write did not happen — a retry would then record it twice — while the
 * figures are only a cache of the source rows that the next mutation (or
 * `scripts/recompute-field-ledgers.ts`) puts right.
 */
export declare function recomputeAfterCommit(touched: {
    clients?: unknown[];
    orders?: unknown[];
}, context?: Record<string, unknown>): Promise<void>;
//# sourceMappingURL=field-ledger.service.d.ts.map