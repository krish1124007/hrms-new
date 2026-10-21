/**
 * The field migrations, run against the in-memory database:
 *   20261021000002 — legacy `draft` orders become `confirmed` (and back);
 *   20261021000003 — production indexes, stale/duplicate open visits closed,
 *                    duplicate push tokens collapsed, unique-index pre-checks.
 */
import { createRequire } from 'node:module';
import mongoose, { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { describe, it, expect } from 'vitest';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
import { recomputeClientLedger } from '../services/field-ledger.service.js';

const require = createRequire(import.meta.url);
interface Migration {
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}
const legacyDrafts = require('../../migrations/20261021000002-legacy-draft-orders-confirmed.cjs') as Migration;
const fieldIndexes = require('../../migrations/20261021000003-field-production-indexes.cjs') as Migration;

const db = (): Db => mongoose.connection.db as unknown as Db;
const MIN = 60_000;

async function indexNames(collection: string): Promise<string[]> {
  try {
    return (await db().collection(collection).indexes()).map((ix) => String(ix.name));
  } catch {
    return [];
  }
}
async function dropIndexes(collection: string, ...names: string[]): Promise<void> {
  const existing = await indexNames(collection);
  for (const name of names) {
    // eslint-disable-next-line no-await-in-loop
    if (existing.includes(name)) await db().collection(collection).dropIndex(name);
  }
}

describe('migration 20261021000002 — legacy draft orders', () => {
  it('turns every draft into a stamped confirmed order (they count again); down() reverts only those still confirmed', async () => {
    const orders = db().collection('productorders');
    const clientId = new Types.ObjectId();
    const base = { employeeId: new Types.ObjectId(), clientId, items: [], isDeleted: false };
    await orders.insertMany([
      { ...base, orderNumber: 'ORD-L-1', status: 'draft', totalAmount: 1000 },
      { ...base, orderNumber: 'ORD-L-2', status: 'draft', totalAmount: 300 },
      { ...base, orderNumber: 'ORD-L-3', status: 'draft', totalAmount: 50, isDeleted: true },
      { ...base, orderNumber: 'ORD-L-4', status: 'pending', totalAmount: 70 },
      { ...base, orderNumber: 'ORD-L-5', status: 'confirmed', totalAmount: 200 },
    ]);
    await db().collection('clients').insertOne({ _id: clientId, name: 'Legacy Co', isDeleted: false });

    await legacyDrafts.up(db());

    const byNumber = async (n: string) => orders.findOne({ orderNumber: n });
    expect(await byNumber('ORD-L-1')).toMatchObject({ status: 'confirmed', metadata: { migratedFromDraft: true } });
    expect(await byNumber('ORD-L-3')).toMatchObject({ status: 'confirmed', metadata: { migratedFromDraft: true } });
    expect((await byNumber('ORD-L-4'))?.status).toBe('pending');
    expect((await byNumber('ORD-L-5'))?.metadata).toBeUndefined();
    // The ledger backfill keeps them as receivables: 1,000 + 300 + 200.
    expect((await recomputeClientLedger(clientId)).totalOrderValue).toBe(1500);

    // A manager delivers one migrated order before a rollback.
    await orders.updateOne({ orderNumber: 'ORD-L-2' }, { $set: { status: 'delivered' } });
    await legacyDrafts.down(db());

    expect((await byNumber('ORD-L-1'))?.status).toBe('draft');
    expect((await byNumber('ORD-L-2'))?.status).toBe('delivered');
    expect((await byNumber('ORD-L-5'))?.status).toBe('confirmed');
    expect(await orders.countDocuments({ 'metadata.migratedFromDraft': true })).toBe(0);
  });
});

describe('migration 20261021000003 — field production indexes', () => {
  it('closes stale and duplicate open visits, collapses push tokens, builds every index; idempotent; down() reverts', async () => {
    // Undo what autoIndex built in the test database, so up() has work to do
    // and the duplicates it must clear can exist.
    await dropIndexes('visits', 'one_open_visit_per_employee', 'checkIn.time_-1');
    await dropIndexes('pushdevices', 'token_1');
    await dropIndexes('paymentcollections', 'orderId_1');
    await dropIndexes('products', 'sku_unique_live', 'category_1_isActive_1', 'name_1');

    const visits = db().collection('visits');
    const now = Date.now();
    const rep = new Types.ObjectId();
    const other = new Types.ObjectId();
    const clientId = new Types.ObjectId();
    const staleCheckIn = new Date(now - 3 * DAY_MS);
    const { insertedIds } = await visits.insertMany([
      { employeeId: rep, clientId, status: 'in_progress', isDeleted: false, checkIn: { time: staleCheckIn } },
      { employeeId: other, clientId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 2 * MIN) } },
      { employeeId: other, clientId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 1 * MIN) } },
      { employeeId: rep, clientId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 5 * MIN) } },
      { employeeId: rep, clientId, status: 'completed', isDeleted: false, checkIn: { time: staleCheckIn } },
    ]);
    const userId = new Types.ObjectId();
    await db().collection('pushdevices').insertMany([
      { userId, token: 'dup-token-0000000001', platform: 'android', updatedAt: new Date(now - DAY_MS) },
      { userId, token: 'dup-token-0000000001', platform: 'android', updatedAt: new Date(now) },
      { userId, token: 'solo-token-000000002', platform: 'ios', updatedAt: new Date(now) },
    ]);

    await fieldIndexes.up(db());

    const stale = await visits.findOne({ _id: insertedIds[0] });
    const nextDay = new Date(atBusinessTime(startOfBusinessDay(staleCheckIn), '00:00').getTime() + DAY_MS);
    expect(stale).toMatchObject({ status: 'completed', metadata: { autoClosed: true } });
    expect(stale?.checkOut?.time.toISOString()).toBe(nextDay.toISOString());

    const olderToday = await visits.findOne({ _id: insertedIds[1] });
    expect(olderToday).toMatchObject({ status: 'completed', metadata: { autoClosed: true } });
    expect(olderToday?.checkOut?.time.toISOString()).toBe(new Date(now - 1 * MIN).toISOString());
    expect((await visits.findOne({ _id: insertedIds[2] }))?.status).toBe('in_progress');
    expect((await visits.findOne({ _id: insertedIds[3] }))?.status).toBe('in_progress');
    expect((await visits.findOne({ _id: insertedIds[4] }))?.metadata).toBeUndefined();

    const tokens = await db().collection('pushdevices').find({}).toArray();
    expect(tokens.map((t) => t.token).sort()).toEqual(['dup-token-0000000001', 'solo-token-000000002']);
    expect(tokens.find((t) => t.token === 'dup-token-0000000001')?.updatedAt.getTime()).toBe(now);

    const expected: Record<string, string[]> = {
      locationtracks: ['employeeId_1_timestamp_-1'],
      visits: ['one_open_visit_per_employee', 'checkIn.time_-1'],
      products: ['sku_unique_live', 'category_1_isActive_1', 'name_1'],
      productorders: ['orderNumber_1'],
      paymentcollections: ['receiptNumber_1', 'orderId_1'],
      clients: ['location_2dsphere'],
      salestargets: ['employeeId_1_period.year_1_period.month_1_type_1'],
      pushdevices: ['token_1', 'userId_1'],
    };
    for (const [collection, names] of Object.entries(expected)) {
      // eslint-disable-next-line no-await-in-loop
      expect(await indexNames(collection), collection).toEqual(expect.arrayContaining(names));
    }
    const openIx = (await visits.indexes()).find((ix) => ix.name === 'one_open_visit_per_employee');
    expect(openIx).toMatchObject({ unique: true, partialFilterExpression: { status: 'in_progress', isDeleted: false } });
    // The index now refuses a second open visit.
    await expect(
      visits.insertOne({ employeeId: other, clientId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date() } }),
    ).rejects.toThrow(/duplicate key/);

    // Idempotent.
    await expect(fieldIndexes.up(db())).resolves.toBeUndefined();

    await fieldIndexes.down(db());
    expect(await indexNames('visits')).not.toContain('one_open_visit_per_employee');
    expect(await indexNames('paymentcollections')).not.toContain('orderId_1');
    expect(await indexNames('products')).not.toContain('sku_unique_live');
    // Pre-existing ones stay.
    expect(await indexNames('productorders')).toContain('orderNumber_1');
    expect((await visits.findOne({ _id: insertedIds[0] }))?.status).toBe('in_progress');
    expect((await visits.findOne({ _id: insertedIds[0] }))?.checkOut?.time).toBeUndefined();

    // Leave the test database as autoIndex built it.
    await fieldIndexes.up(db());
  });

  it('stops before changing anything when a unique index cannot be built (duplicate receipt numbers)', async () => {
    await dropIndexes('paymentcollections', 'receiptNumber_1');
    const payments = db().collection('paymentcollections');
    const row = { employeeId: new Types.ObjectId(), clientId: new Types.ObjectId(), amount: 10, method: 'cash', status: 'collected' };
    await payments.insertMany([
      { ...row, receiptNumber: 'RCPT-2026-00007' },
      { ...row, receiptNumber: 'RCPT-2026-00007' },
    ]);
    const visits = db().collection('visits');
    const { insertedId } = await visits.insertOne({
      employeeId: new Types.ObjectId(),
      clientId: new Types.ObjectId(),
      status: 'in_progress',
      isDeleted: false,
      checkIn: { time: new Date(Date.now() - 3 * DAY_MS) },
    });

    await expect(fieldIndexes.up(db())).rejects.toThrow(/duplicate receipt number "RCPT-2026-00007"/);
    expect((await visits.findOne({ _id: insertedId }))?.status).toBe('in_progress');
    expect(await indexNames('paymentcollections')).not.toContain('receiptNumber_1');

    // Resolved by hand, the migration goes through.
    await payments.deleteOne({ receiptNumber: 'RCPT-2026-00007' });
    await fieldIndexes.up(db());
    expect(await indexNames('paymentcollections')).toContain('receiptNumber_1');
  });
});
