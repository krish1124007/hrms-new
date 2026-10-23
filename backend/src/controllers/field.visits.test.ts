/**
 * The visit engine (HTTP contract "Visits", "My day", "Tasks at a site"):
 * check-in flags from the site pin and radius, the selfie rule, pin + check
 * in in one step, one open visit, check-out with the work report (photos,
 * documents, people met, checklist, follow-up), the 48-hour edit window,
 * planning by self / manager, cancel, my day, the list filters and the
 * task completion notice. Offline replays live in field.offline.test.ts,
 * schedules and the nightly job in field.schedules.test.ts.
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
import {
  auth,
  dayLabel,
  documentKey,
  fieldManager,
  istAt,
  managerWithoutEmployee,
  MUMBAI,
  north,
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
let other: FieldActor;
let M: FieldActor;

beforeEach(async () => {
  app = createApp();
  lead = await viewer();
  rep = await viewer({ reportingManager: lead.employee._id });
  other = await viewer();
  M = await fieldManager();
});

const checkIn = (who: FieldActor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visits/check-in').set(auth(who.token)).send(body);
const checkOut = (who: FieldActor, id: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/v1/field/visits/${id}/check-out`).set(auth(who.token)).send(body);
const patchReport = (who: { token: string }, id: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/v1/field/visits/${id}/report`).set(auth(who.token)).send(body);
const plan = (who: { token: string }, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visits/plan').set(auth(who.token)).send(body);

/** A check-in body at `site` with a selfie (the default settings require one). */
async function arrival(who: FieldActor, site: { _id: unknown }, extra: Record<string, unknown> = {}) {
  return {
    clientRef: randomUUID(),
    siteId: String(site._id),
    purpose: 'Meeting',
    location: MUMBAI,
    selfieKey: await photoKey(app, who),
    ...extra,
  };
}

