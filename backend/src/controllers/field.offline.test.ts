/**
 * Offline-safe writes (Review Focus 1–2): every check-in / check-out /
 * report / task completion carries `clientRef` + `capturedAt`. A replay
 * returns the stored record (200), never a second one; a visit captured days
 * ago lands on its own business day, counts as that day's attendance when
 * there was none, and is flagged `syncedLate`; a late check-out replaces the
 * nightly auto-close.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { Notification } from '../models/notification.model.js';
import { Attendance } from '../models/attendance.model.js';
import { DAY_MS } from '../lib/business-day.js';
import { runFieldNightly } from '../services/field-visits.service.js';
import {
  auth,
  dayLabel,
  istAt,
  MUMBAI,
  photoKey,
  pinnedSite,
  setFieldSettings,
  viewer,
  ymd,
  type FieldActor,
} from '../test/field-fixtures.js';

let app: Express;
let rep: FieldActor;
let lead: FieldActor;

beforeEach(async () => {
  app = createApp();
  lead = await viewer();
  rep = await viewer({ reportingManager: lead.employee._id });
  await setFieldSettings({ selfieRequired: false });
});

const checkIn = (body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visits/check-in').set(auth(rep.token)).send(body);
const checkOut = (id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/field/visits/${id}/check-out`).set(auth(rep.token)).send(body);

describe('replays', () => {
  it('the same check-in sent twice → one visit; the replay answers 200 with it', async () => {
    const site = await pinnedSite([rep.employee]);
    const body = { clientRef: randomUUID(), capturedAt: new Date().toISOString(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI };
    const first = await checkIn(body);
    const replay = await checkIn(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.data._id).toBe(first.body.data._id);
    expect(replay.body.data.clientRef).toBe(body.clientRef);
    expect(await Visit.countDocuments({})).toBe(1);
    expect((await FieldSite.findById(site._id).lean())?.visitCount).toBe(1);
  });

  it('a replayed check-in still answers 200 after the visit was checked out', async () => {
    const site = await pinnedSite([rep.employee]);
    const body = { clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' };
    const first = await checkIn(body);
    await checkOut(first.body.data._id, { clientRef: randomUUID() });
    const replay = await checkIn(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ _id: first.body.data._id, status: 'completed' });
  });

  it('pin + check-in replayed → one site, one visit', async () => {
    const body = {
      clientRef: randomUUID(),
      purpose: 'Survey',
      location: MUMBAI,
      newSite: { name: 'Village Office', type: 'Government office', location: MUMBAI },
    };
    const first = await checkIn(body);
    const replay = await checkIn(body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(await FieldSite.countDocuments({ name: 'Village Office' })).toBe(1);
    expect(await Visit.countDocuments({})).toBe(1);
  });

  it('the same check-out sent twice → applied once, the replay answers 200', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    const body = { clientRef: randomUUID(), capturedAt: new Date().toISOString(), report: { notes: 'Done', outcome: 'completed' } };
    const first = await checkOut(visit.body.data._id, body);
    const replay = await checkOut(visit.body.data._id, body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.checkOut.at).toBe(first.body.data.checkOut.at);
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });

  it('the same report edit sent twice → photos added once, no second notice', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    const id = visit.body.data._id;
    await checkOut(id, { clientRef: randomUUID() });
    const body = { clientRef: randomUUID(), capturedAt: new Date().toISOString(), notes: 'Filed offline', photos: [await photoKey(app, rep)] };
    const first = await request(app).patch(`/api/v1/field/visits/${id}/report`).set(auth(rep.token)).send(body);
    const replay = await request(app).patch(`/api/v1/field/visits/${id}/report`).set(auth(rep.token)).send(body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data.report.photos).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });

  it('the same task completion sent twice → 200 both times, one notice', async () => {
    const task = await FieldTask.create({ title: 'Collect the form', assignedTo: rep.employee._id });
    const body = { clientRef: randomUUID(), capturedAt: new Date().toISOString(), notes: 'Collected', photoKeys: [await photoKey(app, rep)] };
    const first = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(rep.token)).send(body);
    const replay = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(rep.token)).send(body);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.data).toMatchObject({ status: 'completed', completionNotes: 'Collected' });
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
    // A different completion of a closed task is still refused.
    const again = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(rep.token)).send({ clientRef: randomUUID() });
    expect(again.status).toBe(409);
  });
});

describe('captured offline, synced days later', () => {
  it('lands on its own business day, syncedLate, and becomes that day’s attendance check-in', async () => {
    const site = await pinnedSite([rep.employee]);
    const capturedIn = istAt(-3, '10:05');
    const visit = await checkIn({
      clientRef: randomUUID(),
      capturedAt: capturedIn.toISOString(),
      siteId: String(site._id),
      purpose: 'Meeting',
      location: MUMBAI,
    });
    expect(visit.status).toBe(201);
    expect(visit.body.data.checkIn.at).toBe(capturedIn.toISOString());
    expect(visit.body.data.flags).toMatchObject({ syncedLate: true, capturedOffline: true });

    const out = await checkOut(visit.body.data._id, {
      clientRef: randomUUID(),
      capturedAt: istAt(-3, '11:00').toISOString(),
      report: { outcome: 'completed' },
    });
    expect(out.status).toBe(200);
    expect(out.body.data.durationMinutes).toBe(55);
    // The report counts as filed when it was filed on the phone, not when it synced.
    expect(out.body.data.report.submittedAt).toBe(istAt(-3, '11:00').toISOString());

    const day = await request(app).get('/api/v1/field/my-day').query({ date: ymd(-3) }).set(auth(rep.token));
    expect(day.body.data.completed.map((v: { clientRef: string }) => v.clientRef)).toEqual([visit.body.data.clientRef]);
    const att = await Attendance.findOne({ employeeId: rep.employee._id, date: dayLabel(-3) }).lean();
    expect(att?.checkIn?.time?.toISOString()).toBe(capturedIn.toISOString());
    expect(att?.checkIn?.method).toBe('field_visit');
    expect(await Attendance.countDocuments({ employeeId: rep.employee._id })).toBe(1);
  });

  it('leaves an existing attendance check-in of that day alone', async () => {
    const site = await pinnedSite([rep.employee]);
    const punched = istAt(-2, '09:30');
    await Attendance.create({ employeeId: rep.employee._id, date: dayLabel(-2), checkIn: { time: punched, method: 'manual' }, status: 'present' });
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-2, '10:05').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    expect(visit.status).toBe(201);
    const att = await Attendance.find({ employeeId: rep.employee._id }).lean();
    expect(att).toHaveLength(1);
    expect(att[0]?.checkIn?.time?.toISOString()).toBe(punched.toISOString());
    expect(att[0]?.checkIn?.method).toBe('manual');
  });

  it('an older day’s replay is accepted while a visit is open today', async () => {
    const site = await pinnedSite([rep.employee]);
    const open = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    expect(open.status).toBe(201);
    const old = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '15:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    expect(old.status).toBe(201);
    const closed = await checkOut(old.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-1, '15:40').toISOString() });
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('completed');
  });

  it('older than offlineMaxAgeDays → 400 CAPTURED_AT_INVALID', async () => {
    const site = await pinnedSite([rep.employee]);
    const tooOld = await checkIn({ clientRef: randomUUID(), capturedAt: new Date(Date.now() - 8 * DAY_MS).toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    expect(tooOld.status).toBe(400);
    expect(tooOld.body.error.code).toBe('CAPTURED_AT_INVALID');
  });

  it('a capturedAt ahead of the server (phone clock fast) is not honoured: the arrival time is used, nothing flagged', async () => {
    const site = await pinnedSite([rep.employee]);
    const sent = new Date(Date.now() + 5 * 60_000).toISOString();
    const before = Date.now();
    const future = await checkIn({ clientRef: randomUUID(), capturedAt: sent, siteId: String(site._id), purpose: 'Meeting' });
    expect(future.status).toBe(201);
    const at = new Date(future.body.data.checkIn.at).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(future.body.data.flags).toMatchObject({ syncedLate: false, capturedOffline: false });
    const out = await checkOut(future.body.data._id, { clientRef: randomUUID(), capturedAt: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect(out.status).toBe(200);
    expect(new Date(out.body.data.checkOut.at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('a check-out captured before the check-in → 400 CHECKOUT_BEFORE_CHECKIN', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '12:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    const res = await checkOut(visit.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-1, '11:00').toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CHECKOUT_BEFORE_CHECKIN');
  });

  it('a late check-out replaces the nightly auto-close and clears autoClosed', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '16:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    await runFieldNightly(new Date());
    const auto = await Visit.findById(visit.body.data._id).lean();
    expect(auto).toMatchObject({ status: 'completed', flags: { autoClosed: true } });
    expect(auto?.checkOut?.time?.toISOString()).toBe(istAt(-1, '23:30').toISOString());

    const real = await checkOut(visit.body.data._id, {
      clientRef: randomUUID(),
      capturedAt: istAt(-1, '17:15').toISOString(),
      report: { outcome: 'completed', notes: 'Synced next morning' },
    });
    expect(real.status).toBe(200);
    expect(real.body.data.flags.autoClosed).toBe(false);
    expect(real.body.data.checkOut.at).toBe(istAt(-1, '17:15').toISOString());
    expect(real.body.data.durationMinutes).toBe(75);
    expect(real.body.data.report.notes).toBe('Synced next morning');
  });
});
