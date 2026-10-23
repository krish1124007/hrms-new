/**
 * Field visits — the final-review fixes, one block per finding:
 *  1. a check-out captured after the auto-close ran leaves it as it is (the
 *     report it carries is still added); the race with the nightly run;
 *  2. visits of earlier days still open are closed on demand;
 *  3. offline captures degrade instead of being refused;
 *  4. a report edit and its duplicate racing apply once;
 *  5. checklist answers merge on a report edit;
 *  6. a past day's attendance made by an offline visit is closed at once;
 *  7. the attendance location / photo rules hold for visits;
 *  9. upload keys: the caller's own only; a selfie proves one check-in.
 * (8, 10, 11, 12 live with their areas: field.integrity, google-maps.service,
 * offline-capture, the migration tests.)
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { FieldSite } from '../models/field-site.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { FieldUpload } from '../models/field-upload.model.js';
import { Visit } from '../models/visit.model.js';
import { Notification } from '../models/notification.model.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee } from '../models/employee.model.js';
import { autoCloseOpenVisits, runFieldNightly } from '../services/field-visits.service.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import {
  auth,
  dayLabel,
  documentKey,
  fieldManager,
  istAt,
  MUMBAI,
  photoKey,
  pinnedSite,
  setFieldSettings,
  viewer,
  type FieldActor,
} from '../test/field-fixtures.js';

let app: Express;
let rep: FieldActor;
let lead: FieldActor;
let other: FieldActor;

beforeEach(async () => {
  app = createApp();
  lead = await viewer();
  rep = await viewer({ reportingManager: lead.employee._id });
  other = await viewer();
  await setFieldSettings({ selfieRequired: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const checkIn = (body: Record<string, unknown>, who: { token: string } = rep) =>
  request(app).post('/api/v1/field/visits/check-in').set(auth(who.token)).send(body);
const checkOut = (id: string, body: Record<string, unknown>, who: { token: string } = rep) =>
  request(app).post(`/api/v1/field/visits/${id}/check-out`).set(auth(who.token)).send(body);
const patchReport = (id: string, body: Record<string, unknown>, who: { token: string } = rep) =>
  request(app).patch(`/api/v1/field/visits/${id}/report`).set(auth(who.token)).send(body);

/** Ten minutes ago: an offline capture (more than 2 min before it arrives). */
const tenMinAgo = () => new Date(Date.now() - 10 * 60_000).toISOString();

/**
 * Run `before` once, between the controller's read and its first
 * `Visit.findOneAndUpdate` — a parallel request or the nightly run landing
 * in that gap.
 */
function landsInBetween(before: () => Promise<unknown>) {
  const original = Visit.findOneAndUpdate.bind(Visit) as (...a: unknown[]) => { exec(): Promise<unknown> };
  let fired = false;
  return vi.spyOn(Visit, 'findOneAndUpdate').mockImplementation(((...args: unknown[]) => {
    if (fired) return original(...args);
    fired = true;
    return {
      exec: async () => {
        await before();
        return original(...args).exec();
      },
    };
  }) as never);
}

