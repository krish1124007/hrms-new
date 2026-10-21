/**
 * Field-sales data integrity: who may see and change which record, durable
 * order/receipt numbering, the client ledger recomputed from its source rows,
 * order and visit lifecycles, payment rules, idempotent money writes, targets,
 * IST day boundaries, field tasks, photo upload and list hygiene.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { SalesTarget } from '../models/sales-target.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { Notification } from '../models/notification.model.js';
import { Product } from '../models/product.model.js';
import { AuditLog } from '../models/audit-log.model.js';
import { nextSequence } from '../lib/sequence.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The IST calendar year / month right now — what the numbering and targets use. */
const istPart = (part: 'year' | 'month'): number =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', [part]: 'numeric' }).format(new Date()));
const YEAR = istPart('year');

interface Actor {
  token: string;
  employee: IEmployee;
  userId: string;
}

async function fieldActor(
  permissions: string[],
  overrides: Partial<Record<keyof IEmployee, unknown>> = {},
): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: permissions } });
  const employee = await createEmployeeFor(user, overrides);
  return { token, employee, userId: String(user._id) };
}
const rep = (overrides: Partial<Record<keyof IEmployee, unknown>> = {}) =>
  fieldActor(['field-sales.view'], overrides);
const fieldManager = () => fieldActor(['field-sales.view', 'field-sales.manage']);

let app: Express;
let A: Actor;
let B: Actor;
let M: Actor;

beforeEach(async () => {
  app = createApp();
  A = await rep();
  B = await rep();
  M = await fieldManager();
});

/** Mumbai, [lng, lat]. */
const MUMBAI = { lat: 19.076, lng: 72.8777 };
const newClient = (extra: Record<string, unknown> = {}) => Client.create({ name: 'Acme Traders', ...extra });

let skuSeq = 0;
/** A GST-free catalogue product priced `price`. */
async function productAt(price: number): Promise<string> {
  skuSeq += 1;
  const p = await Product.create({ name: `Widget ${skuSeq}`, sku: `W-${skuSeq}`, category: 'General', price, gstRate: 0 });
  return String(p._id);
}

/** Books a pending order worth `amount` for `actor` through the API. */
async function bookOrder(actor: Actor, clientId: unknown, amount: number) {
  const res = await request(app)
    .post('/api/v1/field/orders')
    .set(auth(actor.token))
    .send({ clientId: String(clientId), items: [{ productId: await productAt(amount), quantity: 1 }] });
  expect(res.status).toBe(201);
  return res.body.data as { _id: string; orderNumber: string; totalAmount: number; status: string };
}

const setStatus = (actor: Actor, orderId: string, status: string) =>
  request(app).patch(`/api/v1/field/orders/${orderId}/status`).set(auth(actor.token)).send({ status });

function collect(actor: Actor, body: Record<string, unknown>, key?: string) {
  const req = request(app).post('/api/v1/field/payments').set(auth(actor.token));
  if (key) req.set('Idempotency-Key', key);
  return req.send({ method: 'cash', ...body });
}

