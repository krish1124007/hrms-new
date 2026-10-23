/**
 * Migration 20261023000006: the unique `key_1` index on `fielduploads` and
 * the `selfie_single_use` index on visits are built (a same-named different
 * one is replaced); it stops before building anything while two visits share
 * a selfie; idempotent; down() drops both.
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
const migration = require('../../migrations/20261023000006-field-uploads.cjs') as Migration;

const db = (): Db => mongoose.connection.db as unknown as Db;

async function indexes(collection: string): Promise<Array<{ name?: string; unique?: boolean }>> {
  try {
    return (await db().collection(collection).indexes()) as Array<{ name?: string; unique?: boolean }>;
  } catch {
    return [];
  }
}

beforeEach(async () => {
  for (const name of ['fielduploads', 'visits']) {
    // eslint-disable-next-line no-await-in-loop
    if ((await db().listCollections({ name }).toArray()).length > 0) await db().collection(name).drop();
  }
});

const SELFIE = '/uploads/field-photos/2026/10/1-aaaaaaaaaaaa.png';

describe('migration 20261023000006 — field upload owners, single-use selfies', () => {
  it('builds both indexes; idempotent; down() drops them', async () => {
    await db().collection('fielduploads').createIndex({ key: 1 }, { name: 'key_1' }); // not unique: replaced
    await db().collection('visits').insertMany([
      { employeeId: new Types.ObjectId(), checkIn: { time: new Date(), photo: SELFIE } },
      { employeeId: new Types.ObjectId(), checkIn: { time: new Date() } },
      { employeeId: new Types.ObjectId(), checkIn: { time: new Date() } },
    ]);
    await migration.up(db());
    await migration.up(db());
    expect((await indexes('fielduploads')).find((ix) => ix.name === 'key_1')).toMatchObject({ unique: true });
    expect((await indexes('visits')).find((ix) => ix.name === 'selfie_single_use')).toMatchObject({ unique: true });

    await db().collection('fielduploads').insertOne({ key: 'field-photos/2026/10/1-aaaaaaaaaaaa.png' });
    await expect(db().collection('fielduploads').insertOne({ key: 'field-photos/2026/10/1-aaaaaaaaaaaa.png' })).rejects.toThrow(/duplicate key/);
    await expect(db().collection('visits').insertOne({ checkIn: { photo: SELFIE } })).rejects.toThrow(/duplicate key/);

    await migration.down(db());
    expect((await indexes('fielduploads')).map((ix) => ix.name)).not.toContain('key_1');
    expect((await indexes('visits')).map((ix) => ix.name)).not.toContain('selfie_single_use');
  });

  it('stops before building anything while two visits share a selfie, naming them', async () => {
    const { insertedIds } = await db().collection('visits').insertMany([
      { employeeId: new Types.ObjectId(), checkIn: { time: new Date(), photo: SELFIE } },
      { employeeId: new Types.ObjectId(), checkIn: { time: new Date(), photo: SELFIE } },
    ]);
    await expect(migration.up(db())).rejects.toThrow(new RegExp(`sharing one check-in selfie[\\s\\S]*${String(insertedIds[1])}`));
    expect((await indexes('visits')).map((ix) => ix.name)).not.toContain('selfie_single_use');
    expect((await indexes('fielduploads')).map((ix) => ix.name)).not.toContain('key_1');
  });
});