describe('check-in', () => {
  it('flags awayFromSite only beyond the site radius, with the distance from the pin', async () => {
    const site = await pinnedSite([rep.employee]);
    const near = await checkIn(rep, await arrival(rep, site, { location: north(MUMBAI, 120) }));
    expect(near.status).toBe(201);
    expect(near.body.data).toMatchObject({
      status: 'in_progress',
      purpose: 'Meeting',
      site: { _id: String(site._id), name: 'Acme Plant', radiusM: 200 },
      employee: { _id: String(rep.employee._id) },
      flags: { awayFromSite: false, noGps: false, noSelfie: false },
    });
    expect(near.body.data.checkIn.distanceM).toBeGreaterThan(110);
    expect(near.body.data.checkIn.distanceM).toBeLessThan(130);
    expect(near.body.data.checkIn.selfieUrl).toContain('sig=');
    expect(near.body.data.clientRef).toBeTruthy();
    await checkOut(rep, near.body.data._id);

    const far = await checkIn(rep, await arrival(rep, site, { location: north(MUMBAI, 450) }));
    expect(far.status).toBe(201);
    expect(far.body.data.flags.awayFromSite).toBe(true);
    expect(far.body.data.checkIn.distanceM).toBeGreaterThan(440);
    // Each check-in counts on the site.
    expect(await FieldSite.findById(site._id).lean()).toMatchObject({ visitCount: 2 });
  });

  it('without a location fix: noGps, never refused', async () => {
    const site = await pinnedSite([rep.employee]);
    const res = await checkIn(rep, await arrival(rep, site, { location: undefined }));
    expect(res.status).toBe(201);
    expect(res.body.data.flags).toMatchObject({ noGps: true, awayFromSite: false });
  });

  it('selfie required by default → 400 SELFIE_REQUIRED; with the setting off → noSelfie flag', async () => {
    const site = await pinnedSite([rep.employee]);
    const refused = await checkIn(rep, await arrival(rep, site, { selfieKey: undefined }));
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('SELFIE_REQUIRED');
    expect(await Visit.countDocuments({})).toBe(0);

    await setFieldSettings({ selfieRequired: false });
    const allowed = await checkIn(rep, await arrival(rep, site, { selfieKey: undefined }));
    expect(allowed.status).toBe(201);
    expect(allowed.body.data.flags.noSelfie).toBe(true);
  });

  it('a selfie key that is not a field upload → 400 INVALID_FILE_KEY', async () => {
    const site = await pinnedSite([rep.employee]);
    const res = await checkIn(rep, await arrival(rep, site, { selfieKey: 'payslips/2026/10/x.pdf' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_KEY');
  });

  it('pins a new site and checks in there in one step', async () => {
    const body = await arrival(rep, { _id: 'x' }, {
      siteId: undefined,
      newSite: { name: 'Roadside Depot', type: 'Vendor', location: north(MUMBAI, 30) },
      location: north(MUMBAI, 30),
    });
    const res = await checkIn(rep, body);
    expect(res.status).toBe(201);
    const site = await FieldSite.findById(res.body.data.site._id).lean();
    expect(site).toMatchObject({ name: 'Roadside Depot', type: 'Vendor', createdVia: 'mobile_pin', visitCount: 1 });
    expect(site?.assignedTo.map(String)).toEqual([String(rep.employee._id)]);
    expect(res.body.data.checkIn.distanceM).toBe(0);
    expect(res.body.data.flags.awayFromSite).toBe(false);
  });

  it('exactly one of visitId / siteId / newSite', async () => {
    const site = await pinnedSite([rep.employee]);
    const none = await checkIn(rep, await arrival(rep, site, { siteId: undefined }));
    expect(none.status).toBe(400);
    const both = await checkIn(
      rep,
      await arrival(rep, site, { newSite: { name: 'X', type: 'Other', location: MUMBAI } }),
    );
    expect(both.status).toBe(400);
  });

  it('purpose must be one of the settings purposes (any case; stored in the settings spelling)', async () => {
    const site = await pinnedSite([rep.employee]);
    const bad = await checkIn(rep, await arrival(rep, site, { purpose: 'Picnic' }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_PURPOSE');
    const ok = await checkIn(rep, await arrival(rep, site, { purpose: 'inspection' }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.purpose).toBe('Inspection');
  });

  it('a second open visit → 409 VISIT_ALREADY_OPEN; after check-out the next may start', async () => {
    const site = await pinnedSite([rep.employee]);
    const first = await checkIn(rep, await arrival(rep, site));
    const second = await checkIn(rep, await arrival(rep, site));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VISIT_ALREADY_OPEN');
    expect(second.body.error.details.visitId).toBe(first.body.data._id);
    expect((await checkOut(rep, first.body.data._id, { clientRef: randomUUID() })).status).toBe(200);
    expect((await checkIn(rep, await arrival(rep, site))).status).toBe(201);
  });

  it('starts a planned visit (same record); someone else’s planned visit → 403', async () => {
    const site = await pinnedSite([rep.employee, other.employee]);
    const planned = await plan(rep, { siteId: String(site._id), plannedDate: ymd(0), purpose: 'Audit' });
    expect(planned.status).toBe(201);
    const started = await checkIn(rep, await arrival(rep, site, { siteId: undefined, visitId: planned.body.data._id, purpose: undefined }));
    expect(started.status).toBe(201);
    expect(started.body.data).toMatchObject({ _id: planned.body.data._id, status: 'in_progress', purpose: 'Audit' });
    expect(await Visit.countDocuments({})).toBe(1);

    const theirs = await plan(other, { siteId: String(site._id), plannedDate: ymd(0), purpose: 'Audit' });
    const stolen = await checkIn(rep, await arrival(rep, site, { siteId: undefined, visitId: theirs.body.data._id }));
    expect(stolen.status).toBe(403);
  });

  it('counts as the day’s attendance check-in when there is none (setting on), not otherwise', async () => {
    const site = await pinnedSite([rep.employee, other.employee]);
    const res = await checkIn(rep, await arrival(rep, site));
    expect(res.status).toBe(201);
    const att = await Attendance.findOne({ employeeId: rep.employee._id }).lean();
    expect(att?.checkIn?.method).toBe('field_visit');
    expect(att?.checkIn?.time?.toISOString()).toBe(res.body.data.checkIn.at);
    expect(att?.checkIn?.location).toMatchObject({ lat: MUMBAI.lat, lng: MUMBAI.lng });

    await setFieldSettings({ visitCountsAsAttendance: false });
    expect((await checkIn(other, await arrival(other, site))).status).toBe(201);
    expect(await Attendance.countDocuments({ employeeId: other.employee._id })).toBe(0);
  });
});

describe('check-out and the work report', () => {
  it('stores the report: photo and document keys become links, people met, outcome; follow-up plans a visit', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site, { capturedAt: new Date(Date.now() - 30 * 60_000).toISOString() }));
    expect(visit.status).toBe(201);
    const photo = await photoKey(app, rep);
    const doc = await documentKey(app, rep);
    const followUp = ymd(3);

    const out = await checkOut(rep, visit.body.data._id, {
      clientRef: randomUUID(),
      location: north(MUMBAI, 20),
      report: {
        notes: 'Met the plant head; meter replaced',
        photos: [photo],
        documents: [{ key: doc, name: 'Minutes.pdf' }],
        peopleMet: [{ name: 'R. Shah', designation: 'Plant head', phone: '9800000000' }],
        outcome: 'follow_up',
        nextAction: 'Bring the signed form',
        followUpDate: followUp,
      },
    });
    expect(out.status).toBe(200);
    const v = out.body.data;
    expect(v.status).toBe('completed');
    expect(v.durationMinutes).toBeGreaterThanOrEqual(29);
    expect(v.flags.shortVisit).toBe(false);
    expect(v.checkOut.distanceM).toBeGreaterThan(10);
    expect(v.report).toMatchObject({
      notes: 'Met the plant head; meter replaced',
      peopleMet: [{ name: 'R. Shah', designation: 'Plant head', phone: '9800000000' }],
      outcome: 'follow_up',
      nextAction: 'Bring the signed form',
      followUpDate: followUp,
      documents: [{ name: 'Minutes.pdf' }],
    });
    expect(v.report.photos[0]).toContain('sig=');
    expect(v.report.documents[0].url).toContain('sig=');
    expect(v.report.submittedAt).toBeTruthy();
    const stored = await Visit.findById(v._id).lean();
    expect(stored?.report?.photos[0]).toBe(`/uploads/${photo}`);
    expect(stored?.report?.documents[0]).toMatchObject({ key: `/uploads/${doc}`, name: 'Minutes.pdf' });

    // The follow-up became a planned visit on that date, same site and employee.
    const next = await Visit.findOne({ _id: { $ne: v._id } }).lean();
    expect(next).toMatchObject({ status: 'planned', purpose: 'Meeting' });
    expect(String(next?.siteId)).toBe(String(site._id));
    expect(String(next?.employeeId)).toBe(String(rep.employee._id));
    expect(next?.plannedDate?.toISOString().slice(0, 10)).toBe(followUp);

    // The reporting manager hears about the report.
    const notes = await Notification.find({ userId: lead.userId }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]?.link).toBe(`/field/visits/${v._id}`);
  });

  it('shorter than shortVisitMinutes → shortVisit', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site, { capturedAt: new Date(Date.now() - 3 * 60_000).toISOString() }));
    const out = await checkOut(rep, visit.body.data._id, { clientRef: randomUUID(), report: { outcome: 'completed' } });
    expect(out.status).toBe(200);
    expect(out.body.data.durationMinutes).toBe(3);
    expect(out.body.data.flags.shortVisit).toBe(true);
  });

  it('only the owner checks out; once', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site));
    expect((await checkOut(other, visit.body.data._id, { clientRef: randomUUID() })).status).toBe(403);
    expect((await checkOut(lead, visit.body.data._id, { clientRef: randomUUID() })).status).toBe(403);
    expect((await checkOut(rep, visit.body.data._id, { clientRef: randomUUID() })).status).toBe(200);
    const again = await checkOut(rep, visit.body.data._id, { clientRef: randomUUID() });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('VISIT_ALREADY_CHECKED_OUT');
  });

  it('checklist answers are checked against the settings checklist for the purpose', async () => {
    await setFieldSettings({
      selfieRequired: false,
      checklists: [
        {
          name: 'Inspection',
          purpose: 'Inspection',
          items: [
            { label: 'Fire exits clear', kind: 'yes_no', required: true },
            { label: 'Condition', kind: 'select', options: ['Good', 'Poor'], required: false },
            { label: 'Meter reading', kind: 'number', required: false },
            { label: 'Panel photo', kind: 'photo', required: false },
          ],
        },
      ],
    });
    const settings = await request(app).get('/api/v1/field/settings').set(auth(rep.token));
    const checklist = settings.body.data.checklists[0];
    const [exits, condition, meter, panel] = checklist.items.map((i: { _id: string }) => i._id);
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, { clientRef: randomUUID(), siteId: String(site._id), purpose: 'Inspection', location: MUMBAI });
    const id = visit.body.data._id;

    const missing = await checkOut(rep, id, {
      clientRef: randomUUID(),
      report: { outcome: 'completed', checklist: { checklistId: checklist._id, answers: [{ itemId: condition, value: 'Good' }] } },
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('CHECKLIST_INCOMPLETE');

    const badOption = await checkOut(rep, id, {
      clientRef: randomUUID(),
      report: {
        outcome: 'completed',
        checklist: { checklistId: checklist._id, answers: [{ itemId: exits, value: true }, { itemId: condition, value: 'Great' }] },
      },
    });
    expect(badOption.status).toBe(400);
    expect(badOption.body.error.code).toBe('INVALID_CHECKLIST_ANSWER');
    expect((await Visit.findById(id).lean())?.status).toBe('in_progress');

    const photo = await photoKey(app, rep);
    const ok = await checkOut(rep, id, {
      clientRef: randomUUID(),
      report: {
        outcome: 'completed',
        checklist: {
          checklistId: checklist._id,
          answers: [
            { itemId: exits, value: true },
            { itemId: condition, value: 'Poor' },
            { itemId: meter, value: '42.5' },
            { itemId: panel, value: photo },
          ],
        },
      },
    });
    expect(ok.status).toBe(200);
    const answers = ok.body.data.report.checklist.answers as Array<{ itemId: string; value: unknown }>;
    expect(answers.find((a) => a.itemId === exits)?.value).toBe(true);
    expect(answers.find((a) => a.itemId === meter)?.value).toBe(42.5);
    expect(String(answers.find((a) => a.itemId === panel)?.value)).toContain('sig=');
  });

  it('PATCH report merges: a partial edit keeps the rest, photos are added; manager notified once', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site));
    const id = visit.body.data._id;
    const first = await photoKey(app, rep);
    await checkOut(rep, id, {
      clientRef: randomUUID(),
      report: { notes: 'Initial', photos: [first], peopleMet: [{ name: 'A. Rao' }], outcome: 'completed' },
    });
    const second = await photoKey(app, rep);

    const notesOnly = await patchReport(rep, id, { clientRef: randomUUID(), notes: 'Corrected notes' });
    expect(notesOnly.status).toBe(200);
    expect(notesOnly.body.data.report).toMatchObject({ notes: 'Corrected notes', peopleMet: [{ name: 'A. Rao' }], outcome: 'completed' });
    expect(notesOnly.body.data.report.photos).toHaveLength(1);

    const morePhotos = await patchReport(rep, id, { clientRef: randomUUID(), photos: [second] });
    expect(morePhotos.status).toBe(200);
    expect(morePhotos.body.data.report.photos).toHaveLength(2);
    expect(morePhotos.body.data.report.notes).toBe('Corrected notes');
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });

  it('a report filed later (no report at check-out) is a first submission and notifies the manager', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site));
    await checkOut(rep, visit.body.data._id, { clientRef: randomUUID() });
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(0);
    const res = await patchReport(rep, visit.body.data._id, { clientRef: randomUUID(), notes: 'Late report', outcome: 'other' });
    expect(res.status).toBe(200);
    expect(res.body.data.report.submittedAt).toBeTruthy();
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });

  it('report edits: owner within 48 h of check-out (403 after), a field manager any time, nobody else', async () => {
    const site = await pinnedSite([rep.employee]);
    const old = new Date(Date.now() - 3 * DAY_MS);
    const visit = await Visit.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Meeting',
      status: 'completed',
      checkIn: { time: new Date(old.getTime() - 3_600_000), receivedAt: new Date(old.getTime() - 3_600_000) },
      checkOut: { time: old, receivedAt: old },
      report: { notes: 'Old', outcome: 'completed', submittedAt: old },
    });
    const late = await patchReport(rep, String(visit._id), { clientRef: randomUUID(), notes: 'Too late' });
    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe('EDIT_WINDOW_CLOSED');
    expect((await patchReport(lead, String(visit._id), { notes: 'Lead edit' })).status).toBe(403);
    const byManager = await patchReport(M, String(visit._id), { notes: 'Fixed by HR' });
    expect(byManager.status).toBe(200);
    expect(byManager.body.data.report.notes).toBe('Fixed by HR');
  });
});