const checkIn = (actor: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visits/check-in').set(auth(actor.token)).send(body);

const checkOut = (actor: Actor, visitId: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/v1/field/visits/${visitId}/check-out`).set(auth(actor.token)).send(body);

async function ledgerOf(clientId: unknown) {
  const c = await Client.findById(clientId).lean();
  return {
    totalOrders: c?.totalOrders,
    totalOrderValue: c?.totalOrderValue,
    totalPayments: c?.totalPayments,
    outstandingAmount: c?.outstandingAmount,
  };
}

describe('numbering survives soft-delete and concurrency', () => {
  it('receipt numbers keep increasing after a payment is soft-deleted', async () => {
    const client = await newClient();
    const first = await collect(A, { clientId: String(client._id), amount: 100 });
    const second = await collect(A, { clientId: String(client._id), amount: 100 });
    expect(first.body.data.receiptNumber).toBe(`RCPT-${YEAR}-00001`);
    expect(second.body.data.receiptNumber).toBe(`RCPT-${YEAR}-00002`);

    const del = await request(app)
      .delete(`/api/v1/field/payments/${second.body.data._id}`)
      .set(auth(M.token));
    expect(del.status).toBe(200);

    const third = await collect(A, { clientId: String(client._id), amount: 100 });
    expect(third.status).toBe(201);
    expect(third.body.data.receiptNumber).toBe(`RCPT-${YEAR}-00003`);
  });

  it('order numbers keep increasing after an order is soft-deleted', async () => {
    const client = await newClient();
    const first = await bookOrder(A, client._id, 100);
    const second = await bookOrder(A, client._id, 100);
    expect(first.orderNumber).toBe(`ORD-${YEAR}-00001`);
    expect(second.orderNumber).toBe(`ORD-${YEAR}-00002`);
    expect((await request(app).delete(`/api/v1/field/orders/${second._id}`).set(auth(M.token))).status).toBe(200);
    expect((await bookOrder(A, client._id, 100)).orderNumber).toBe(`ORD-${YEAR}-00003`);
  });

  it('10 concurrent payments get 10 distinct receipt numbers', async () => {
    const client = await newClient();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => collect(A, { clientId: String(client._id), amount: 10 })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(new Set(results.map((r) => r.body.data.receiptNumber)).size).toBe(10);
    expect(await PaymentCollection.countDocuments({})).toBe(10);
    expect((await Client.findById(client._id).lean())?.totalPayments).toBe(100);
  });

  it('seeds the counter from the highest existing number, soft-deleted rows included', async () => {
    const client = await newClient();
    await PaymentCollection.create({
      employeeId: A.employee._id,
      clientId: client._id,
      amount: 5,
      method: 'cash',
      receiptNumber: `RCPT-${YEAR}-00041`,
      isDeleted: true,
      deletedAt: new Date(),
    });
    const res = await collect(A, { clientId: String(client._id), amount: 10 });
    expect(res.status).toBe(201);
    expect(res.body.data.receiptNumber).toBe(`RCPT-${YEAR}-00042`);
  });

  it('skips a number already stored behind the counter’s back instead of answering 409', async () => {
    const client = await newClient();
    expect((await collect(A, { clientId: String(client._id), amount: 1 })).body.data.receiptNumber).toBe(
      `RCPT-${YEAR}-00001`,
    );
    await PaymentCollection.create({
      employeeId: A.employee._id,
      clientId: client._id,
      amount: 5,
      method: 'cash',
      receiptNumber: `RCPT-${YEAR}-00002`,
    });
    const res = await collect(A, { clientId: String(client._id), amount: 1 });
    expect(res.status).toBe(201);
    expect(res.body.data.receiptNumber).toBe(`RCPT-${YEAR}-00003`);
  });

  it('nextSequence hands out distinct numbers under concurrent first use', async () => {
    const seqs = await Promise.all(Array.from({ length: 20 }, () => nextSequence('test:concurrent')));
    expect(new Set(seqs).size).toBe(20);
    expect(Math.max(...seqs)).toBe(20);
  });
});

describe('ledger is recomputed after every mutation', () => {
  it('outstanding = confirmed/delivered order totals − payments, through edit, cancel and delete', async () => {
    const client = await newClient();
    const clientId = String(client._id);
    const order = await bookOrder(A, clientId, 1000);
    // A pending order is not a receivable yet.
    expect(await ledgerOf(clientId)).toEqual({
      totalOrders: 0,
      totalOrderValue: 0,
      totalPayments: 0,
      outstandingAmount: 0,
    });

    expect((await setStatus(M, order._id, 'confirmed')).status).toBe(200);
    expect(await ledgerOf(clientId)).toEqual({
      totalOrders: 1,
      totalOrderValue: 1000,
      totalPayments: 0,
      outstandingAmount: 1000,
    });

    const pay = await collect(A, { clientId, orderId: order._id, amount: 400 });
    expect(pay.status).toBe(201);
    expect(await ledgerOf(clientId)).toMatchObject({ totalPayments: 400, outstandingAmount: 600 });
    expect(await ProductOrder.findById(order._id).lean()).toMatchObject({
      paidAmount: 400,
      paymentStatus: 'partial',
    });

    const edit = await request(app)
      .patch(`/api/v1/field/payments/${pay.body.data._id}`)
      .set(auth(M.token))
      .send({ amount: 500 });
    expect(edit.status).toBe(200);
    expect(await ledgerOf(clientId)).toMatchObject({ totalPayments: 500, outstandingAmount: 500 });
    expect((await ProductOrder.findById(order._id).lean())?.paidAmount).toBe(500);

    expect((await setStatus(M, order._id, 'cancelled')).status).toBe(200);
    expect(await ledgerOf(clientId)).toEqual({
      totalOrders: 0,
      totalOrderValue: 0,
      totalPayments: 500,
      outstandingAmount: -500,
    });
    const shown = await request(app).get(`/api/v1/field/clients/${clientId}`).set(auth(A.token));
    expect(shown.body.data.outstandingAmount).toBe(-500);

    const del = await request(app)
      .delete(`/api/v1/field/payments/${pay.body.data._id}`)
      .set(auth(M.token));
    expect(del.status).toBe(200);
    expect(await ledgerOf(clientId)).toEqual({
      totalOrders: 0,
      totalOrderValue: 0,
      totalPayments: 0,
      outstandingAmount: 0,
    });
  });

  it('moving a payment to another client recomputes both ledgers', async () => {
    const x = await newClient({ name: 'X' });
    const y = await newClient({ name: 'Y' });
    const pay = await collect(A, { clientId: String(x._id), amount: 300 });
    expect(await ledgerOf(x._id)).toMatchObject({ totalPayments: 300, outstandingAmount: -300 });
    const moved = await request(app)
      .patch(`/api/v1/field/payments/${pay.body.data._id}`)
      .set(auth(M.token))
      .send({ clientId: String(y._id) });
    expect(moved.status).toBe(200);
    expect(await ledgerOf(x._id)).toMatchObject({ totalPayments: 0, outstandingAmount: 0 });
    expect(await ledgerOf(y._id)).toMatchObject({ totalPayments: 300, outstandingAmount: -300 });
  });

  it('deleting an order recomputes the ledger; an order with payments cannot be deleted', async () => {
    const client = await newClient();
    const paid = await bookOrder(A, client._id, 1000);
    const unpaid = await bookOrder(A, client._id, 200);
    await setStatus(M, paid._id, 'confirmed');
    await setStatus(M, unpaid._id, 'confirmed');
    expect(await ledgerOf(client._id)).toMatchObject({ totalOrders: 2, outstandingAmount: 1200 });
    await collect(A, { clientId: String(client._id), orderId: paid._id, amount: 100 });

    const refused = await request(app).delete(`/api/v1/field/orders/${paid._id}`).set(auth(M.token));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORDER_HAS_PAYMENTS');

    expect((await request(app).delete(`/api/v1/field/orders/${unpaid._id}`).set(auth(M.token))).status).toBe(200);
    expect(await ledgerOf(client._id)).toEqual({
      totalOrders: 1,
      totalOrderValue: 1000,
      totalPayments: 100,
      outstandingAmount: 900,
    });
  });
});

describe('ownership', () => {
  it("a rep cannot read or change another rep's visit, order or payment", async () => {
    const client = await newClient();
    const clientId = String(client._id);
    const visit = await checkIn(A, { clientId, location: MUMBAI });
    expect(visit.status).toBe(201);
    const order = await bookOrder(A, clientId, 100);
    const pay = await collect(A, { clientId, amount: 50 });
    expect(pay.status).toBe(201);

    for (const path of [
      `/visits/${visit.body.data._id}`,
      `/orders/${order._id}`,
      `/payments/${pay.body.data._id}`,
    ]) {
      expect((await request(app).get(`/api/v1/field${path}`).set(auth(B.token))).status).toBe(403);
      expect(
        (await request(app).patch(`/api/v1/field${path}`).set(auth(B.token)).send({ notes: 'mine now' })).status,
      ).toBe(403);
    }
    expect((await checkOut(B, visit.body.data._id)).status).toBe(403);
    expect((await setStatus(B, order._id, 'cancelled')).status).toBe(403);
    expect((await Visit.findById(visit.body.data._id).lean())?.notes).toBeUndefined();
  });

  it('employeeId in the body is ignored for a rep', async () => {
    const client = await newClient();
    const visit = await checkIn(A, { clientId: String(client._id), employeeId: String(B.employee._id) });
    expect(String(visit.body.data.employeeId)).toBe(String(A.employee._id));
    const pay = await collect(A, { clientId: String(client._id), amount: 10, employeeId: String(B.employee._id) });
    expect(String(pay.body.data.employeeId)).toBe(String(A.employee._id));
  });

  it("a team lead sees their direct reports' records but cannot change them", async () => {
    const L = await rep();
    const R = await rep({ reportingManager: L.employee._id });
    const client = await newClient();
    const theirs = await checkIn(R, { clientId: String(client._id) });
    const stranger = await checkIn(B, { clientId: String(client._id) });

    expect((await request(app).get(`/api/v1/field/visits/${theirs.body.data._id}`).set(auth(L.token))).status).toBe(200);
    expect(
      (await request(app).patch(`/api/v1/field/visits/${theirs.body.data._id}`).set(auth(L.token)).send({ notes: 'x' }))
        .status,
    ).toBe(403);
    expect((await request(app).get(`/api/v1/field/visits/${stranger.body.data._id}`).set(auth(L.token))).status).toBe(
      403,
    );
    const list = await request(app).get('/api/v1/field/visits').set(auth(L.token));
    expect((list.body.data as Array<{ _id: string }>).map((v) => v._id)).toEqual([theirs.body.data._id]);
  });

  it('404 NO_EMPLOYEE_PROFILE for a rep without an employee record', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field-sales.view'] } });
    const res = await request(app).get('/api/v1/field/orders').set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('order status machine', () => {
  it('a rep cannot confirm their own order; a field manager confirms and delivers', async () => {
    const client = await newClient();
    const order = await bookOrder(A, client._id, 500);
    expect(order.status).toBe('pending');
    expect((await setStatus(A, order._id, 'confirmed')).status).toBe(403);
    const confirmed = await setStatus(M, order._id, 'confirmed');
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe('confirmed');
    expect((await setStatus(A, order._id, 'delivered')).status).toBe(403);
    expect((await setStatus(M, order._id, 'delivered')).body.data.status).toBe('delivered');
    const late = await setStatus(M, order._id, 'cancelled');
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('pending → delivered is refused; a rep cancels a pending order but not a confirmed one', async () => {
    const client = await newClient();
    const order = await bookOrder(A, client._id, 500);
    expect((await setStatus(M, order._id, 'delivered')).status).toBe(409);
    const other = await bookOrder(A, client._id, 500);
    await setStatus(M, other._id, 'confirmed');
    expect((await setStatus(A, other._id, 'cancelled')).status).toBe(403);
    expect((await setStatus(A, order._id, 'cancelled')).body.data.status).toBe('cancelled');
  });

  it('a confirmed order is money-locked; a pending one is repriced server-side', async () => {
    const client = await newClient();
    const order = await bookOrder(A, client._id, 500);
    const repriced = await request(app)
      .patch(`/api/v1/field/orders/${order._id}`)
      .set(auth(A.token))
      .send({ items: [{ productId: await productAt(100), quantity: 3, unitPrice: 1, total: 1 }], totalAmount: 1, subtotal: 1 });
    expect(repriced.status).toBe(200);
    expect(repriced.body.data.totalAmount).toBe(300);
    await setStatus(M, order._id, 'confirmed');
    const locked = await request(app)
      .patch(`/api/v1/field/orders/${order._id}`)
      .set(auth(A.token))
      .send({ items: [{ productId: await productAt(1), quantity: 1 }] });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('ORDER_LOCKED');
  });

  it('a rep cannot create an order already confirmed', async () => {
    const client = await newClient();
    const res = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({ clientId: String(client._id), status: 'confirmed', items: [{ productId: await productAt(9), quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });
});

describe('payment rules', () => {
  it('rejects a zero amount', async () => {
    const client = await newClient();
    expect((await collect(A, { clientId: String(client._id), amount: 0 })).status).toBe(400);
  });

  it('rejects an overpayment against an order, on create and on edit', async () => {
    const client = await newClient();
    const order = await bookOrder(A, client._id, 1000);
    await setStatus(M, order._id, 'confirmed');
    const first = await collect(A, { clientId: String(client._id), orderId: order._id, amount: 600 });
    expect(first.status).toBe(201);
    const over = await collect(A, { clientId: String(client._id), orderId: order._id, amount: 500 });
    expect(over.status).toBe(400);
    expect(over.body.error.code).toBe('OVERPAYMENT');
    expect(await PaymentCollection.countDocuments({})).toBe(1);

    const rest = await collect(A, { clientId: String(client._id), orderId: order._id, amount: 400 });
    expect(rest.status).toBe(201);
    expect((await ProductOrder.findById(order._id).lean())?.paymentStatus).toBe('paid');
    const edit = await request(app)
      .patch(`/api/v1/field/payments/${first.body.data._id}`)
      .set(auth(M.token))
      .send({ amount: 700 });
    expect(edit.status).toBe(400);
    expect(edit.body.error.code).toBe('OVERPAYMENT');
  });

  it("rejects an order of another client, and a cancelled order", async () => {
    const acme = await newClient();
    const globex = await newClient({ name: 'Globex' });
    const order = await bookOrder(A, acme._id, 1000);
    const mismatch = await collect(A, { clientId: String(globex._id), orderId: order._id, amount: 10 });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('ORDER_CLIENT_MISMATCH');
    await setStatus(A, order._id, 'cancelled');
    const cancelled = await collect(A, { clientId: String(acme._id), orderId: order._id, amount: 10 });
    expect(cancelled.status).toBe(400);
    expect(cancelled.body.error.code).toBe('ORDER_CANCELLED');
    expect(await PaymentCollection.countDocuments({})).toBe(0);
  });

  it('writes an audit entry for every money mutation', async () => {
    const client = await newClient();
    const pay = await collect(A, { clientId: String(client._id), amount: 100 });
    await request(app).patch(`/api/v1/field/payments/${pay.body.data._id}`).set(auth(M.token)).send({ amount: 90 });
    await request(app).delete(`/api/v1/field/payments/${pay.body.data._id}`).set(auth(M.token));
    const actions = (
      await AuditLog.find({ entity: 'PaymentCollection', entityId: pay.body.data._id }).sort({ createdAt: 1 }).lean()
    ).map((a) => a.action);
    expect(actions).toEqual(['create', 'update', 'delete']);
    const update = await AuditLog.findOne({ entity: 'PaymentCollection', action: 'update' }).lean();
    expect(update?.changes?.before?.amount).toBe(100);
    expect(update?.changes?.after?.amount).toBe(90);
  });

  it('a rep marks their own collection deposited; only a manager verifies', async () => {
    const client = await newClient();
    const pay = await collect(A, { clientId: String(client._id), amount: 100 });
    const id = pay.body.data._id as string;
    expect((await request(app).patch(`/api/v1/field/payments/${id}/deposit`).set(auth(B.token))).status).toBe(403);
    const deposited = await request(app).patch(`/api/v1/field/payments/${id}/deposit`).set(auth(A.token));
    expect(deposited.status).toBe(200);
    expect(deposited.body.data.status).toBe('deposited');
    expect((await request(app).patch(`/api/v1/field/payments/${id}/verify`).set(auth(A.token))).status).toBe(403);
    expect((await request(app).patch(`/api/v1/field/payments/${id}/verify`).set(auth(M.token))).body.data.status).toBe(
      'verified',
    );
  });
});

describe('visit lifecycle', () => {
  it('one open visit per rep; check-out only once; duration ≥ 0', async () => {
    const client = await newClient();
    const first = await checkIn(A, { clientId: String(client._id) });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('in_progress');

    const second = await checkIn(A, { clientId: String(client._id) });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VISIT_ALREADY_OPEN');

    const out = await checkOut(A, first.body.data._id, { notes: 'Met the owner' });
    expect(out.status).toBe(200);
    expect(out.body.data.status).toBe('completed');
    expect(out.body.data.duration).toBeGreaterThanOrEqual(0);

    const again = await checkOut(A, first.body.data._id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('VISIT_ALREADY_CHECKED_OUT');

    // Closed — the next visit may start.
    expect((await checkIn(A, { clientId: String(client._id) })).status).toBe(201);
  });

  it('completed requires a check-in', async () => {
    const client = await newClient();
    const planned = await request(app)
      .post('/api/v1/field/visits')
      .set(auth(A.token))
      .send({ clientId: String(client._id) });
    expect(planned.status).toBe(201);
    expect(planned.body.data.status).toBe('scheduled');
    const done = await request(app)
      .patch(`/api/v1/field/visits/${planned.body.data._id}`)
      .set(auth(A.token))
      .send({ status: 'completed' });
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe('VISIT_NOT_CHECKED_IN');
    expect((await checkOut(A, planned.body.data._id)).body.error.code).toBe('VISIT_NOT_CHECKED_IN');

    const asCompleted = await request(app)
      .post('/api/v1/field/visits')
      .set(auth(A.token))
      .send({ clientId: String(client._id), status: 'completed' });
    expect(asCompleted.status).toBe(400);
  });

  it('checking in to a planned visit starts that visit', async () => {
    const client = await newClient();
    const planned = await request(app)
      .post('/api/v1/field/visits')
      .set(auth(A.token))
      .send({ clientId: String(client._id), purpose: 'collection' });
    const started = await checkIn(A, { clientId: String(client._id), visitId: planned.body.data._id });
    expect(started.status).toBe(201);
    expect(started.body.data._id).toBe(planned.body.data._id);
    expect(started.body.data.status).toBe('in_progress');
    expect(await Visit.countDocuments({})).toBe(1);
  });

  it('flags a check-in 1 km from the client without rejecting it', async () => {
    const located = await newClient({ location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });
    const far = await checkIn(A, { clientId: String(located._id), location: { lat: MUMBAI.lat + 0.009, lng: MUMBAI.lng } });
    expect(far.status).toBe(201);
    expect(far.body.data.locationMismatch).toBe(true);
    expect(far.body.data.distanceFromClientM).toBeGreaterThan(950);
    expect(far.body.data.distanceFromClientM).toBeLessThan(1050);
    await checkOut(A, far.body.data._id);

    const near = await checkIn(A, { clientId: String(located._id), location: MUMBAI });
    expect(near.body.data.locationMismatch).toBe(false);
    expect(near.body.data.distanceFromClientM).toBe(0);
    await checkOut(A, near.body.data._id);

    const unlocated = await newClient({ name: 'Nowhere' });
    const unknown = await checkIn(A, { clientId: String(unlocated._id), location: MUMBAI });
    expect(unknown.body.data.locationMismatch).toBe(false);
    expect(unknown.body.data.distanceFromClientM ?? null).toBeNull();
  });

  it('accepts the mobile check-in and check-out payloads', async () => {
    const client = await newClient();
    const res = await checkIn(A, {
      clientId: String(client._id),
      purpose: 'follow_up',
      location: MUMBAI,
      notes: 'Walk-in',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.purpose).toBe('followup');
    expect(res.body.data.checkIn.location).toMatchObject(MUMBAI);
    expect(res.body.data.notes).toBe('Walk-in');

    const out = await checkOut(A, res.body.data._id, {
      outcome: 'successful',
      followUpDate: '2026-11-02',
      notes: 'Will reorder',
      productsDiscussed: ['Soap'],
      location: MUMBAI,
    });
    expect(out.status).toBe(200);
    expect(out.body.data.outcome).toBe('positive');
    expect(out.body.data.nextFollowUpDate).toBeTruthy();
    expect(out.body.data.notes).toBe('Will reorder');
    expect(out.body.data.checkOut.location).toMatchObject(MUMBAI);
  });

  it('404 for an unknown client', async () => {
    const res = await checkIn(A, { clientId: '64b000000000000000000000' });
    expect(res.status).toBe(404);
  });
});

describe('targets', () => {
  const month = istPart('month');

  it('achieved amount aggregates confirmed orders by the rep', async () => {
    const client = await newClient();
    await SalesTarget.create({ employeeId: A.employee._id, period: { month, year: YEAR }, type: 'amount', targetValue: 5000 });
    await ProductOrder.create({
      orderNumber: 'T-1', employeeId: A.employee._id, clientId: client._id, status: 'confirmed', subtotal: 3000, totalAmount: 3000,
    });
    await ProductOrder.create({
      orderNumber: 'T-2', employeeId: A.employee._id, clientId: client._id, status: 'pending', subtotal: 9000, totalAmount: 9000,
    });
    await ProductOrder.create({
      orderNumber: 'T-3', employeeId: B.employee._id, clientId: client._id, status: 'delivered', subtotal: 7000, totalAmount: 7000,
    });

    const list = await request(app).get('/api/v1/field/targets').set(auth(M.token));
    expect(list.status).toBe(200);
    expect(list.body.data[0].achievedValue).toBe(3000);
    expect(list.body.data[0].percentage).toBe(60);

    const mine = await request(app).get('/api/v1/field/targets/my').set(auth(A.token));
    expect(mine.body.data[0].achievedValue).toBe(3000);

    const board = await request(app).get('/api/v1/field/targets/leaderboard').set(auth(A.token));
    expect(board.body.data[0].achievedValue).toBe(3000);

    const summary = await request(app).get('/api/v1/field/targets/team-summary').set(auth(M.token));
    expect(summary.body.data.totalAchieved).toBe(3000);
  });

  it('quantity and visit targets', async () => {
    const client = await newClient();
    await SalesTarget.create({ employeeId: A.employee._id, period: { month, year: YEAR }, type: 'quantity', targetValue: 10 });
    await SalesTarget.create({ employeeId: A.employee._id, period: { month, year: YEAR }, type: 'visits', targetValue: 4 });
    await ProductOrder.create({
      orderNumber: 'Q-1', employeeId: A.employee._id, clientId: client._id, status: 'confirmed',
      items: [{ name: 'a', quantity: 2, unitPrice: 1, total: 2 }, { name: 'b', quantity: 3, unitPrice: 1, total: 3 }],
      totalAmount: 5,
    });
    const v = await checkIn(A, { clientId: String(client._id) });
    await checkOut(A, v.body.data._id);
    const res = await request(app).get('/api/v1/field/targets/my').set(auth(A.token));
    const byType = Object.fromEntries((res.body.data as Array<{ type: string; achievedValue: number }>).map((t) => [t.type, t.achievedValue]));
    expect(byType).toEqual({ quantity: 5, visits: 1 });
  });

  it("a rep only sees their own targets", async () => {
    const theirs = await SalesTarget.create({ employeeId: B.employee._id, period: { month, year: YEAR }, type: 'amount', targetValue: 100 });
    const list = await request(app).get('/api/v1/field/targets').query({ employeeId: String(B.employee._id) }).set(auth(A.token));
    expect(list.body.data).toEqual([]);
    expect((await request(app).get(`/api/v1/field/targets/${theirs._id}`).set(auth(A.token))).status).toBe(403);
  });
});

describe('IST day boundaries', () => {
  const realTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    if (realTZ === undefined) delete process.env.TZ;
    else process.env.TZ = realTZ;
  });

  it("field dashboard 'today' at 00:30 IST counts a visit made at 00:15 IST, not one at 23:50 IST the day before", async () => {
    process.env.TZ = 'UTC'; // production servers run on UTC
    const client = await newClient();
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date('2026-10-20T18:20:00Z')); // 23:50 IST, 20 Oct
    const yesterday = await checkIn(A, { clientId: String(client._id) });
    await checkOut(A, yesterday.body.data._id);
    await collect(A, { clientId: String(client._id), amount: 70 });

    vi.setSystemTime(new Date('2026-10-20T18:45:00Z')); // 00:15 IST, 21 Oct
    expect((await checkIn(A, { clientId: String(client._id) })).status).toBe(201);
    await collect(A, { clientId: String(client._id), amount: 30 });

    vi.setSystemTime(new Date('2026-10-20T19:00:00Z')); // 00:30 IST, 21 Oct
    const dash = await request(app).get('/api/v1/field/dashboard').set(auth(M.token));
    expect(dash.status).toBe(200);
    expect(dash.body.data.visitsToday).toBe(1);
    expect(dash.body.data.payments).toMatchObject({ count: 1, total: 30 });

    const today = await request(app).get('/api/v1/field/visits/today').set(auth(A.token));
    expect(today.body.data).toHaveLength(1);

    const daily = await request(app).get('/api/v1/field/payments/reports/daily').query({ date: '2026-10-20' }).set(auth(M.token));
    expect(daily.body.data.totals).toMatchObject({ count: 1, total: 70 });
  });

  it("a rep's dashboard counts only their own day", async () => {
    const client = await newClient();
    await checkIn(A, { clientId: String(client._id) });
    await checkIn(B, { clientId: String(client._id) });
    const dash = await request(app).get('/api/v1/field/dashboard').set(auth(A.token));
    expect(dash.body.data.visitsToday).toBe(1);
  });
});

describe('idempotent money writes', () => {
  it('the same Idempotency-Key twice records one payment', async () => {
    const client = await newClient();
    const body = { clientId: String(client._id), amount: 250 };
    const first = await collect(A, body, 'pay-key-000001');
    const second = await collect(A, body, 'pay-key-000001');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['x-idempotency-replay']).toBe('true');
    expect(second.body.data._id).toBe(first.body.data._id);
    expect(await PaymentCollection.countDocuments({})).toBe(1);
    expect((await Client.findById(client._id).lean())?.totalPayments).toBe(250);
  });

  it('concurrent retries with one key still record one payment', async () => {
    const client = await newClient();
    const body = { clientId: String(client._id), amount: 250 };
    const results = await Promise.all([collect(A, body, 'pay-key-000002'), collect(A, body, 'pay-key-000002')]);
    expect(results.map((r) => r.status).sort()).toEqual(expect.arrayContaining([201]));
    for (const r of results) expect([201, 409]).toContain(r.status);
    expect(await PaymentCollection.countDocuments({})).toBe(1);
  });

  it('the same key from another user is a different request', async () => {
    const client = await newClient();
    const body = { clientId: String(client._id), amount: 250 };
    await collect(A, body, 'pay-key-000003');
    await collect(B, body, 'pay-key-000003');
    expect(await PaymentCollection.countDocuments({})).toBe(2);
  });

  it('orders are idempotent too', async () => {
    const client = await newClient();
    const productId = await productAt(5);
    const send = () =>
      request(app)
        .post('/api/v1/field/orders')
        .set(auth(A.token))
        .set('Idempotency-Key', 'order-key-0001')
        .send({ clientId: String(client._id), items: [{ productId, quantity: 1 }] });
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    expect(await ProductOrder.countDocuments({})).toBe(1);
  });
});

describe('field tasks', () => {
  it('notifies the assignee on create and on reassignment', async () => {
    const created = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Collect cheque', assignedTo: String(A.employee._id) });
    expect(created.status).toBe(201);
    const forA = await Notification.find({ userId: A.userId }).lean();
    expect(forA).toHaveLength(1);
    expect(forA[0]).toMatchObject({ type: 'task_assigned', link: `/field/tasks/${created.body.data._id}` });

    const moved = await request(app)
      .patch(`/api/v1/field/tasks/${created.body.data._id}`)
      .set(auth(M.token))
      .send({ assignedTo: String(B.employee._id) });
    expect(moved.status).toBe(200);
    expect(await Notification.countDocuments({ userId: B.userId })).toBe(1);
    // An edit that keeps the assignee does not notify again.
    await request(app).patch(`/api/v1/field/tasks/${created.body.data._id}`).set(auth(M.token)).send({ priority: 'high' });
    expect(await Notification.countDocuments({ userId: B.userId })).toBe(1);
  });

  it('400 when the assignee is not an employee', async () => {
    const res = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Ghost', assignedTo: '64b000000000000000000000' });
    expect(res.status).toBe(400);
  });

  it("completion accepts the mobile's `notes`; a closed task cannot be completed again", async () => {
    const task = await FieldTask.create({ title: 'Deliver', assignedTo: A.employee._id });
    const done = await request(app)
      .patch(`/api/v1/field/tasks/${task._id}/complete`)
      .set(auth(A.token))
      .send({ notes: 'Delivered to the shop' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', completionNotes: 'Delivered to the shop' });
    const again = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(A.token)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_CLOSED');
  });
});

describe('field photo upload', () => {
  // 1×1 transparent PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('stores an image privately and returns a signed url plus its key', async () => {
    const res = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', PNG, { filename: 'selfie.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^field-photos\/\d{4}\/\d{2}\/.+\.png$/);
    expect(res.body.data.url).toContain('/api/v1/files/field-photos/');
    expect(res.body.data.url).toContain('sig=');

    const path = new URL(res.body.data.url).pathname + new URL(res.body.data.url).search;
    const file = await request(app).get(path);
    expect(file.status).toBe(200);

    // Attached to a check-in, the stored form is kept and handed back signed.
    const client = await newClient();
    const visit = await checkIn(A, { clientId: String(client._id), photo: res.body.data.url });
    expect(visit.status).toBe(201);
    expect(visit.body.data.checkIn.photo).toContain('sig=');
    expect((await Visit.findById(visit.body.data._id).lean())?.checkIn?.photo).toMatch(/^\/uploads\/field-photos\//);
  });

  it('refuses anything that is not an image', async () => {
    const pdf = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', Buffer.from('%PDF-1.4 fake'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    const disguised = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', Buffer.from('%PDF-1.4 fake'), { filename: 'x.png', contentType: 'image/png' });
    expect(disguised.status).toBe(400);
    const missing = await request(app).post('/api/v1/field/uploads/photo').set(auth(A.token));
    expect(missing.status).toBe(400);
  });
});

describe('list endpoints and clients', () => {
  it('cap limit at 100, reject unknown filter values and survive regex characters', async () => {
    const visits = await request(app).get('/api/v1/field/visits').query({ limit: 500 }).set(auth(A.token));
    expect(visits.status).toBe(200);
    expect(visits.body.pagination.limit).toBe(100);
    expect((await request(app).get('/api/v1/field/orders').query({ status: 'bogus' }).set(auth(A.token))).status).toBe(400);
    expect((await request(app).get('/api/v1/field/visits').query({ sort: 'password' }).set(auth(A.token))).status).toBe(400);
    const search = await request(app).get('/api/v1/field/clients').query({ search: '(a+)+$[' }).set(auth(A.token));
    expect(search.status).toBe(200);
  });

  it('my orders, payments and tasks are paginated', async () => {
    for (const path of ['/orders/my', '/payments/my', '/tasks/my']) {
      const res = await request(app).get(`/api/v1/field${path}`).set(auth(A.token));
      expect(res.status).toBe(200);
      expect(res.body.pagination).toMatchObject({ page: 1 });
    }
  });

  it('a rep adds a client from the mobile form; it is assigned to them', async () => {
    const res = await request(app)
      .post('/api/v1/field/clients')
      .set(auth(A.token))
      .send({
        name: 'Sharma Stores',
        category: 'B',
        contacts: [{ _id: '', name: 'Ravi Sharma', phone: '9800000000', email: 'ravi@example.com' }],
        address: '12 MG Road',
        city: 'Pune',
        state: 'MH',
        pincode: '411001',
        location: { lat: 0, lng: 0 },
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Sharma Stores',
      contactPerson: 'Ravi Sharma',
      phone: '9800000000',
      email: 'ravi@example.com',
      address: { line1: '12 MG Road', city: 'Pune', state: 'MH', pincode: '411001' },
    });
    expect(res.body.data.location?.coordinates ?? null).toBeNull();
    expect(String(res.body.data.assignedTo)).toBe(String(A.employee._id));

    const edit = await request(app).patch(`/api/v1/field/clients/${res.body.data._id}`).set(auth(A.token)).send({ name: 'x' });
    expect(edit.status).toBe(403);
    // Ledger figures are never client-writable.
    const forged = await request(app)
      .patch(`/api/v1/field/clients/${res.body.data._id}`)
      .set(auth(M.token))
      .send({ outstandingAmount: -99999 });
    expect(forged.status).toBe(200);
    expect(forged.body.data.outstandingAmount).toBe(0);
  });
});
