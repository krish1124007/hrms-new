/**
 * Holiday calendar: rolling the recurring holidays into a new year, and an
 * import that does not duplicate what is already there.
 *
 * Holiday dates are business-day labels (UTC midnight of the IST calendar
 * date). Import used to be a bare `insertMany`, so importing the same
 * calendar twice doubled every holiday (or, with the unique index, failed
 * the whole batch on the first repeat).
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser } from '../test/factories.js';
import { Holiday } from '../models/holiday.model.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

let app: Express;
let hrToken: string;

beforeEach(async () => {
  app = createApp();
  ({ token: hrToken } = await createUser({ roleSlug: 'hr_executive' }));
});

const holidaysOn = async (iso: string) =>
  Holiday.find({ date: label(iso) }).lean().exec();

describe('POST /holidays/rollover', () => {
  it('2026 → 2027 copies the recurring holiday and not the one-off', async () => {
    await Holiday.create({ name: 'Republic Day', date: label('2026-01-26'), type: 'public', isRecurring: true, description: 'National' });
    await Holiday.create({ name: 'Company Offsite', date: label('2026-03-10'), type: 'public', isRecurring: false });

    const res = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({ year: 2027 });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ created: 1, skipped: 0 });
    const copied = await holidaysOn('2027-01-26');
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ name: 'Republic Day', type: 'public', isRecurring: true, description: 'National' });
    expect(await holidaysOn('2027-03-10')).toHaveLength(0);
    expect(await Holiday.countDocuments({})).toBe(3);
  });

  it('a second rollover skips what is already there', async () => {
    await Holiday.create({ name: 'Republic Day', date: label('2026-01-26'), isRecurring: true });
    await Holiday.create({ name: 'Independence Day', date: label('2026-08-15'), isRecurring: true });
    await Holiday.create({ name: 'Independence Day', date: label('2027-08-15') }); // added by hand

    const first = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({ year: 2027 });
    const second = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({ year: 2027 });

    expect(first.body.data).toEqual({ created: 1, skipped: 1 });
    expect(second.body.data).toEqual({ created: 0, skipped: 2 });
    expect(await holidaysOn('2027-08-15')).toHaveLength(1);
  });

  it('29 Feb lands on 28 Feb in a year that is not a leap year', async () => {
    await Holiday.create({ name: 'Leap Day', date: label('2028-02-29'), isRecurring: true });

    const res = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({ year: 2029 });

    expect(res.body.data).toEqual({ created: 1, skipped: 0 });
    expect(await holidaysOn('2029-02-28')).toHaveLength(1);
  });

  it('reads a holiday stored at IST midnight as the day it names', async () => {
    // 2026-01-01 00:00 IST = 2025-12-31T18:30Z
    await Holiday.create({ name: "New Year's Day", date: new Date('2025-12-31T18:30:00.000Z'), isRecurring: true });

    const res = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({ year: 2027 });

    expect(res.body.data).toEqual({ created: 1, skipped: 0 });
    expect(await holidaysOn('2027-01-01')).toHaveLength(1);
  });

  it('needs holidays.create', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    const res = await request(app).post('/api/v1/holidays/rollover').set(auth(token)).send({ year: 2027 });
    expect(res.status).toBe(403);
  });

  it('rejects a missing year', async () => {
    const res = await request(app).post('/api/v1/holidays/rollover').set(auth(hrToken)).send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /holidays/import-calendar', () => {
  it('skips rows already in the calendar and repeats within the payload', async () => {
    await Holiday.create({ name: 'Diwali', date: label('2026-11-08') });

    const res = await request(app)
      .post('/api/v1/holidays/import-calendar')
      .set(auth(hrToken))
      .send({
        holidays: [
          { name: 'Diwali', date: '2026-11-08' },
          { name: 'Christmas', date: '2026-12-25' },
          { name: 'Christmas', date: '2026-12-25' },
          { name: 'Boxing Day', date: '2026-12-26', type: 'optional' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: 2, skipped: 2 });
    expect(await holidaysOn('2026-11-08')).toHaveLength(1);
    expect(await holidaysOn('2026-12-25')).toHaveLength(1);
    expect((await holidaysOn('2026-12-26'))[0]?.type).toBe('optional');
  });

  it('stores each date as its business-day label', async () => {
    // IST midnight, as a browser in India would send it.
    await request(app)
      .post('/api/v1/holidays/import-calendar')
      .set(auth(hrToken))
      .send({ holidays: [{ name: 'Republic Day', date: '2026-01-25T18:30:00.000Z' }] });

    expect(await holidaysOn('2026-01-26')).toHaveLength(1);
  });

  it('importing the same calendar twice adds nothing the second time', async () => {
    const body = { holidays: [{ name: 'Holi', date: '2026-03-04' }, { name: 'Eid', date: '2026-03-20' }] };
    const first = await request(app).post('/api/v1/holidays/import-calendar').set(auth(hrToken)).send(body);
    const second = await request(app).post('/api/v1/holidays/import-calendar').set(auth(hrToken)).send(body);

    expect(first.body.data).toMatchObject({ created: 2, skipped: 0 });
    expect(second.body.data).toMatchObject({ created: 0, skipped: 2 });
    expect(await Holiday.countDocuments({})).toBe(2);
  });
});