describe('planning', () => {
  it('a field.view holder plans for self and direct reports (notified), 403 for anyone else; a manager for anyone', async () => {
    const site = await pinnedSite([rep.employee, other.employee, lead.employee]);
    const own = await plan(lead, { siteId: String(site._id), plannedDate: ymd(1), purpose: 'Audit', notes: 'Bring the file' });
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ status: 'planned', plannedDate: ymd(1), purpose: 'Audit', notes: 'Bring the file' });
    expect(own.body.data.employee._id).toBe(String(lead.employee._id));

    const forReport = await plan(lead, { siteId: String(site._id), employeeId: String(rep.employee._id), plannedDate: ymd(2), purpose: 'Survey' });
    expect(forReport.status).toBe(201);
    expect(forReport.body.data.employee._id).toBe(String(rep.employee._id));
    const notice = await Notification.findOne({ userId: rep.userId }).lean();
    expect(notice?.link).toBe('/field/my-day');

    const forStranger = await plan(lead, { siteId: String(site._id), employeeId: String(other.employee._id), plannedDate: ymd(2), purpose: 'Survey' });
    expect(forStranger.status).toBe(403);

    const byManager = await plan(M, { siteId: String(site._id), employeeId: String(other.employee._id), plannedDate: ymd(2), purpose: 'Survey' });
    expect(byManager.status).toBe(201);
  });

  it('a past date → 400; an unknown purpose → 400', async () => {
    const site = await pinnedSite([rep.employee]);
    const past = await plan(rep, { siteId: String(site._id), plannedDate: ymd(-1), purpose: 'Audit' });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('PLANNED_DATE_PAST');
    const purpose = await plan(rep, { siteId: String(site._id), plannedDate: ymd(1), purpose: 'Party' });
    expect(purpose.status).toBe(400);
  });

  it('cancel: the owner cancels a planned visit with a reason; a completed one cannot be cancelled', async () => {
    const site = await pinnedSite([rep.employee]);
    const planned = await plan(lead, { siteId: String(site._id), employeeId: String(rep.employee._id), plannedDate: ymd(1), purpose: 'Audit' });
    expect((await request(app).post(`/api/v1/field/visits/${planned.body.data._id}/cancel`).set(auth(other.token)).send({ reason: 'x' })).status).toBe(403);
    const cancelled = await request(app)
      .post(`/api/v1/field/visits/${planned.body.data._id}/cancel`)
      .set(auth(rep.token))
      .send({ reason: 'Site closed for Diwali' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Site closed for Diwali' });

    const visit = await checkIn(rep, await arrival(rep, site));
    await checkOut(rep, visit.body.data._id, { clientRef: randomUUID() });
    const closed = await request(app).post(`/api/v1/field/visits/${visit.body.data._id}/cancel`).set(auth(M.token)).send({ reason: 'x' });
    expect(closed.status).toBe(409);
  });
});

