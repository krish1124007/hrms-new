/**
 * Product catalogue, catalogue-priced order lines with GST, and the payment
 * receipt PDF.
 */
import { inflateSync } from 'node:zlib';
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { Client } from '../models/client.model.js';
import { Product } from '../models/product.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { SalesTarget } from '../models/sales-target.model.js';
import { env } from '../config/env.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  employee: IEmployee;
}

async function fieldActor(permissions: string[]): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: permissions } });
  const employee = await createEmployeeFor(user, { firstName: 'Ravi', lastName: 'Kumar' });
  return { token, employee };
}

let app: Express;
let A: Actor;
let B: Actor;
let M: Actor;

beforeEach(async () => {
  app = createApp();
  A = await fieldActor(['field-sales.view']);
  B = await fieldActor(['field-sales.view']);
  M = await fieldActor(['field-sales.view', 'field-sales.manage']);
});

const product = (overrides: Record<string, unknown> = {}) => ({
  name: 'Neem Soap 100g',
  sku: 'SOAP-100',
  category: 'Soap',
  unit: 'pcs',
  price: 40,
  gstRate: 18,
  ...overrides,
});

const createProduct = (actor: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/products').set(auth(actor.token)).send(body);

/** Every text-showing string in the PDF's (deflated) content streams, joined. */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  let text = '';
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let m = streams.exec(raw); m; m = streams.exec(raw)) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      body = m[1];
    }
    for (const hex of body.matchAll(/<([0-9a-fA-F]+)>/g)) text += Buffer.from(hex[1], 'hex').toString('latin1');
    for (const lit of body.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) text += lit[1];
  }
  return text;
}

