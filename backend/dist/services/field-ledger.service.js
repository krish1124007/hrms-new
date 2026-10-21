/**
 * Client receivables and order payment state, recomputed from their source
 * rows.
 *
 * These figures used to be `$inc`-ed on create and never reversed, so every
 * edit, cancellation and deletion left them wrong for good. Mongo here is a
 * standalone server (no multi-document transactions), so instead of keeping
 * running totals in step we recompute them from the orders and payments after
 * every mutation: whatever happened before, the next recompute is right.
 *
 *   outstanding = Σ total of non-deleted orders in a receivable status
 *               − Σ amount of non-deleted, non-bounced payments
 *
 * A negative outstanding is a credit (the client paid ahead, or an order they
 * paid for was cancelled).
 *
 * `scripts/recompute-field-ledgers.ts` runs the same computation over every
 * client and order (the deploy-time backfill).
 */
import { Types } from 'mongoose';
import { Client } from '../models/client.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { idOf } from '../lib/access.js';
import { roundMoney } from '../lib/field-utils.js';
import { logger } from '../config/logger.js';
/**
 * Order statuses that are receivables: confirmed and delivered, plus the
 * legacy in-between statuses (`processing`, `shipped`) older orders may carry.
 */
export const RECEIVABLE_ORDER_STATUSES = ['confirmed', 'processing', 'shipped', 'delivered'];
/** Payment statuses that count as money received (a bounced cheque does not). */
const COUNTED_PAYMENT = { $ne: 'bounced' };
function oid(id) {
    const hex = idOf(id);
    if (!hex || !Types.ObjectId.isValid(hex))
        throw new Error(`field-ledger: invalid id ${String(id)}`);
    return new Types.ObjectId(hex);
}
/** A client's ledger figures computed from its orders and payments (nothing written). */
export async function computeClientLedger(clientId) {
    const id = oid(clientId);
    const [[orders], [payments]] = await Promise.all([
        ProductOrder.aggregate([
            { $match: { clientId: id, isDeleted: { $ne: true }, status: { $in: RECEIVABLE_ORDER_STATUSES } } },
            { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$totalAmount' } } },
        ]),
        PaymentCollection.aggregate([
            { $match: { clientId: id, isDeleted: { $ne: true }, status: COUNTED_PAYMENT } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
    ]);
    const totalOrderValue = roundMoney(orders?.value ?? 0);
    const totalPayments = roundMoney(payments?.total ?? 0);
    return {
        totalOrders: orders?.count ?? 0,
        totalOrderValue,
        totalPayments,
        outstandingAmount: roundMoney(totalOrderValue - totalPayments),
    };
}
/** Recompute and store a client's ledger figures; returns them. */
export async function recomputeClientLedger(clientId) {
    const ledger = await computeClientLedger(clientId);
    await Client.updateOne({ _id: oid(clientId) }, { $set: ledger }).setOptions({ withDeleted: true }).exec();
    return ledger;
}
/** Sum of the counted payments allocated to `orderId`, optionally leaving one payment out. */
export async function paidTowardsOrder(orderId, excludePaymentId) {
    const match = { orderId: oid(orderId), isDeleted: { $ne: true }, status: COUNTED_PAYMENT };
    if (excludePaymentId)
        match._id = { $ne: oid(excludePaymentId) };
    const [row] = await PaymentCollection.aggregate([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return roundMoney(row?.total ?? 0);
}
/** An order's `paidAmount` and `paymentStatus` computed from its payments (nothing written). */
export async function computeOrderPayments(orderId) {
    const id = oid(orderId);
    const order = await ProductOrder.findById(id).select('totalAmount').setOptions({ withDeleted: true }).lean().exec();
    const paidAmount = await paidTowardsOrder(id);
    const total = order?.totalAmount ?? 0;
    const paymentStatus = paidAmount <= 0 ? 'pending' : paidAmount >= total ? 'paid' : 'partial';
    return { paidAmount, paymentStatus };
}
/** Recompute and store an order's `paidAmount` and `paymentStatus`. */
export async function recomputeOrderPayments(orderId) {
    const computed = await computeOrderPayments(orderId);
    await ProductOrder.updateOne({ _id: oid(orderId) }, { $set: computed })
        .setOptions({ withDeleted: true })
        .exec();
    return computed;
}
/** Recompute every client and order touched by a mutation (duplicates and blanks skipped). */
export async function recomputeAfterMutation(touched) {
    const unique = (ids = []) => [...new Set(ids.map((id) => idOf(id)).filter((id) => Boolean(id)))];
    // Orders first: nothing in the client ledger depends on them, but callers
    // reading the order right after expect its payment state settled.
    await Promise.all(unique(touched.orders).map((id) => recomputeOrderPayments(id)));
    await Promise.all(unique(touched.clients).map((id) => recomputeClientLedger(id)));
}
/**
 * `recomputeAfterMutation` after a write that has already been committed: a
 * failure is logged, never thrown. Failing the request would tell the client
 * the write did not happen — a retry would then record it twice — while the
 * figures are only a cache of the source rows that the next mutation (or
 * `scripts/recompute-field-ledgers.ts`) puts right.
 */
export async function recomputeAfterCommit(touched, context = {}) {
    try {
        await recomputeAfterMutation(touched);
    }
    catch (err) {
        logger.error({ err, ...context }, 'field-ledger: recompute after a committed write failed — figures stay stale until the next mutation or a recompute-field-ledgers run');
    }
}
//# sourceMappingURL=field-ledger.service.js.map