describe('1. a check-out after the auto-close', () => {
  it('captured after the auto-close ran: the auto-close stands, the report it carries is added (200); a replay changes nothing', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '10:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    await runFieldNightly(new Date());
    const id = visit.body.data._id;

    const body = {
      clientRef: randomUUID(),
      capturedAt: new Date().toISOString(),
      location: MUMBAI,
      report: { outcome: 'completed', notes: 'Forgot to check out yesterday', photos: [await photoKey(app, rep)] },
    };
    const late = await checkOut(id, body);
    expect(late.status).toBe(200);
    expect(late.body.data.flags.autoClosed).toBe(true);
    expect(late.body.data.checkOut.at).toBe(istAt(-1, '23:30').toISOString());
    expect(late.body.data.checkOut.location).toBeUndefined();
    expect(late.body.data.durationMinutes).toBe(810);
    expect(late.body.data.report).toMatchObject({ outcome: 'completed', notes: 'Forgot to check out yesterday' });
    expect(late.body.data.report.photos).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);

    const replay = await checkOut(id, body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.report.photos).toHaveLength(1);
    expect(replay.body.data.checkOut.at).toBe(istAt(-1, '23:30').toISOString());
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });

  it('the nightly run lands between the read and the write: a check-out captured before it still replaces it', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '16:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    landsInBetween(() => runFieldNightly(new Date()));
    const real = await checkOut(visit.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-1, '17:15').toISOString() });
    expect(real.status).toBe(200);
    expect(real.body.data.flags.autoClosed).toBe(false);
    expect(real.body.data.checkOut.at).toBe(istAt(-1, '17:15').toISOString());
    expect(real.body.data.durationMinutes).toBe(75);
  });

  it('the nightly run lands between the read and the write of a later check-out: 200, the auto-close stands', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '16:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    // Read while still open — then closed by the run before the write.
    landsInBetween(() => runFieldNightly(new Date()));
    const res = await checkOut(visit.body.data._id, { clientRef: randomUUID(), report: { notes: 'Done' } });
    expect(res.status).toBe(200);
    expect(res.body.data.flags.autoClosed).toBe(true);
    expect(res.body.data.checkOut.at).toBe(istAt(-1, '23:30').toISOString());
    expect(res.body.data.report.notes).toBe('Done');
  });
});

describe('2. visits of earlier days still open', () => {
  it('a visit of an earlier day that synced after the nightly run does not block today’s check-in: it is auto-closed', async () => {
    const site = await pinnedSite([rep.employee]);
    const old = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '17:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    expect(old.status).toBe(201);

    const today = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    expect(today.status).toBe(201);
    const closed = await Visit.findById(old.body.data._id).lean();
    expect(closed).toMatchObject({ status: 'completed', durationMinutes: 390, flags: { autoClosed: true } });
    expect(closed?.checkOut?.time?.toISOString()).toBe(istAt(-1, '23:30').toISOString());
  });

  it('checked out on a later day: stored as that day’s auto-close, not a cross-day visit; the report is kept', async () => {
    const site = await pinnedSite([rep.employee]);
    const old = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '17:00').toISOString(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI });
    const out = await checkOut(old.body.data._id, { clientRef: randomUUID(), location: MUMBAI, report: { outcome: 'completed', notes: 'Next morning' } });
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ status: 'completed', durationMinutes: 390, flags: { autoClosed: true } });
    expect(out.body.data.checkOut.at).toBe(istAt(-1, '23:30').toISOString());
    expect(out.body.data.checkOut.location).toBeUndefined();
    expect(out.body.data.report.notes).toBe('Next morning');
  });

  it('the nightly function closes one employee’s visits only, when asked to', async () => {
    const site = await pinnedSite([rep.employee, other.employee]);
    const mine = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-2, '10:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    const theirs = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-2, '10:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' }, other);
    const closed = await autoCloseOpenVisits(dayLabel(0), await getFieldSettings(), new Date(), { employeeId: rep.employee._id });
    expect(closed).toBe(1);
    expect((await Visit.findById(mine.body.data._id).lean())?.status).toBe('completed');
    expect((await Visit.findById(theirs.body.data._id).lean())?.status).toBe('in_progress');
  });
});