describe('product catalogue', () => {
  it('only field managers create, edit and delete products; reps read', async () => {
    expect((await createProduct(A, product())).status).toBe(403);
    const created = await createProduct(M, product({ hsnCode: '3401', description: 'Herbal' }));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Neem Soap 100g',
      sku: 'SOAP-100',
      category: 'Soap',
      unit: 'pcs',
      price: 40,
      gstRate: 18,
      hsnCode: '3401',
      isActive: true,
    });
    const id = created.body.data._id as string;
    expect((await request(app).get(`/api/v1/field/products/${id}`).set(auth(A.token))).status).toBe(200);
    expect((await request(app).patch(`/api/v1/field/products/${id}`).set(auth(A.token)).send({ price: 1 })).status).toBe(
      403,
    );
    expect((await request(app).delete(`/api/v1/field/products/${id}`).set(auth(A.token))).status).toBe(403);

    const edited = await request(app).patch(`/api/v1/field/products/${id}`).set(auth(M.token)).send({ price: 45 });
    expect(edited.body.data.price).toBe(45);
    expect((await request(app).delete(`/api/v1/field/products/${id}`).set(auth(M.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/field/products/${id}`).set(auth(A.token))).status).toBe(404);
  });

  it('validates price and GST rate', async () => {
    expect((await createProduct(M, product({ gstRate: 7 }))).status).toBe(400);
    expect((await createProduct(M, product({ price: -1 }))).status).toBe(400);
    expect((await createProduct(M, product({ sku: '' }))).status).toBe(400);
  });

  it('duplicate SKU → 409; free again once the holder is soft-deleted', async () => {
    const first = await createProduct(M, product());
    const dup = await createProduct(M, product({ sku: 'soap-100', name: 'Other' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SKU_EXISTS');

    const other = await createProduct(M, product({ sku: 'SOAP-200' }));
    const clash = await request(app)
      .patch(`/api/v1/field/products/${other.body.data._id}`)
      .set(auth(M.token))
      .send({ sku: 'SOAP-100' });
    expect(clash.status).toBe(409);

    await request(app).delete(`/api/v1/field/products/${first.body.data._id}`).set(auth(M.token));
    expect((await createProduct(M, product())).status).toBe(201);
  });

  it('lists active products by default, filters, searches and paginates', async () => {
    await createProduct(M, product());
    await createProduct(M, product({ name: 'Lemon Juice 1L', sku: 'JUICE-1', category: 'Beverages', price: 90, gstRate: 12 }));
    await createProduct(M, product({ name: 'Old Soap', sku: 'SOAP-OLD', isActive: false }));

    const all = await request(app).get('/api/v1/field/products').set(auth(A.token));
    expect(all.status).toBe(200);
    expect((all.body.data as Array<{ sku: string }>).map((p) => p.sku).sort()).toEqual(['JUICE-1', 'SOAP-100']);
    expect(all.body.pagination).toMatchObject({ page: 1, total: 2 });

    const soap = await request(app).get('/api/v1/field/products').query({ category: 'Soap' }).set(auth(A.token));
    expect((soap.body.data as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['SOAP-100']);

    const search = await request(app).get('/api/v1/field/products').query({ search: 'juice' }).set(auth(A.token));
    expect((search.body.data as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['JUICE-1']);

    const bySku = await request(app).get('/api/v1/field/products').query({ search: 'soap-1' }).set(auth(A.token));
    expect((bySku.body.data as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['SOAP-100']);

    const inactive = await request(app).get('/api/v1/field/products').query({ active: 'false' }).set(auth(M.token));
    expect((inactive.body.data as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['SOAP-OLD']);
    const everything = await request(app).get('/api/v1/field/products').query({ active: 'all' }).set(auth(M.token));
    expect(everything.body.pagination.total).toBe(3);

    const paged = await request(app).get('/api/v1/field/products').query({ limit: 1, page: 2 }).set(auth(A.token));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.pagination).toMatchObject({ page: 2, limit: 1, total: 2 });
  });

  it('categories are distinct and sorted (active products only)', async () => {
    await createProduct(M, product({ sku: 'A1', category: 'Soap' }));
    await createProduct(M, product({ sku: 'A2', category: 'Beverages' }));
    await createProduct(M, product({ sku: 'A3', category: 'Soap' }));
    await createProduct(M, product({ sku: 'A4', category: 'Zeta', isActive: false }));
    const res = await request(app).get('/api/v1/field/products/categories').set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['Beverages', 'Soap']);
  });
});

describe('catalogue-priced orders', () => {
  async function catalogue() {
    const soap = await createProduct(M, product({ name: 'Detergent 1kg', sku: 'DET-1', price: 1000, gstRate: 18, unit: 'bag' }));
    const tea = await createProduct(M, product({ name: 'Tea 500g', sku: 'TEA-500', category: 'Beverages', price: 500, gstRate: 5 }));
    return { soapId: soap.body.data._id as string, teaId: tea.body.data._id as string };
  }

  it('prices lines from the catalogue with GST: 1000 @ 18% × 2 + 500 @ 5% × 1 less 10%', async () => {
    const { soapId, teaId } = await catalogue();
    const client = await Client.create({ name: 'Acme' });
    const res = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({
        clientId: String(client._id),
        items: [
          { productId: soapId, quantity: 2, unitPrice: 1, total: 1, name: 'cheap' },
          { productId: teaId, quantity: 1, discountPercent: 10 },
        ],
        subtotal: 1,
        totalAmount: 1,
        total: 1,
        notes: 'Deliver Monday',
      });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 2450, gstTotal: 382.5, total: 2832.5, totalAmount: 2832.5 });
    expect(res.body.data.items[0]).toMatchObject({
      productId: soapId,
      name: 'Detergent 1kg',
      sku: 'DET-1',
      unit: 'bag',
      unitPrice: 1000,
      gstRate: 18,
      quantity: 2,
      discountPercent: 0,
      lineSubtotal: 2000,
      lineGst: 360,
      lineTotal: 2360,
    });
    expect(res.body.data.items[1]).toMatchObject({
      unitPrice: 500,
      gstRate: 5,
      discountPercent: 10,
      lineSubtotal: 450,
      lineGst: 22.5,
      lineTotal: 472.5,
    });
    const stored = await ProductOrder.findById(res.body.data._id).lean();
    expect(stored?.totalAmount).toBe(2832.5);
  });

  it("accepts the mobile app's `discount` as the discount percent", async () => {
    const { teaId } = await catalogue();
    const client = await Client.create({ name: 'Acme' });
    const res = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({ clientId: String(client._id), items: [{ productId: teaId, quantity: 2, discount: 50 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subtotal: 500, gstTotal: 25, total: 525 });
  });

  it('rejects an inactive, unknown or deleted product, and a line without a product', async () => {
    const { soapId } = await catalogue();
    const client = await Client.create({ name: 'Acme' });
    const send = (items: unknown[]) =>
      request(app).post('/api/v1/field/orders').set(auth(A.token)).send({ clientId: String(client._id), items });

    const off = await createProduct(M, product({ sku: 'OFF', isActive: false }));
    const inactive = await send([{ productId: off.body.data._id, quantity: 1 }]);
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.code).toBe('PRODUCT_INACTIVE');

    const unknown = await send([{ productId: '64b000000000000000000000', quantity: 1 }]);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('PRODUCT_NOT_FOUND');

    await request(app).delete(`/api/v1/field/products/${soapId}`).set(auth(M.token));
    expect((await send([{ productId: soapId, quantity: 1 }])).body.error.code).toBe('PRODUCT_NOT_FOUND');

    expect((await send([{ name: 'Free text', quantity: 1, unitPrice: 10 }])).status).toBe(400);
    expect((await send([{ productId: soapId, quantity: 0 }])).status).toBe(400);
    expect(await ProductOrder.countDocuments({})).toBe(0);
  });

  it('editing a pending order reprices it from the catalogue', async () => {
    const { soapId, teaId } = await catalogue();
    const client = await Client.create({ name: 'Acme' });
    const created = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({ clientId: String(client._id), items: [{ productId: soapId, quantity: 1 }] });
    const edited = await request(app)
      .patch(`/api/v1/field/orders/${created.body.data._id}`)
      .set(auth(A.token))
      .send({ items: [{ productId: teaId, quantity: 2, unitPrice: 1 }] });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ subtotal: 1000, gstTotal: 50, total: 1050 });
  });

  it('legacy orders without catalogue lines still read', async () => {
    const client = await Client.create({ name: 'Acme' });
    const legacy = await ProductOrder.create({
      orderNumber: 'ORD-202601-0001',
      employeeId: A.employee._id,
      clientId: client._id,
      status: 'draft',
      items: [{ name: 'Widget', quantity: 2, unitPrice: 50, discount: 0, total: 100 }],
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
    });
    const res = await request(app).get(`/api/v1/field/orders/${legacy._id}`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 100, gstTotal: 0, subtotal: 100 });
    expect(res.body.data.items[0]).toMatchObject({ name: 'Widget', quantity: 2, total: 100 });
    const list = await request(app).get('/api/v1/field/orders').set(auth(A.token));
    expect(list.body.data).toHaveLength(1);
  });

  it('a category target counts only that category’s lines', async () => {
    const { soapId, teaId } = await catalogue();
    const client = await Client.create({ name: 'Acme' });
    const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: 'numeric' })
      .formatToParts(new Date());
    const year = Number(ym.find((p) => p.type === 'year')?.value);
    const month = Number(ym.find((p) => p.type === 'month')?.value);
    await SalesTarget.create({
      employeeId: A.employee._id,
      period: { month, year },
      type: 'amount',
      productCategory: 'Beverages',
      targetValue: 1000,
    });
    const order = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({ clientId: String(client._id), items: [{ productId: soapId, quantity: 1 }, { productId: teaId, quantity: 1 }] });
    await request(app).patch(`/api/v1/field/orders/${order.body.data._id}/status`).set(auth(M.token)).send({ status: 'confirmed' });
    const res = await request(app).get('/api/v1/field/targets/my').set(auth(A.token));
    expect(res.body.data[0].achievedValue).toBe(525); // tea 500 + 5% GST
  });
});

describe('payment receipt PDF', () => {
  it('renders the receipt for the collecting rep and managers, 403 for another rep', async () => {
    const client = await Client.create({ name: 'Sharma Stores', address: { line1: '12 MG Road', city: 'Pune' } });
    const pay = await request(app)
      .post('/api/v1/field/payments')
      .set(auth(A.token))
      .send({ clientId: String(client._id), amount: 1250.5, method: 'cheque', reference: 'CHQ-778899' });
    expect(pay.status).toBe(201);
    const { _id: id, receiptNumber } = pay.body.data as { _id: string; receiptNumber: string };

    const res = await request(app)
      .get(`/api/v1/field/payments/${id}/receipt`)
      .set(auth(A.token))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain(`${receiptNumber}.pdf`);
    const pdf = res.body as Buffer;
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const text = pdfText(pdf);
    expect(text).toContain(receiptNumber);
    expect(text).toContain(env.COMPANY_NAME);
    expect(text).toContain('Sharma Stores');
    expect(text).toContain('1,250.50');
    expect(text).toContain('One Thousand Two Hundred Fifty');
    expect(text).toContain('Fifty Paise');
    expect(text).toContain('CHQ-778899');
    expect(text).toContain('Ravi Kumar');

    expect((await request(app).get(`/api/v1/field/payments/${id}/receipt`).set(auth(B.token))).status).toBe(403);
    expect((await request(app).get(`/api/v1/field/payments/${id}/receipt`).set(auth(M.token))).status).toBe(200);
    expect(
      (await request(app).get('/api/v1/field/payments/64b000000000000000000000/receipt').set(auth(A.token))).status,
    ).toBe(404);
  });
});

describe('Product model', () => {
  it('stores the SKU upper-cased and exposes taxRate as an alias of gstRate', async () => {
    const p = await Product.create({ name: 'X', sku: ' abc-1 ', category: 'C', price: 1, gstRate: 5 });
    expect(p.sku).toBe('ABC-1');
    expect(p.toJSON()).toMatchObject({ taxRate: 5, gstRate: 5 });
  });
});
