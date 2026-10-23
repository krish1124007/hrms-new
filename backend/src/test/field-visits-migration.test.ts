/**
 * Migration 20261023000001 (field visits foundation), run against the
 * in-memory database: clients → sites, clientId → siteId, field-sales.* →
 * field.*, the sales collections dropped, the abort when sales data exists,
 * idempotency, and down().
 */
import { createRequire } from 'node:module';
import mongoose, { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { describe, it, expect, beforeEach } from 'vitest';
import { FieldSite } from '../models/field-site.model.js';
import { serializeSite } from '../services/field-sites.service.js';

const require = createRequire(import.meta.url);
interface Migration {
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}
const foundation = require('../../migrations/20261023000001-field-visits-foundation.cjs') as Migration;

const db = (): Db => mongoose.connection.db as unknown as Db;

async function collectionNames(): Promise<string[]> {
  return (await db().listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
}

async function indexNames(collection: string): Promise<string[]> {
  return (await db().collection(collection).indexes()).map((ix) => String(ix.name));
}

// Only a few models are loaded here, so the shared clean-up does not reach
// the raw collections these tests write: start each test from empty ones.
beforeEach(async () => {
  for (const name of ['clients', 'visits', 'fieldtasks', 'roles', 'users', 'fieldsites', 'counters']) {
    // eslint-disable-next-line no-await-in-loop
    await db().collection(name).deleteMany({});
  }
  for (const name of ['products', 'productorders', 'paymentcollections', 'salestargets']) {
    // eslint-disable-next-line no-await-in-loop
    if ((await collectionNames()).includes(name)) await db().collection(name).drop();
  }
});

describe('migration 20261023000001 — field visits foundation', () => {
  it('copies clients to sites, renames clientId and the permissions, drops the empty sales collections; idempotent; down() reverses', async () => {
    const acme = new Types.ObjectId();
    const gone = new Types.ObjectId();
    const rep = new Types.ObjectId();
    const lastVisitDate = new Date('2026-10-01T05:00:00Z');
    const laterCheckIn = new Date('2026-10-10T06:00:00Z');
    const createdAt = new Date('2026-05-01T00:00:00Z');
    await db().collection('clients').insertMany([
      {
        _id: acme,
        name: 'Acme Traders',
        contactPerson: 'Ravi',
        phone: '9800000000',
        email: 'ravi@acme.test',
        company: 'Acme Pvt Ltd',
        category: 'A',
        address: { line1: '12 MG Road', line2: 'Floor 2', city: 'Pune', state: 'MH', pincode: '411001' },
        location: { type: 'Point', coordinates: [73.85, 18.52] },
        assignedTo: rep,
        lastVisitDate,
        totalOrderValue: 0,
        notes: [{ text: 'Call before visiting', at: createdAt }],
        status: 'active',
        isDeleted: false,
        createdAt,
        updatedAt: createdAt,
      },
      // No usable pin (the old app's empty placeholder), soft-deleted.
      { _id: gone, name: 'Closed Shop', location: { coordinates: [] }, isDeleted: true, deletedAt: createdAt },
    ]);
    const visitIds = (
      await db().collection('visits').insertMany([
        {
          employeeId: rep,
          clientId: acme,
          status: 'completed',
          isDeleted: false,
          checkIn: { time: laterCheckIn },
          orderPlaced: new Types.ObjectId(),
          paymentCollected: new Types.ObjectId(),
        },
        { employeeId: rep, clientId: acme, status: 'completed', isDeleted: true, checkIn: { time: new Date() } },
      ])
    ).insertedIds;
    const taskId = (
      await db().collection('fieldtasks').insertOne({ title: 'Deliver', assignedTo: rep, clientId: acme, status: 'new' })
    ).insertedId;
    await db().collection('roles').insertMany([
      { name: 'HR Manager (custom)', slug: 'hr-manager', isSystem: false, permissions: ['employees.view', 'field-sales.view', 'field-sales.manage'] },
      { name: 'Both', slug: 'both', isSystem: false, permissions: ['field-sales.view', 'field.view'] },
      { name: 'Plain', slug: 'plain', isSystem: false, permissions: ['payroll.view'] },
    ]);
    const userId = (
      await db().collection('users').insertOne({ email: 'old@test.local', customPermissions: ['field-sales.view'], isDeleted: true })
    ).insertedId;
    // Empty sales collections, and the numbering counters (not sales data, dropped too).
    for (const name of ['products', 'productorders', 'paymentcollections', 'salestargets']) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await collectionNames()).includes(name)) await db().createCollection(name);
    }
    await db().collection('counters').insertOne({ _id: 'RCPT-2026' as unknown as Types.ObjectId, seq: 3 });

    await foundation.up(db());

    // Sites keep the clients' ids.
    const site = await db().collection('fieldsites').findOne({ _id: acme });
    expect(site).toMatchObject({
      name: 'Acme Traders',
      type: 'Client office',
      address: { line1: '12 MG Road, Floor 2', city: 'Pune', state: 'MH', pincode: '411001' },
      location: { type: 'Point', coordinates: [73.85, 18.52] },
      radiusM: 200,
      contactName: 'Ravi',
      contactPhone: '9800000000',
      notes: 'Company: Acme Pvt Ltd\nEmail: ravi@acme.test\nCall before visiting',
      assignedTo: [rep],
      createdVia: 'web',
      visitCount: 1,
      isDeleted: false,
    });
    expect(site?.lastVisitAt.toISOString()).toBe(laterCheckIn.toISOString());
    expect(site?.createdAt.toISOString()).toBe(createdAt.toISOString());
    const closed = await db().collection('fieldsites').findOne({ _id: gone });
    expect(closed).toMatchObject({ name: 'Closed Shop', isDeleted: true, visitCount: 0 });
    expect(closed).not.toHaveProperty('location');
    // The model reads the migrated site.
    const viaModel = await FieldSite.findById(acme).lean();
    expect(serializeSite(viaModel)).toMatchObject({ location: { lat: 18.52, lng: 73.85 }, type: 'Client office' });

    const visit = await db().collection('visits').findOne({ _id: visitIds[0] });
    expect(visit?.siteId).toEqual(acme);
    expect(visit).not.toHaveProperty('clientId');
    expect(visit).not.toHaveProperty('orderPlaced');
    expect(visit).not.toHaveProperty('paymentCollected');
    expect((await db().collection('fieldtasks').findOne({ _id: taskId }))?.siteId).toEqual(acme);

    const perms = async (slug: string) => ((await db().collection('roles').findOne({ slug }))?.permissions as string[]).sort();
    expect(await perms('hr-manager')).toEqual(['employees.view', 'field.manage', 'field.view']);
    expect(await perms('both')).toEqual(['field.view']);
    expect(await perms('plain')).toEqual(['payroll.view']);
    expect((await db().collection('users').findOne({ _id: userId }))?.customPermissions).toEqual(['field.view']);

    const names = await collectionNames();
    for (const dropped of ['products', 'productorders', 'paymentcollections', 'salestargets', 'counters']) {
      expect({ dropped, present: names.includes(dropped) }).toEqual({ dropped, present: false });
    }
    expect(names).toContain('clients'); // kept for down()
    expect(await indexNames('fieldsites')).toEqual(
      expect.arrayContaining(['location_2dsphere', 'assignedTo_1', 'name_1', 'clientRef_1']),
    );
    const refIx = (await db().collection('fieldsites').indexes()).find((ix) => ix.name === 'clientRef_1');
    expect(refIx).toMatchObject({ unique: true, sparse: true });
    expect(await indexNames('fieldsettings')).toContain('singleton_1');

    // Idempotent.
    await expect(foundation.up(db())).resolves.toBeUndefined();
    expect(await db().collection('fieldsites').countDocuments()).toBe(2);
    expect(await perms('hr-manager')).toEqual(['employees.view', 'field.manage', 'field.view']);

    // A site pinned after the migration survives a rollback.
    const pinned = (await db().collection('fieldsites').insertOne({ name: 'Pinned later', type: 'Branch' })).insertedId;

    await foundation.down(db());
    expect(await db().collection('fieldsites').countDocuments({ _id: { $in: [acme, gone] } })).toBe(0);
    expect(await db().collection('fieldsites').countDocuments({ _id: pinned })).toBe(1);
    const back = await db().collection('visits').findOne({ _id: visitIds[0] });
    expect(back?.clientId).toEqual(acme);
    expect(back).not.toHaveProperty('siteId');
    expect((await db().collection('fieldtasks').findOne({ _id: taskId }))?.clientId).toEqual(acme);
    expect(await perms('hr-manager')).toEqual(['employees.view', 'field-sales.manage', 'field-sales.view']);
    expect((await db().collection('users').findOne({ _id: userId }))?.customPermissions).toEqual(['field-sales.view']);
  });

  it('stops before changing anything while a sales collection holds documents, listing them', async () => {
    const acme = new Types.ObjectId();
    await db().collection('clients').insertOne({ _id: acme, name: 'Acme', isDeleted: false });
    await db().collection('visits').insertOne({ employeeId: new Types.ObjectId(), clientId: acme, status: 'completed', isDeleted: false });
    await db().collection('roles').insertOne({ name: 'Custom', slug: 'custom', permissions: ['field-sales.view'] });
    await db().collection('products').insertOne({ name: 'Soap', sku: 'S-1', isDeleted: true });
    await db().collection('paymentcollections').insertMany([{ amount: 10 }, { amount: 20 }]);

    const run = foundation.up(db());
    await expect(run).rejects.toThrow(/nothing was changed/);
    await expect(foundation.up(db())).rejects.toThrow(/products: 1 document\(s\)[\s\S]*paymentcollections: 2 document\(s\)/);

    expect(await db().collection('fieldsites').countDocuments()).toBe(0);
    expect((await db().collection('visits').findOne({}))?.clientId).toEqual(acme);
    expect((await db().collection('roles').findOne({ slug: 'custom' }))?.permissions).toEqual(['field-sales.view']);
    expect(await db().collection('products').countDocuments()).toBe(1);

    // Cleared by hand, it goes through.
    await db().collection('products').deleteMany({});
    await db().collection('paymentcollections').deleteMany({});
    await foundation.up(db());
    expect(await db().collection('fieldsites').countDocuments({ _id: acme })).toBe(1);
    expect((await collectionNames()).includes('products')).toBe(false);
  });
});