describe('my day', () => {
  it('lists the day: in progress, planned, completed, missed, tasks and attendance', async () => {
    const site = await pinnedSite([rep.employee]);
    const today = dayLabel(0);
    await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'planned', plannedDate: today });
    await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'missed', plannedDate: today });
    await Visit.create({
      employeeId: rep.employee._id,
      siteId: site._id,
      purpose: 'Meeting',
      status: 'completed',
      checkIn: { time: istAt(0, '00:05') },
      checkOut: { time: istAt(0, '00:35') },
    });
    // Another day, and someone else's: not listed.
    await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Audit', status: 'planned', plannedDate: dayLabel(1) });
    await Visit.create({ employeeId: other.employee._id, siteId: site._id, purpose: 'Audit', status: 'planned', plannedDate: today });
    const open = await checkIn(rep, await arrival(rep, site));
    await FieldTask.create({ title: 'Read the meter', assignedTo: rep.employee._id, siteId: site._id, dueDate: today });
    await FieldTask.create({ title: 'Someone else’s', assignedTo: other.employee._id });

    const res = await request(app).get('/api/v1/field/my-day').query({ date: ymd(0) }).set(auth(rep.token));
    expect(res.status).toBe(200);
    const day = res.body.data;
    expect(day.date).toBe(ymd(0));
    expect(day.inProgress?._id).toBe(open.body.data._id);
    expect(day.inProgress.clientRef).toBe(open.body.data.clientRef);
    expect(day.planned).toHaveLength(1);
    expect(day.missed).toHaveLength(1);
    expect(day.completed).toHaveLength(1);
    expect(day.tasks).toHaveLength(1);
    expect(day.tasks[0].siteId).toMatchObject({ _id: String(site._id), name: 'Acme Plant' });
    expect(day.attendance.checkedInAt).toBe(open.body.data.checkIn.at);
  });

  it('404 NO_EMPLOYEE_PROFILE for a field manager without an employee record', async () => {
    const admin = await managerWithoutEmployee();
    const res = await request(app).get('/api/v1/field/my-day').set(auth(admin.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('GET /visits', () => {
  it('scope: own + direct reports for field.view; filters by from/to (IST days), status and site', async () => {
    const site = await pinnedSite([rep.employee, other.employee, lead.employee]);
    const elsewhere = await pinnedSite([rep.employee], { name: 'Elsewhere' });
    const mk = (employee: FieldActor, n: number, siteId: unknown = site._id, status = 'completed') =>
      Visit.create({
        employeeId: employee.employee._id,
        siteId,
        purpose: 'Meeting',
        status,
        checkIn: { time: istAt(n, '11:00') },
        checkOut: { time: istAt(n, '11:30') },
      });
    const repToday = await mk(rep, 0);
    const repOld = await mk(rep, -5);
    const repElsewhere = await mk(rep, 0, elsewhere._id);
    await mk(other, 0);

    const ids = (res: request.Response) => (res.body.data as Array<{ _id: string }>).map((v) => v._id).sort();
    const all = await request(app).get('/api/v1/field/visits').set(auth(lead.token));
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual([repToday, repOld, repElsewhere].map((v) => String(v._id)).sort());

    const today = await request(app).get('/api/v1/field/visits').query({ from: ymd(0), to: ymd(0) }).set(auth(lead.token));
    expect(ids(today)).toEqual([repToday, repElsewhere].map((v) => String(v._id)).sort());

    const atSite = await request(app).get('/api/v1/field/visits').query({ siteId: String(elsewhere._id) }).set(auth(rep.token));
    expect(ids(atSite)).toEqual([String(repElsewhere._id)]);

    const planned = await request(app).get('/api/v1/field/visits').query({ status: 'planned' }).set(auth(rep.token));
    expect(planned.body.data).toEqual([]);

    const forManager = await request(app).get('/api/v1/field/visits').query({ employeeId: String(other.employee._id) }).set(auth(M.token));
    expect(forManager.body.data).toHaveLength(1);
    expect(forManager.body.data[0]).toMatchObject({ employee: { _id: String(other.employee._id) }, site: { name: 'Acme Plant' } });
  });

  it('GET /visits/:id: 403 outside the scope', async () => {
    const site = await pinnedSite([other.employee]);
    const theirs = await Visit.create({ employeeId: other.employee._id, siteId: site._id, purpose: 'Meeting', status: 'planned', plannedDate: dayLabel(1) });
    expect((await request(app).get(`/api/v1/field/visits/${theirs._id}`).set(auth(rep.token))).status).toBe(403);
    const shown = await request(app).get(`/api/v1/field/visits/${theirs._id}`).set(auth(M.token));
    expect(shown.status).toBe(200);
    expect(shown.body.data).toMatchObject({ status: 'planned', plannedDate: ymd(1), flags: { autoClosed: false } });
  });
});

describe('sites (Task 1 endpoints the visit engine feeds)', () => {
  it('GET /sites/:id recentVisits are Visit-shaped', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn(rep, await arrival(rep, site, { location: north(MUMBAI, 450) }));
    const res = await request(app).get(`/api/v1/field/sites/${site._id}`).set(auth(rep.token));
    expect(res.status).toBe(200);
    expect(res.body.data.recentVisits[0]).toMatchObject({
      _id: visit.body.data._id,
      clientRef: visit.body.data.clientRef,
      status: 'in_progress',
      purpose: 'Meeting',
      employee: { _id: String(rep.employee._id) },
      flags: { awayFromSite: true },
    });
    expect(res.body.data.recentVisits[0].checkIn.at).toBe(visit.body.data.checkIn.at);
  });

  it('GET /sites combines near + radiusKm with search and type', async () => {
    await pinnedSite([rep.employee], { name: 'Alpha Works', type: 'Branch' });
    await pinnedSite([rep.employee], { name: 'Alpha Far', type: 'Branch' }, north(MUMBAI, 30_000));
    await pinnedSite([rep.employee], { name: 'Beta Works', type: 'Branch' }, north(MUMBAI, 500));
    await pinnedSite([rep.employee], { name: 'Alpha Vendor', type: 'Vendor' }, north(MUMBAI, 800));
    const res = await request(app)
      .get('/api/v1/field/sites')
      .query({ near: `${MUMBAI.lat},${MUMBAI.lng}`, radiusKm: 10, search: 'alpha', type: 'Branch' })
      .set(auth(rep.token));
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ name: string }>).map((s) => s.name)).toEqual(['Alpha Works']);
  });
});

