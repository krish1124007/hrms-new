/**
 * Recurring visits (`/field/visit-schedules`) and the nightly field run
 * (`runFieldNightly`, queued at 00:15 IST by jobs/field.jobs.ts): planned
 * visits 7 days ahead exactly once per schedule and date, yesterday's
 * planned visits marked missed, previous days' open visits auto-closed.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { Visit } from '../models/visit.model.js';
import { VisitSchedule } from '../models/visit-schedule.model.js';
import { DAY_MS } from '../lib/business-day.js';
import { runFieldNightly } from '../services/field-visits.service.js';
import {
  auth,
  dayLabel,
  fieldManager,
  istAt,
  pinnedSite,
  viewer,
  ymd,
  type FieldActor,
} from '../test/field-fixtures.js';

let app: Express;
let rep: FieldActor;
let lead: FieldActor;
let other: FieldActor;
let M: FieldActor;

beforeEach(async () => {
  app = createApp();
  lead = await viewer();
  rep = await viewer({ reportingManager: lead.employee._id });
  other = await viewer();
  M = await fieldManager();
});

const create = (who: { token: string }, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visit-schedules').set(auth(who.token)).send(body);

/** ISO weekday (1 = Mon … 7 = Sun) of a day label. */
const isoWeekday = (label: Date) => ((label.getUTCDay() + 6) % 7) + 1;
const plannedDates = async (scheduleId: string) =>
  (await Visit.find({ scheduleId }).sort({ plannedDate: 1 }).lean()).map((v) => v.plannedDate!.toISOString().slice(0, 10));

