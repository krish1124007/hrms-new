/**
 * Migration 20261023000005: the system Field Manager role loses
 * `field.manage` (custom roles keep theirs), the travel-claim and route-cache
 * indexes are built; idempotent; down() reverses.
 */
import { createRequire } from 'node:module';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_ROLES } from '../models/role.model.js';

const require = createRequire(import.meta.url);
interface Migration {
  up(db: Db): Promise<void>;
  down(db: Db): Promise<void>;
}
const migration = require('../../migrations/20261023000005-field-team-travel.cjs') as Migration;

const db = (): Db => mongoose.connection.db as unknown as Db;

async function indexes(collection: string): Promise<Array<{ name?: string; unique?: boolean; partialFilterExpression?: unknown }>> {
  try {
    return (await db().collection(collection).indexes()) as Array<{ name?: string }>;
  } catch {
    return [];
  }
}

beforeEach(async () => {
  await db().collection('roles').deleteMany({});
  for (const name of ['expenseclaims', 'fielddayroutes']) {
    // eslint-disable-next-line no-await-in-loop
    if ((await indexes(name)).some((ix) => ix.name !== '_id_')) await db().collection(name).dropIndexes();
  }
});

describe('migration 20261023000005 — field team and travel', () => {
  it('takes field.manage off the system field manager only, builds the indexes; idempotent; down() reverses', async () => {
    await db().collection('roles').insertMany([
      {
        slug: 'field_manager',
        name: 'Field Manager',
        isSystem: true,
        description: 'old',
        permissions: ['leaves.approve', 'field.view', 'field.manage'],
      },
      { slug: 'regional_head', name: 'Regional head', isSystem: false, permissions: ['field.view', 'field.manage'] },
    ]);

    await migration.up(db());
    await migration.up(db());

    const role = await db().collection('roles').findOne({ slug: 'field_manager' });
    expect(role?.permissions).toEqual(['leaves.approve', 'field.view']);
    expect(role?.description).toBe(DEFAULT_ROLES.find((r) => r.slug === 'field_manager')!.description);
    const custom = await db().collection('roles').findOne({ slug: 'regional_head' });
    expect(custom?.permissions).toEqual(['field.view', 'field.manage']);

    const travelKey = (await indexes('expenseclaims')).find((ix) => ix.name === 'travelKey_1');
    expect(travelKey).toMatchObject({ unique: true, partialFilterExpression: { travelKey: { $exists: true } } });
    expect((await indexes('fielddayroutes')).find((ix) => ix.name === 'employeeId_1_date_1')).toMatchObject({ unique: true });

    await migration.down(db());
    const back = await db().collection('roles').findOne({ slug: 'field_manager' });
    expect(back?.permissions).toEqual(['leaves.approve', 'field.view', 'field.manage']);
    expect((await indexes('expenseclaims')).some((ix) => ix.name === 'travelKey_1')).toBe(false);
    expect((await indexes('fielddayroutes')).some((ix) => ix.name === 'employeeId_1_date_1')).toBe(false);
  });
});