describe('3. offline captures degrade instead of being refused', () => {
  it('an unknown purpose is kept as sent (online: 400 INVALID_PURPOSE)', async () => {
    const site = await pinnedSite([rep.employee]);
    const online = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Site inspection' });
    expect(online.status).toBe(400);
    expect(online.body.error.code).toBe('INVALID_PURPOSE');
    const offline = await checkIn({ clientRef: randomUUID(), capturedAt: tenMinAgo(), siteId: String(site._id), purpose: 'Site inspection' });
    expect(offline.status).toBe(201);
    expect(offline.body.data).toMatchObject({ purpose: 'Site inspection', flags: { capturedOffline: true } });
  });

  it('a pinned site of an unknown type becomes "Other" (or the last type) offline; online 400 INVALID_SITE_TYPE', async () => {
    const pin = (capturedAt: string | undefined, name: string) =>
      checkIn({ clientRef: randomUUID(), ...(capturedAt ? { capturedAt } : {}), purpose: 'Meeting', newSite: { name, type: 'Warehouse', location: MUMBAI } });
    const online = await pin(undefined, 'Online depot');
    expect(online.status).toBe(400);
    expect(online.body.error.code).toBe('INVALID_SITE_TYPE');
    const offline = await pin(tenMinAgo(), 'Offline depot');
    expect(offline.status).toBe(201);
    expect((await FieldSite.findOne({ name: 'Offline depot' }).lean())?.type).toBe('Other');

    await checkOut(offline.body.data._id, { clientRef: randomUUID() });
    await setFieldSettings({ siteTypes: ['Client office', 'Branch'] });
    const noOther = await pin(tenMinAgo(), 'Second depot');
    expect(noOther.status).toBe(201);
    expect((await FieldSite.findOne({ name: 'Second depot' }).lean())?.type).toBe('Branch');
  });

  it('a missing selfie while the selfie is required: accepted offline with noSelfie (online 400)', async () => {
    await setFieldSettings({ selfieRequired: true });
    const site = await pinnedSite([rep.employee]);
    expect((await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' })).body.error.code).toBe('SELFIE_REQUIRED');
    const offline = await checkIn({ clientRef: randomUUID(), capturedAt: tenMinAgo(), siteId: String(site._id), purpose: 'Meeting' });
    expect(offline.status).toBe(201);
    expect(offline.body.data.flags).toMatchObject({ noSelfie: true, capturedOffline: true });
  });

  it('a checklist that changed: an unknown one is dropped, a changed one keeps the answers that still fit; the rest of the report stands', async () => {
    await setFieldSettings({
      checklists: [
        {
          name: 'Inspection',
          purpose: 'Inspection',
          items: [
            { label: 'Fire exits clear', kind: 'yes_no', required: true },
            { label: 'Condition', kind: 'select', options: ['Good', 'Poor'], required: false },
            { label: 'Meter', kind: 'number', required: false },
          ],
        },
      ],
    });
    const checklist = (await getFieldSettings()).checklists[0]!;
    const [exits, condition, meter] = checklist.items.map((i) => i._id);
    const site = await pinnedSite([rep.employee]);

    const first = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-1, '10:00').toISOString(), siteId: String(site._id), purpose: 'Inspection' });
    const unknown = await checkOut(first.body.data._id, {
      clientRef: randomUUID(),
      capturedAt: istAt(-1, '11:00').toISOString(),
      report: { outcome: 'completed', notes: 'All fine', checklist: { checklistId: 'deleted-checklist', answers: [{ itemId: 'x', value: true }] } },
    });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.report).toMatchObject({ outcome: 'completed', notes: 'All fine' });
    expect(unknown.body.data.report.checklist).toBeUndefined();

    // Online, the same report is refused (nothing stored).
    const second = await checkIn({ clientRef: randomUUID(), capturedAt: new Date(Date.now() - 30 * 60_000).toISOString(), siteId: String(site._id), purpose: 'Inspection' });
    const strict = await checkOut(second.body.data._id, {
      clientRef: randomUUID(),
      report: { checklist: { checklistId: checklist._id, answers: [{ itemId: condition, value: 'Excellent' }, { itemId: meter, value: 4 }] } },
    });
    expect(strict.status).toBe(400);
    expect((await Visit.findById(second.body.data._id).lean())?.status).toBe('in_progress');

    // Offline: the required item missing and an option HR removed are tolerated; the answer that fits is kept.
    const lenient = await checkOut(second.body.data._id, {
      clientRef: randomUUID(),
      capturedAt: tenMinAgo(),
      report: { notes: 'Meter read', checklist: { checklistId: checklist._id, answers: [{ itemId: condition, value: 'Excellent' }, { itemId: meter, value: 4 }] } },
    });
    expect(lenient.status).toBe(200);
    expect(lenient.body.data.report.notes).toBe('Meter read');
    expect(lenient.body.data.report.checklist.answers).toEqual([{ itemId: meter, value: 4 }]);
    expect(exits).toBeDefined();
  });

  it('a planned visit cancelled after it was started offline: checked in on that same visit, the reason kept (online 409)', async () => {
    const site = await pinnedSite([rep.employee]);
    const plan = await request(app)
      .post('/api/v1/field/visits/plan')
      .set(auth(lead.token))
      .send({ siteId: String(site._id), employeeId: String(rep.employee._id), plannedDate: dayLabel(0).toISOString().slice(0, 10), purpose: 'Audit' });
    expect(plan.status).toBe(201);
    const id = plan.body.data._id;
    await request(app).post(`/api/v1/field/visits/${id}/cancel`).set(auth(lead.token)).send({ reason: 'Client postponed' });

    const online = await checkIn({ clientRef: randomUUID(), visitId: id });
    expect(online.status).toBe(409);
    expect(online.body.error.code).toBe('VISIT_NOT_PLANNED');
    const offline = await checkIn({ clientRef: randomUUID(), capturedAt: tenMinAgo(), visitId: id });
    expect(offline.status).toBe(201);
    expect(offline.body.data).toMatchObject({ _id: id, status: 'in_progress', purpose: 'Audit', cancelReason: 'Client postponed' });
    expect(await Visit.countDocuments({})).toBe(1);
  });

  it('a planned visit deleted meanwhile: an unplanned visit at its site (online 404)', async () => {
    const site = await pinnedSite([rep.employee]);
    const planned = await Visit.create({ employeeId: rep.employee._id, siteId: site._id, purpose: 'Survey', status: 'planned', plannedDate: dayLabel(0), day: dayLabel(0) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (planned as any).softDelete({});

    expect((await checkIn({ clientRef: randomUUID(), visitId: String(planned._id) })).status).toBe(404);
    const offline = await checkIn({ clientRef: randomUUID(), capturedAt: tenMinAgo(), visitId: String(planned._id) });
    expect(offline.status).toBe(201);
    expect(offline.body.data._id).not.toBe(String(planned._id));
    expect(offline.body.data).toMatchObject({ siteId: String(site._id), purpose: 'Survey', status: 'in_progress' });
  });

  it('a site deleted meanwhile still takes the visit (online 404)', async () => {
    const site = await pinnedSite([rep.employee]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (site as any).softDelete({});
    expect((await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' })).status).toBe(404);
    const offline = await checkIn({ clientRef: randomUUID(), capturedAt: tenMinAgo(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI });
    expect(offline.status).toBe(201);
    expect(offline.body.data.siteId).toBe(String(site._id));
    expect(offline.body.data.site.name).toBe('Acme Plant');
  });
});

describe('4. a report edit racing its own duplicate', () => {
  it('applies once: the copy that lost answers 200 as a replay', async () => {
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    const id = visit.body.data._id;
    await checkOut(id, { clientRef: randomUUID() });
    const body = { clientRef: randomUUID(), notes: 'Minutes attached', documents: [{ key: await documentKey(app, rep), name: 'minutes.pdf' }] };

    // The duplicate (same clientRef) is applied while this request is between its check and its write.
    landsInBetween(() => patchReport(id, body));
    const res = await patchReport(id, body);
    expect(res.status).toBe(200);
    const stored = await Visit.findById(id).lean();
    expect(stored?.report?.documents).toHaveLength(1);
    expect(stored?.reportClientRefs.filter((r) => r === body.clientRef)).toHaveLength(1);
    expect(await Notification.countDocuments({ userId: lead.userId })).toBe(1);
  });
});

describe('5. checklist answers on a report edit', () => {
  it('merge by item into the stored answers; the required items are checked on the merged set; an empty value clears one', async () => {
    await setFieldSettings({
      checklists: [
        {
          name: 'Inspection',
          purpose: 'Inspection',
          items: [
            { label: 'Fire exits clear', kind: 'yes_no', required: true },
            { label: 'Remarks', kind: 'text', required: false },
            { label: 'Meter', kind: 'number', required: false },
            { label: 'Panel photo', kind: 'photo', required: false },
          ],
        },
      ],
    });
    const checklist = (await getFieldSettings()).checklists[0]!;
    const [exits, remarks, meter, panel] = checklist.items.map((i) => i._id);
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Inspection' });
    const id = visit.body.data._id;
    const out = await checkOut(id, {
      clientRef: randomUUID(),
      report: {
        checklist: {
          checklistId: checklist._id,
          answers: [
            { itemId: exits, value: true },
            { itemId: remarks, value: 'Rusty door' },
            { itemId: panel, value: await photoKey(app, rep) },
          ],
        },
      },
    });
    expect(out.status).toBe(200);

    // A typo fix that sends the checklist with only the new answer.
    const edit = await patchReport(id, { clientRef: randomUUID(), notes: 'Typo fixed', checklist: { checklistId: checklist._id, answers: [{ itemId: meter, value: 7 }] } });
    expect(edit.status).toBe(200);
    const answers = new Map((edit.body.data.report.checklist.answers as Array<{ itemId: string; value: unknown }>).map((a) => [a.itemId, a.value]));
    expect(answers.get(exits)).toBe(true);
    expect(answers.get(remarks)).toBe('Rusty door');
    expect(answers.get(meter)).toBe(7);
    expect(String(answers.get(panel))).toContain('sig=');

    // Clearing a required answer is refused; clearing an optional one works.
    const noExits = await patchReport(id, { clientRef: randomUUID(), checklist: { checklistId: checklist._id, answers: [{ itemId: exits, value: null }] } });
    expect(noExits.status).toBe(400);
    expect(noExits.body.error.code).toBe('CHECKLIST_INCOMPLETE');
    const cleared = await patchReport(id, { clientRef: randomUUID(), checklist: { checklistId: checklist._id, answers: [{ itemId: remarks, value: '' }] } });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.report.checklist.answers.map((a: { itemId: string }) => a.itemId).sort()).toEqual([exits, meter, panel].sort());

    // A field manager's edit keeps the employee's photo answer (not the manager's upload, but already on the report).
    const M = await fieldManager();
    const byManager = await patchReport(id, { checklist: { checklistId: checklist._id, answers: [{ itemId: meter, value: 8 }] } }, M);
    expect(byManager.status).toBe(200);
    expect(byManager.body.data.report.checklist.answers).toHaveLength(3);
  });
});

describe('6. a past day’s attendance made by an offline visit', () => {
  const att = (n: number) => Attendance.findOne({ employeeId: rep.employee._id, date: dayLabel(n) }).lean();

  it('is closed at once by the auto-checkout rule provisionally; the first visit check-out replaces it, later ones only move it forward', async () => {
    await AttendanceConfig.updateOne({}, { $set: { 'settings.autoCheckoutTime': '18:00' } }, { upsert: true });
    const site = await pinnedSite([rep.employee]);
    const visit = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-2, '10:00').toISOString(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI });
    expect(visit.status).toBe(201);
    let row = await att(-2);
    expect(row?.checkIn?.time?.toISOString()).toBe(istAt(-2, '10:00').toISOString());
    expect(row?.checkOut?.time?.toISOString()).toBe(istAt(-2, '18:00').toISOString());
    expect(row?.checkOut?.metadata).toMatchObject({ autoCheckout: true, fieldVisitId: visit.body.data._id, fieldProvisional: true });
    expect(row?.totalWorkingHours).toBeCloseTo(8, 1);

    // The day's first visit check-out replaces the provisional 18:00, although earlier.
    const early = await checkOut(visit.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-2, '12:00').toISOString() });
    expect(early.status).toBe(200);
    row = await att(-2);
    expect(row?.checkOut?.time?.toISOString()).toBe(istAt(-2, '12:00').toISOString());
    expect(row?.checkOut?.metadata?.fieldProvisional).toBeFalsy();
    expect(row?.totalWorkingHours).toBeCloseTo(2, 1);

    const second = await checkIn({ clientRef: randomUUID(), capturedAt: istAt(-2, '18:30').toISOString(), siteId: String(site._id), purpose: 'Meeting' });
    const late = await checkOut(second.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-2, '19:30').toISOString() });
    expect(late.status).toBe(200);
    row = await att(-2);
    expect(row?.checkOut?.time?.toISOString()).toBe(istAt(-2, '19:30').toISOString());
    expect(row?.totalWorkingHours).toBeCloseTo(9.5, 1);
  });

  it('is closed at the day’s last visit check-out when there is one; today’s row stays open', async () => {
    const site = await pinnedSite([rep.employee]);
    await setFieldSettings({ visitCountsAsAttendance: false });
    const body = { clientRef: randomUUID(), capturedAt: istAt(-1, '09:00').toISOString(), siteId: String(site._id), purpose: 'Meeting' };
    const visit = await checkIn(body);
    await checkOut(visit.body.data._id, { clientRef: randomUUID(), capturedAt: istAt(-1, '12:15').toISOString() });
    expect(await att(-1)).toBeNull();

    // The setting is on again when the check-in is replayed: the day is linked and closed at 12:15.
    await setFieldSettings({ visitCountsAsAttendance: true });
    expect((await checkIn(body)).status).toBe(200);
    const row = await att(-1);
    expect(row?.checkIn?.time?.toISOString()).toBe(istAt(-1, '09:00').toISOString());
    expect(row?.checkOut?.time?.toISOString()).toBe(istAt(-1, '12:15').toISOString());

    const today = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    expect(today.status).toBe(201);
    const todayRow = await Attendance.findOne({ employeeId: rep.employee._id, date: startOfBusinessDay() }).lean();
    expect(todayRow?.checkIn?.time).toBeTruthy();
    expect(todayRow?.checkOut?.time ?? null).toBeNull();
  });
});