describe('visit schedules', () => {
  it('a weekly schedule creates its planned visits for the next 7 days at once; the list is populated', async () => {
    const site = await pinnedSite([rep.employee]);
    const in2 = isoWeekday(dayLabel(2));
    const in5 = isoWeekday(dayLabel(5));
    const res = await create(lead, {
      siteId: String(site._id),
      employeeId: String(rep.employee._id),
      purpose: 'Maintenance',
      rule: { freq: 'weekly', weekdays: [in5, in2], startDate: ymd(0) },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rule).toMatchObject({ freq: 'weekly', weekdays: [in2, in5].sort(), startDate: ymd(0) });
    expect(await plannedDates(res.body.data._id)).toEqual([ymd(2), ymd(5)]);
    const planned = await Visit.findOne({ scheduleId: res.body.data._id }).lean();
    expect(planned).toMatchObject({ status: 'planned', purpose: 'Maintenance' });
    expect(String(planned?.employeeId)).toBe(String(rep.employee._id));

    const list = await request(app).get('/api/v1/field/visit-schedules').set(auth(lead.token));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      purpose: 'Maintenance',
      site: { _id: String(site._id), name: 'Acme Plant' },
      employee: { _id: String(rep.employee._id) },
      siteId: { _id: String(site._id), name: 'Acme Plant' },
      employeeId: { _id: String(rep.employee._id) },
    });
    // The report sees it too; a stranger does not.
    expect((await request(app).get('/api/v1/field/visit-schedules').set(auth(rep.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/v1/field/visit-schedules').set(auth(other.token))).body.data).toHaveLength(0);
  });

  it('validates the rule: weekdays 1–7 for weekly, dayOfMonth 1–28 for monthly, end after start', async () => {
    const site = await pinnedSite([rep.employee]);
    const base = { siteId: String(site._id), employeeId: String(rep.employee._id), purpose: 'Audit' };
    expect((await create(lead, { ...base, rule: { freq: 'weekly', weekdays: [], startDate: ymd(0) } })).status).toBe(400);
    expect((await create(lead, { ...base, rule: { freq: 'weekly', weekdays: [8], startDate: ymd(0) } })).status).toBe(400);
    expect((await create(lead, { ...base, rule: { freq: 'monthly', dayOfMonth: 29, startDate: ymd(0) } })).status).toBe(400);
    expect((await create(lead, { ...base, rule: { freq: 'monthly', startDate: ymd(0) } })).status).toBe(400);
    expect((await create(lead, { ...base, rule: { freq: 'monthly', dayOfMonth: 5, startDate: ymd(3), endDate: ymd(1) } })).status).toBe(400);
    expect((await create(lead, { ...base, purpose: 'Party', rule: { freq: 'monthly', dayOfMonth: 5, startDate: ymd(0) } })).status).toBe(400);
    const ok = await create(lead, { ...base, rule: { freq: 'monthly', dayOfMonth: 28, startDate: ymd(0) } });
    expect(ok.status).toBe(201);
  });

  it('field.view: self and direct reports only (403 for others); field.manage: anyone', async () => {
    const site = await pinnedSite([rep.employee, other.employee]);
    const rule = { freq: 'monthly', dayOfMonth: 1, startDate: ymd(0) };
    expect((await create(lead, { siteId: String(site._id), employeeId: String(other.employee._id), purpose: 'Audit', rule })).status).toBe(403);
    expect((await create(rep, { siteId: String(site._id), employeeId: String(lead.employee._id), purpose: 'Audit', rule })).status).toBe(403);
    expect((await create(M, { siteId: String(site._id), employeeId: String(other.employee._id), purpose: 'Audit', rule })).status).toBe(201);
  });

  it('PATCH re-plans the future visits; DELETE removes the planned ones from tomorrow on', async () => {
    const site = await pinnedSite([rep.employee]);
    const every = [1, 2, 3, 4, 5, 6, 7];
    const res = await create(lead, {
      siteId: String(site._id),
      employeeId: String(rep.employee._id),
      purpose: 'Maintenance',
      rule: { freq: 'weekly', weekdays: every, startDate: ymd(0) },
    });
    const id = res.body.data._id as string;
    expect(await plannedDates(id)).toEqual([0, 1, 2, 3, 4, 5, 6].map((n) => ymd(n)));

    const only = isoWeekday(dayLabel(3));
    const patched = await request(app)
      .patch(`/api/v1/field/visit-schedules/${id}`)
      .set(auth(lead.token))
      .send({ purpose: 'Inspection', rule: { freq: 'weekly', weekdays: [only], startDate: ymd(0) } });
    expect(patched.status).toBe(200);
    // Today's visit stays as it was; from tomorrow only the new weekday remains, with the new purpose.
    expect(await plannedDates(id)).toEqual([ymd(0), ymd(3)]);
    const future = await Visit.findOne({ scheduleId: id, plannedDate: dayLabel(3) }).lean();
    expect(future?.purpose).toBe('Inspection');

    expect((await request(app).delete(`/api/v1/field/visit-schedules/${id}`).set(auth(other.token))).status).toBe(403);
    const removed = await request(app).delete(`/api/v1/field/visit-schedules/${id}`).set(auth(lead.token));
    expect(removed.status).toBe(200);
    expect(await plannedDates(id)).toEqual([ymd(0)]);
    expect(await VisitSchedule.countDocuments({})).toBe(0);
    // A deleted schedule plans nothing more.
    await runFieldNightly(new Date(Date.now() + DAY_MS));
    expect(await plannedDates(id)).toEqual([ymd(0)]);
  });
});

describe('the nightly field run', () => {
  it('plans schedule visits 7 days ahead exactly once per date', async () => {
    const site = await pinnedSite([rep.employee]);
    const schedule = await VisitSchedule.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Maintenance',
      rule: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dayLabel(0) },
    });
    const first = await runFieldNightly(new Date());
    expect(first.planned).toBe(7);
    const again = await runFieldNightly(new Date());
    expect(again.planned).toBe(0);
    // The next night adds only the new seventh day.
    const tomorrow = await runFieldNightly(new Date(Date.now() + DAY_MS));
    expect(tomorrow.planned).toBe(1);
    expect(await plannedDates(String(schedule._id))).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => ymd(n)));
    // A cancelled occurrence is not planned again.
    await Visit.updateOne({ scheduleId: schedule._id, plannedDate: dayLabel(4) }, { $set: { status: 'cancelled' } });
    await runFieldNightly(new Date());
    expect(await Visit.countDocuments({ scheduleId: schedule._id })).toBe(8);
  });

  it('respects start and end dates, monthly days, and skips deleted sites', async () => {
    const site = await pinnedSite([rep.employee]);
    const gone = await pinnedSite([rep.employee], { name: 'Closed', isDeleted: true });
    const in3 = dayLabel(3);
    const monthly = await VisitSchedule.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Audit',
      rule: { freq: 'monthly', dayOfMonth: Math.min(28, in3.getUTCDate()), startDate: dayLabel(0) },
    });
    const ended = await VisitSchedule.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Audit',
      rule: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dayLabel(-10), endDate: dayLabel(1) },
    });
    await VisitSchedule.create({
      employeeId: rep.employee._id,
      siteId: gone._id,
      purpose: 'Audit',
      rule: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7], startDate: dayLabel(0) },
    });
    await runFieldNightly(new Date());
    expect(await plannedDates(String(ended._id))).toEqual([ymd(0), ymd(1)]);
    if (in3.getUTCDate() <= 28) expect(await plannedDates(String(monthly._id))).toEqual([ymd(3)]);
    expect(await Visit.countDocuments({ siteId: gone._id })).toBe(0);
  });

  it('marks yesterday’s still-planned visits missed (today’s and done ones untouched)', async () => {
    const site = await pinnedSite([rep.employee]);
    const yesterday = await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'planned', plannedDate: dayLabel(-1) });
    const today = await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'planned', plannedDate: dayLabel(0) });
    const cancelled = await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'cancelled', plannedDate: dayLabel(-1) });
    const counts = await runFieldNightly(new Date());
    expect(counts.missed).toBe(1);
    expect((await Visit.findById(yesterday._id).lean())?.status).toBe('missed');
    expect((await Visit.findById(today._id).lean())?.status).toBe('planned');
    expect((await Visit.findById(cancelled._id).lean())?.status).toBe('cancelled');
  });

  it('auto-closes visits still open from previous days at autoCloseTime, flagged autoClosed', async () => {
    const site = await pinnedSite([rep.employee]);
    const forgotten = await Visit.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Meeting',
      status: 'in_progress',
      checkIn: { time: istAt(-1, '18:00') },
    });
    const late = await Visit.create({
      employeeId: other.employee._id,
      siteId: site._id,
      purpose: 'Meeting',
      status: 'in_progress',
      checkIn: { time: istAt(-1, '23:45') },
    });
    const counts = await runFieldNightly(new Date());
    expect(counts.autoClosed).toBe(2);
    const closed = await Visit.findById(forgotten._id).lean();
    expect(closed).toMatchObject({ status: 'completed', durationMinutes: 330, flags: { autoClosed: true } });
    expect(closed?.checkOut?.time?.toISOString()).toBe(istAt(-1, '23:30').toISOString());
    // Checked in after the auto-close time: closed at its check-in, never before it.
    expect((await Visit.findById(late._id).lean())?.checkOut?.time?.toISOString()).toBe(istAt(-1, '23:45').toISOString());
    expect((await runFieldNightly(new Date())).autoClosed).toBe(0);
  });

  it('leaves today’s open visit open', async () => {
    const site = await pinnedSite([rep.employee]);
    const open = await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Meeting', status: 'in_progress', checkIn: { time: new Date() } });
    await runFieldNightly(new Date());
    expect((await Visit.findById(open._id).lean())?.status).toBe('in_progress');
  });
});
