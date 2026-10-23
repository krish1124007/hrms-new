/**
 * Migration 20261021000003 (production indexes), run against the in-memory
 * database: stale/duplicate open visits closed, duplicate push tokens
 * collapsed, the visit / tracking / push indexes built. (The indexes it also
 * built on collections that no longer exist are dropped by 20261023000001.)
 */
import { createRequire } from 'node:module';
import mongoose, { Types } from 'mongoose';
import type { Db } from 'mongodb';
import { describe, it, expect } from 'vitest';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from '../lib/business-day.js';

const require = createRequire(import.meta.url);
interface Migration {
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}
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

describe('migration 20261021000003 — field production indexes', () => {
  it('closes stale and duplicate open visits, collapses push tokens, builds the indexes; idempotent; down() reverts', async () => {
    // Undo what autoIndex built in the test database, so up() has work to do
    // and the duplicates it must clear can exist.
    await dropIndexes('visits', 'one_open_visit_per_employee', 'checkIn.time_-1');
    await dropIndexes('pushdevices', 'token_1');

    const visits = db().collection('visits');
    const now = Date.now();
    const rep = new Types.ObjectId();
    const other = new Types.ObjectId();
    const siteId = new Types.ObjectId();
    const staleCheckIn = new Date(now - 3 * DAY_MS);
    const { insertedIds } = await visits.insertMany([
      { employeeId: rep, siteId, status: 'in_progress', isDeleted: false, checkIn: { time: staleCheckIn } },
      { employeeId: other, siteId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 2 * MIN) } },
      { employeeId: other, siteId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 1 * MIN) } },
      { employeeId: rep, siteId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date(now - 5 * MIN) } },
      { employeeId: rep, siteId, status: 'completed', isDeleted: false, checkIn: { time: staleCheckIn } },
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
      visits.insertOne({ employeeId: other, siteId, status: 'in_progress', isDeleted: false, checkIn: { time: new Date() } }),
    ).rejects.toThrow(/duplicate key/);

    // Idempotent.
    await expect(fieldIndexes.up(db())).resolves.toBeUndefined();

    await fieldIndexes.down(db());
    expect(await indexNames('visits')).not.toContain('one_open_visit_per_employee');
    expect((await visits.findOne({ _id: insertedIds[0] }))?.status).toBe('in_progress');
    expect((await visits.findOne({ _id: insertedIds[0] }))?.checkOut?.time).toBeUndefined();

    // Leave the test database as autoIndex built it.
    await fieldIndexes.up(db());
  });
});