describe('7. attendance rules hold for visits', () => {
  const todayRow = () => Attendance.findOne({ employeeId: rep.employee._id, date: startOfBusinessDay() }).lean();

  it('location required (company or employee): a visit without a GPS fix makes no attendance check-in', async () => {
    await AttendanceConfig.updateOne({}, { $set: { 'settings.requireLocation': true } }, { upsert: true });
    const site = await pinnedSite([rep.employee]);
    const blind = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    expect(blind.status).toBe(201);
    expect(await todayRow()).toBeNull();
    await checkOut(blind.body.data._id, { clientRef: randomUUID() });
    const located = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI });
    expect(located.status).toBe(201);
    expect((await todayRow())?.checkIn?.location).toMatchObject({ lat: MUMBAI.lat, lng: MUMBAI.lng });

    await AttendanceConfig.updateOne({}, { $set: { 'settings.requireLocation': false } });
    await Employee.updateOne({ _id: other.employee._id }, { $set: { requireLocation: true } });
    const site2 = await pinnedSite([other.employee]);
    expect((await checkIn({ clientRef: randomUUID(), siteId: String(site2._id), purpose: 'Meeting' }, other)).status).toBe(201);
    expect(await Attendance.countDocuments({ employeeId: other.employee._id })).toBe(0);
  });

  it('photo required: a visit without a selfie makes no attendance check-in; with one, the selfie is the photo', async () => {
    await AttendanceConfig.updateOne({}, { $set: { 'settings.requirePhotoOnCheckIn': true } }, { upsert: true });
    const site = await pinnedSite([rep.employee]);
    const bare = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI });
    expect(bare.status).toBe(201);
    expect(await todayRow()).toBeNull();
    await checkOut(bare.body.data._id, { clientRef: randomUUID() });
    const withSelfie = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', location: MUMBAI, selfieKey: await photoKey(app, rep) });
    expect(withSelfie.status).toBe(201);
    expect((await todayRow())?.checkIn?.photo).toMatch(/^\/uploads\/field-photos\//);
  });
});

