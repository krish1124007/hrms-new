/**
 * recompute-field-ledgers: the deploy-time backfill. Client figures were
 * `$inc`-ed and never reversed; the script recomputes every order's payment
 * state and every client's ledger from the source rows — reporting only by
 * default, writing with --apply.
 */
import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Client } from '../models/client.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { runRecomputeFieldLedgers } from './recompute-field-ledgers.js';

const employeeId = new Types.ObjectId();
let n = 0;

async function seed() {
  // Drifted figures, as the old `$inc` code left them.
  const acme = await Client.create({ name: 'Acme', totalOrders: 5, totalPayments: 9999, outstandingAmount: 123 });
  const tidy = await Client.create({ name: 'Tidy' });
  const order = (clientId: unknown, totalAmount: number, status: string, extra: Record<string, unknown> = {}) => {
    n += 1;
    return ProductOrder.create({
      orderNumber: `ORD-T-${n}`,
      employeeId,
      clientId,
      items: [],
      subtotal: totalAmount,
      totalAmount,
      status,
      ...extra,
    });
  };
  const payment = (clientId: unknown, amount: number, status: string, orderId?: unknown) => {
    n += 1;
    return PaymentCollection.create({
      receiptNumber: `RCPT-T-${n}`,
      employeeId,
      clientId,
      amount,
      method: 'cash',
      status,
      ...(orderId ? { orderId } : {}),
    });
  };
  const confirmed = await order(acme._id, 1000, 'confirmed', { paidAmount: 0, paymentStatus: 'pending' });
  await order(acme._id, 500, 'delivered');
  await order(acme._id, 700, 'cancelled');
  await order(acme._id, 300, 'pending');
  await payment(acme._id, 400, 'collected', confirmed._id);
  await payment(acme._id, 250, 'verified');
  await payment(acme._id, 900, 'bounced', confirmed._id);
  return { acme, tidy, confirmed };
}

function capture(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (line) => lines.push(line) };
}

describe('recompute-field-ledgers', () => {
  it('dry run (the default) prints the changed balances and writes nothing', async () => {
    const { acme, confirmed } = await seed();
    const out = capture();

    const result = await runRecomputeFieldLedgers([], out.print);

    expect(result.applied).toBe(false);
    expect(result.clientsChecked).toBe(2);
    expect(result.clients).toHaveLength(1); // Tidy is already right
    expect(result.clients[0]).toMatchObject({
      id: String(acme._id),
      before: { totalOrders: 5, totalPayments: 9999, outstandingAmount: 123 },
      // confirmed 1,000 + delivered 500; payments 400 + 250 (bounced 900 out).
      after: { totalOrders: 2, totalOrderValue: 1500, totalPayments: 650, outstandingAmount: 850 },
    });
    expect(result.orders).toEqual([
      expect.objectContaining({
        id: String(confirmed._id),
        before: { paidAmount: 0, paymentStatus: 'pending' },
        after: { paidAmount: 400, paymentStatus: 'partial' },
      }),
    ]);
    expect(out.lines.join('\n')).toContain('outstanding 123.00 → 850.00');
    expect(out.lines.at(-1)).toContain('dry run, nothing written');

    expect((await Client.findById(acme._id).lean())?.outstandingAmount).toBe(123);
    expect((await ProductOrder.findById(confirmed._id).lean())?.paidAmount).toBe(0);
  });

  it('--apply writes the recomputed figures; a second run finds nothing to change', async () => {
    const { acme, confirmed } = await seed();

    const applied = await runRecomputeFieldLedgers(['--apply'], capture().print);
    expect(applied.applied).toBe(true);

    expect(await Client.findById(acme._id).lean()).toMatchObject({
      totalOrders: 2,
      totalOrderValue: 1500,
      totalPayments: 650,
      outstandingAmount: 850,
    });
    expect(await ProductOrder.findById(confirmed._id).lean()).toMatchObject({ paidAmount: 400, paymentStatus: 'partial' });

    const again = await runRecomputeFieldLedgers(['--apply'], capture().print);
    expect(again.clients).toEqual([]);
    expect(again.orders).toEqual([]);
  });

  it('rejects an unknown argument', async () => {
    await expect(runRecomputeFieldLedgers(['--force'], capture().print)).rejects.toThrow(/Unknown argument/);
  });
});