describe('tasks at a site', () => {
  it('a direct manager assigns a task to a report (assignee notified), not to a stranger', async () => {
    const site = await pinnedSite([rep.employee]);
    const created = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(lead.token))
      .send({ title: 'Photograph the panel', assignedTo: String(rep.employee._id), siteId: String(site._id), dueDate: ymd(1) });
    expect(created.status).toBe(201);
    expect(await Notification.countDocuments({ userId: rep.userId })).toBe(1);
    const stranger = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(lead.token))
      .send({ title: 'Nope', assignedTo: String(other.employee._id) });
    expect(stranger.status).toBe(403);
  });

  it('completion with photo keys stores the photos and notifies the manager', async () => {
    const site = await pinnedSite([rep.employee]);
    const task = await FieldTask.create({ title: 'Replace the meter', assignedTo: rep.employee._id, siteId: site._id });
    const key = await photoKey(app, rep);
    const res = await request(app)
      .patch(`/api/v1/field/tasks/${task._id}/complete`)
      .set(auth(rep.token))
      .send({ clientRef: randomUUID(), capturedAt: new Date().toISOString(), completionNotes: 'Done', photoKeys: [key] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'completed', completionNotes: 'Done' });
    expect(res.body.data.completionPhotos[0]).toContain('sig=');
    expect((await FieldTask.findById(task._id).lean())?.completionPhotos).toEqual([`/uploads/${key}`]);
    const notice = await Notification.findOne({ userId: lead.userId }).lean();
    expect(notice?.message).toContain('Replace the meter');
    expect(notice?.link).toBe(`/field/tasks/${task._id}`);
  });
});
