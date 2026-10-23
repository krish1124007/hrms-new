/**
 * Migration 20261023000002 (visit engine), run against the in-memory
 * database: legacy visits reshaped to the visit contract, `day` filled in,
 * the per-day open-visit index replacing the per-employee one, the abort on
 * two open visits in a day, idempotency, and down().
 */
import { createRequire } from 'node:module';
import mongoose, { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { describe, it, expect, beforeEach } from 'vitest';

const require = createRequire(import.meta.url);
interface Migration {
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}
const engine = require('../../migrations/20261023000002-field-visits-indexes.cjs') as Migration;

const db = (): Db => mongoose.connection.db as unknown as Db;

async function indexNames(collection: string): Promise<string[]> {
  try {
    return (await db().collection(collection).indexes()).map((ix) => String(ix.name));
  } catch {
    return [];
  }
}

beforeEach(async () => {
  for (const name of ['visits', 'visitschedules']) {
    // eslint-disable-next-line no-await-in-loop
    if ((await db().listCollections({ name }).toArray()).length > 0) await db().collection(name).drop();
  }
});

describe('migration 20261023000002 — field visit engine', () => {
  it('reshapes legacy visits, fills in the day, swaps the open-visit index; idempotent; down() reverses', async () => {
    const visits = db().collection('visits');
    const rep = new Types.ObjectId();
    const siteId = new Types.ObjectId();
    await visits.createIndex(
      { employeeId: 1 },
      { name: 'one_open_visit_per_employee', unique: true, partialFilterExpression: { status: 'in_progress', isDeleted: false } },
    );
    const createdAt = new Date('2026-10-20T19:00:00Z'); // 00:30 IST, 21 Oct
    const { insertedIds } = await visits.insertMany([
      { employeeId: rep, siteId, status: 'scheduled', purpose: 'service', isPlanned: true, isDeleted: false, createdAt },
      {
        employeeId: rep,
        siteId,
        status: 'completed',
        purpose: 'other',
        isDeleted: false,
        createdAt,
        checkIn: { time: new Date('2026-10-21T05:00:00Z') },
        checkOut: { time: new Date('2026-10-21T05:40:00Z'), notes: 'Met the owner' },
        duration: 40,
        distanceFromClientM: 950,
        locationMismatch: true,
        locationMissing: false,
        outcome: 'followup_required',
        nextFollowUpDate: new Date('2026-11-02T00:00:00Z'),
        meetingWith: 'R. Shah',
        photos: ['/uploads/field-photos/2026/10/1-aaaaaaaaaaaa.png'],
        metadata: { autoClosed: true },
      },
      { employeeId: rep, siteId, status: 'in_progress', purpose: 'Meeting', isDeleted: false, createdAt, checkIn: { time: createdAt } },
    ]);

    await engine.up(db());
    const [planned, done, open] = await Promise.all(Object.values(insertedIds).map((id) => visits.findOne({ _id: id })));
    expect(planned).toMatchObject({ status: 'planned', purpose: 'Maintenance', plannedDate: new Date('2026-10-21T00:00:00Z'), day: new Date('2026-10-21T00:00:00Z') });
    expect(planned).not.toHaveProperty('isPlanned');
    expect(done).toMatchObject({
      purpose: 'Other',
      durationMinutes: 40,
      checkIn: { distanceM: 950 },
      flags: { awayFromSite: true, noGps: false, autoClosed: true, shortVisit: false },
      report: {
        notes: 'Met the owner',
        outcome: 'follow_up',
        followUpDate: new Date('2026-11-02T00:00:00Z'),
        peopleMet: [{ name: 'R. Shah' }],
        photos: ['/uploads/field-photos/2026/10/1-aaaaaaaaaaaa.png'],
      },
      day: new Date('2026-10-21T00:00:00Z'),
    });
    for (const legacy of ['duration', 'distanceFromClientM', 'locationMismatch', 'outcome', 'meetingWith', 'photos', 'metadata']) {
      expect(done).not.toHaveProperty(legacy);
    }
    expect(open?.day).toEqual(new Date('2026-10-21T00:00:00Z'));

    const names = await indexNames('visits');
    expect(names).toEqual(
      expect.arrayContaining([
        'employee_clientRef_unique',
        'one_open_visit_per_employee_day',
        'schedule_date_unique',
        'followUpOf_unique',
        'siteId_1_checkIn.time_-1',
        'status_1_plannedDate_1',
        'employeeId_1_day_-1',
      ]),
    );
    expect(names).not.toContain('one_open_visit_per_employee');
    expect(await indexNames('visitschedules')).toEqual(expect.arrayContaining(['employeeId_1', 'isDeleted_1']));

    // An offline replay of another day may now be open next to today's.
    await visits.insertOne({ employeeId: rep, siteId, status: 'in_progress', isDeleted: false, day: new Date('2026-10-19T00:00:00Z') });
    // ...but not a second one on the same day.
    await expect(
      visits.insertOne({ employeeId: rep, siteId, status: 'in_progress', isDeleted: false, day: new Date('2026-10-21T00:00:00Z') }),
    ).rejects.toMatchObject({ code: 11000 });
    // ...and a clientRef once per employee.
    await visits.insertOne({ employeeId: rep, siteId, status: 'completed', clientRef: 'ref-1' });
    await expect(visits.insertOne({ employeeId: rep, siteId, status: 'completed', clientRef: 'ref-1' })).rejects.toMatchObject({ code: 11000 });
    await visits.deleteMany({ day: new Date('2026-10-19T00:00:00Z') });

    // Idempotent.
    await engine.up(db());
    expect(await visits.findOne({ _id: insertedIds[1] })).toMatchObject({ purpose: 'Other', durationMinutes: 40 });

    await engine.down(db());
    expect(await indexNames('visits')).toContain('one_open_visit_per_employee');
    expect(await indexNames('visits')).not.toContain('one_open_visit_per_employee_day');
    expect(await visits.findOne({ _id: insertedIds[0] })).toMatchObject({ status: 'scheduled' });
    expect(await visits.findOne({ _id: insertedIds[1] })).toMatchObject({ duration: 40, locationMismatch: true, distanceFromClientM: 950 });
  });

  it('stops before changing an index while an employee has two open visits on one day', async () => {
    const visits = db().collection('visits');
    const rep = new Types.ObjectId();
    const at = new Date('2026-10-21T05:00:00Z');
    await visits.insertMany([
      { employeeId: rep, siteId: new Types.ObjectId(), status: 'in_progress', isDeleted: false, checkIn: { time: at } },
      { employeeId: rep, siteId: new Types.ObjectId(), status: 'in_progress', isDeleted: false, checkIn: { time: new Date(at.getTime() + 60_000) } },
    ]);
    await expect(engine.up(db())).rejects.toThrow(/two open visits/);
    expect(await indexNames('visits')).not.toContain('one_open_visit_per_employee_day');
  });

  it('aborts before changing any data: legacy visits keep their shape, no day is filled in', async () => {
    const visits = db().collection('visits');
    const rep = new Types.ObjectId();
    // Two open legacy visits on one IST day (neither has `day` yet) and a legacy scheduled one.
    const { insertedIds } = await visits.insertMany([
      { employeeId: rep, siteId: new Types.ObjectId(), status: 'in_progress', purpose: 'service', isDeleted: false, checkIn: { time: new Date('2026-10-21T05:00:00Z') }, locationMissing: true },
      { employeeId: rep, siteId: new Types.ObjectId(), status: 'in_progress', purpose: 'other', isDeleted: false, checkIn: { time: new Date('2026-10-21T09:00:00Z') } },
      { employeeId: rep, siteId: new Types.ObjectId(), status: 'scheduled', purpose: 'delivery', isPlanned: true, isDeleted: false, createdAt: new Date('2026-10-20T19:00:00Z') },
    ]);
    await expect(engine.up(db())).rejects.toThrow(/two open visits/);
    const [a, b, planned] = await Promise.all(Object.values(insertedIds).map((id) => visits.findOne({ _id: id })));
    expect(a).toMatchObject({ purpose: 'service', locationMissing: true });
    expect(a).not.toHaveProperty('flags');
    expect(a).not.toHaveProperty('day');
    expect(b).not.toHaveProperty('day');
    expect(planned).toMatchObject({ status: 'scheduled', purpose: 'delivery', isPlanned: true });
    expect(planned).not.toHaveProperty('day');
  });
});
