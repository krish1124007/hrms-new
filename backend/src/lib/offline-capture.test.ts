/**
 * Offline capture times (`acceptCapturedAt`, `captureTimes`) and the
 * idempotent create (`withClientRef`).
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { describe, it, expect } from 'vitest';
import { acceptCapturedAt, captureTimes, isSyncedLate } from './offline-capture.js';
import { withClientRef } from './client-ref.js';
import { DAY_MS } from './business-day.js';
import { FieldSite } from '../models/field-site.model.js';

const NOW = new Date('2026-10-23T06:00:00.000Z');
const settings = { offlineMaxAgeDays: 7 };
const MIN = 60_000;

describe('acceptCapturedAt', () => {
  it('is now when absent', () => {
    expect(acceptCapturedAt(undefined, settings, NOW).toISOString()).toBe(NOW.toISOString());
    expect(acceptCapturedAt(null, settings, NOW).toISOString()).toBe(NOW.toISOString());
    expect(acceptCapturedAt('', settings, NOW).toISOString()).toBe(NOW.toISOString());
  });

  it('honours a past time within offlineMaxAgeDays', () => {
    const at = new Date(NOW.getTime() - 3 * DAY_MS);
    expect(acceptCapturedAt(at.toISOString(), settings, NOW).toISOString()).toBe(at.toISOString());
    const edge = new Date(NOW.getTime() - 7 * DAY_MS);
    expect(acceptCapturedAt(edge, settings, NOW).toISOString()).toBe(edge.toISOString());
  });

  it('clamps up to 2 minutes of device clock drift to now', () => {
    const ahead = new Date(NOW.getTime() + 90_000);
    expect(acceptCapturedAt(ahead.toISOString(), settings, NOW).toISOString()).toBe(NOW.toISOString());
  });

  it('400 CAPTURED_AT_INVALID: 8 days old, further in the future, or not a date', () => {
    for (const value of [
      new Date(NOW.getTime() - 8 * DAY_MS).toISOString(),
      new Date(NOW.getTime() + 3 * MIN).toISOString(),
      'yesterday-ish',
    ]) {
      expect(() => acceptCapturedAt(value, settings, NOW)).toThrow(
        expect.objectContaining({ statusCode: 400, code: 'CAPTURED_AT_INVALID' }),
      );
    }
    // The window follows the setting.
    expect(() => acceptCapturedAt(new Date(NOW.getTime() - 2 * DAY_MS), { offlineMaxAgeDays: 1 }, NOW)).toThrow(
      expect.objectContaining({ code: 'CAPTURED_AT_INVALID' }),
    );
  });
});

describe('captureTimes / isSyncedLate', () => {
  it('flags syncedLate when the write arrives more than 15 min after capture', () => {
    expect(captureTimes(new Date(NOW.getTime() - 16 * MIN), settings, NOW)).toEqual({
      capturedAt: new Date(NOW.getTime() - 16 * MIN),
      receivedAt: NOW,
      syncedLate: true,
    });
    expect(captureTimes(new Date(NOW.getTime() - 15 * MIN), settings, NOW).syncedLate).toBe(false);
    expect(captureTimes(undefined, settings, NOW)).toEqual({ capturedAt: NOW, receivedAt: NOW, syncedLate: false });
    expect(isSyncedLate(new Date(NOW.getTime() - 3 * DAY_MS), NOW)).toBe(true);
  });
});

describe('withClientRef', () => {
  const make = (clientRef: string | undefined, name: string, createdBy?: Types.ObjectId) => () =>
    FieldSite.create({ clientRef, name, type: 'Branch', createdBy });

  it('creates once per clientRef; replays (and concurrent first attempts) get the stored record', async () => {
    const ref = randomUUID();
    const owner = new Types.ObjectId();
    const first = await withClientRef(FieldSite, ref, make(ref, 'First', owner), { createdBy: owner });
    expect(first.created).toBe(true);
    const replay = await withClientRef(FieldSite, ref, make(ref, 'Second', owner), { createdBy: owner });
    expect(replay).toMatchObject({ created: false });
    expect(String(replay.doc._id)).toBe(String(first.doc._id));
    expect(replay.doc.name).toBe('First');

    const ref2 = randomUUID();
    const racing = await Promise.all(
      Array.from({ length: 5 }, () => withClientRef(FieldSite, ref2, make(ref2, 'Race', owner), { createdBy: owner })),
    );
    expect(racing.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(racing.map((r) => String(r.doc._id))).size).toBe(1);
    expect(await FieldSite.countDocuments({ clientRef: ref2 })).toBe(1);
  });

  it('without a clientRef always creates; a reference owned outside the scope is a 409', async () => {
    await withClientRef(FieldSite, undefined, make(undefined, 'A'));
    await withClientRef(FieldSite, undefined, make(undefined, 'B'));
    expect(await FieldSite.countDocuments()).toBe(2);

    const ref = randomUUID();
    await withClientRef(FieldSite, ref, make(ref, 'Mine', new Types.ObjectId()));
    const other = new Types.ObjectId();
    await expect(withClientRef(FieldSite, ref, make(ref, 'Theirs', other), { createdBy: other })).rejects.toMatchObject({
      statusCode: 409,
      code: 'CLIENT_REF_CONFLICT',
    });
  });

  it('other duplicate-key errors are not swallowed', async () => {
    const ref = randomUUID();
    const failing = async () => {
      const err = Object.assign(new Error('E11000 duplicate key error collection: x index: email_1'), {
        code: 11000,
        keyPattern: { email: 1 },
      });
      throw err;
    };
    await expect(withClientRef(FieldSite, ref, failing as never)).rejects.toThrow(/email_1/);
  });
});