describe('9. upload keys', () => {
  it('only the caller’s own uploads: someone else’s photo is refused as selfie, report photo, document, task proof and site photo', async () => {
    const site = await pinnedSite([rep.employee]);
    const theirs = await photoKey(app, other);
    const theirDoc = await documentKey(app, other);
    const asSelfie = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: theirs });
    expect(asSelfie.status).toBe(400);
    expect(asSelfie.body.error.code).toBe('INVALID_FILE_KEY');

    const visit = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting' });
    const asPhoto = await checkOut(visit.body.data._id, { clientRef: randomUUID(), report: { photos: [theirs] } });
    expect(asPhoto.body.error?.code).toBe('INVALID_FILE_KEY');
    const asDoc = await checkOut(visit.body.data._id, { clientRef: randomUUID(), report: { documents: [{ key: theirDoc }] } });
    expect(asDoc.body.error?.code).toBe('INVALID_FILE_KEY');
    expect((await checkOut(visit.body.data._id, { clientRef: randomUUID(), report: { photos: [await photoKey(app, rep)] } })).status).toBe(200);

    const task = await FieldTask.create({ title: 'Collect the form', assignedTo: rep.employee._id });
    const proof = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(rep.token)).send({ clientRef: randomUUID(), photoKeys: [theirs] });
    expect(proof.body.error?.code).toBe('INVALID_FILE_KEY');

    const pin = await request(app)
      .post('/api/v1/field/sites')
      .set(auth(rep.token))
      .send({ clientRef: randomUUID(), name: 'Depot', type: 'Vendor', location: MUMBAI, photo: theirs });
    expect(pin.body.error?.code).toBe('INVALID_FILE_KEY');
  });

  it('a key uploaded before uploads had an owner cannot be attached anew; a record that holds it still reads it and keeps it on edit', async () => {
    const legacy = await photoKey(app, rep);
    await FieldUpload.deleteMany({ key: legacy });
    const site = await pinnedSite([rep.employee]);
    const res = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: legacy });
    expect(res.body.error?.code).toBe('INVALID_FILE_KEY');

    const M = await fieldManager();
    const held = await pinnedSite([rep.employee], { photo: `/uploads/${legacy}` });
    const read = await request(app).get(`/api/v1/field/sites/${held._id}`).set(auth(M.token));
    expect(read.body.data.photoUrl).toContain('sig=');
    const edit = await request(app).patch(`/api/v1/field/sites/${held._id}`).set(auth(M.token)).send({ name: 'Renamed', photo: legacy });
    expect(edit.status).toBe(200);
    expect((await FieldSite.findById(held._id).lean())?.photo).toBe(`/uploads/${legacy}`);
  });

  it('a selfie proves one check-in: reuse → 409 SELFIE_ALREADY_USED; a refused check-in leaves it unused; a replay answers 200', async () => {
    const site = await pinnedSite([rep.employee]);
    const selfie = await photoKey(app, rep);
    const first = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: selfie });
    expect(first.status).toBe(201);

    // Refused (a visit is open): the selfie stays unused…
    const fresh = await photoKey(app, rep);
    const blocked = { clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: fresh };
    expect((await checkIn(blocked)).body.error?.code).toBe('VISIT_ALREADY_OPEN');
    await checkOut(first.body.data._id, { clientRef: randomUUID() });
    // …so the same request goes through when retried, and its replay answers 200 with the same visit.
    const retried = await checkIn(blocked);
    expect(retried.status).toBe(201);
    const replay = await checkIn(blocked);
    expect(replay.status).toBe(200);
    expect(replay.body.data._id).toBe(retried.body.data._id);
    await checkOut(retried.body.data._id, { clientRef: randomUUID() });

    const reused = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: selfie });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('SELFIE_ALREADY_USED');
    expect(await Visit.countDocuments({})).toBe(2);
  });

  it('the visit write itself enforces single use (two check-ins racing with one selfie)', async () => {
    const site = await pinnedSite([rep.employee]);
    const selfie = await photoKey(app, rep);
    const first = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: selfie });
    await checkOut(first.body.data._id, { clientRef: randomUUID() });
    // The second passes the early check (as if both were in flight together)…
    vi.spyOn(Visit, 'exists').mockReturnValue({ setOptions: () => ({ exec: async () => null }) } as never);
    const second = await checkIn({ clientRef: randomUUID(), siteId: String(site._id), purpose: 'Meeting', selfieKey: selfie });
    // …and the unique index refuses it.
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SELFIE_ALREADY_USED');
    expect(await Visit.countDocuments({})).toBe(1);
  });
});
