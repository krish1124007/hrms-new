/**
 * Field visits data integrity: who may see and change which visit or task,
 * the visit lifecycle, IST day boundaries, field tasks, photo upload and
 * list hygiene. (The visit engine's contract tests are field.visits /
 * field.offline / field.schedules; sites in field.sites.test.ts.)
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { Notification } from '../models/notification.model.js';
import { updateFieldSettings } from '../services/field-settings.service.js';
import { DAY_MS, startOfBusinessDay } from '../lib/business-day.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  employee: IEmployee;
  userId: string;
}

async function fieldActor(
  permissions: string[],
  overrides: Partial<Record<keyof IEmployee, unknown>> = {},
): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: permissions } });
  const employee = await createEmployeeFor(user, overrides);
  return { token, employee, userId: String(user._id) };
}
const rep = (overrides: Partial<Record<keyof IEmployee, unknown>> = {}) => fieldActor(['field.view'], overrides);
const fieldManager = () => fieldActor(['field.view', 'field.manage']);

let app: Express;
let A: Actor;
let B: Actor;
let M: Actor;

beforeEach(async () => {
  app = createApp();
  A = await rep();
  B = await rep();
  M = await fieldManager();
  // The selfie rule has its own tests (field.visits); these check-ins go without one.
  await updateFieldSettings({ selfieRequired: false });
});

/** Mumbai. */
const MUMBAI = { lat: 19.076, lng: 72.8777 };
/** `YYYY-MM-DD` of the IST day `n` days from today. */
const ymdIn = (n: number) => new Date(startOfBusinessDay().getTime() + n * DAY_MS).toISOString().slice(0, 10);
const newSite = (extra: Record<string, unknown> = {}) => FieldSite.create({ name: 'Acme Plant', type: 'Project site', ...extra });

const checkIn = (actor: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/visits/check-in').set(auth(actor.token)).send({ purpose: 'Meeting', ...body });

const checkOut = (actor: Actor, visitId: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/v1/field/visits/${visitId}/check-out`).set(auth(actor.token)).send(body);

describe('ownership', () => {
  it("a rep cannot read or change another rep's visit", async () => {
    const site = await newSite();
    const visit = await checkIn(A, { siteId: String(site._id), location: MUMBAI });
    expect(visit.status).toBe(201);

    const path = `/api/v1/field/visits/${visit.body.data._id}`;
    expect((await request(app).get(path).set(auth(B.token))).status).toBe(403);
    expect((await request(app).patch(`${path}/report`).set(auth(B.token)).send({ notes: 'mine now' })).status).toBe(403);
    expect((await checkOut(B, visit.body.data._id)).status).toBe(403);
    expect((await request(app).post(`${path}/cancel`).set(auth(B.token)).send({ reason: 'no' })).status).toBe(403);
    expect((await Visit.findById(visit.body.data._id).lean())?.status).toBe('in_progress');
  });

  it('employeeId in the body is ignored for a rep', async () => {
    const site = await newSite();
    const visit = await checkIn(A, { siteId: String(site._id), employeeId: String(B.employee._id) });
    expect(visit.body.data.employee._id).toBe(String(A.employee._id));
  });

  it("a team lead sees their direct reports' records but cannot change them", async () => {
    const L = await rep();
    const R = await rep({ reportingManager: L.employee._id });
    const site = await newSite();
    const theirs = await checkIn(R, { siteId: String(site._id) });
    const stranger = await checkIn(B, { siteId: String(site._id) });

    expect((await request(app).get(`/api/v1/field/visits/${theirs.body.data._id}`).set(auth(L.token))).status).toBe(200);
    expect((await checkOut(L, theirs.body.data._id)).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/field/visits/${theirs.body.data._id}/report`).set(auth(L.token)).send({ notes: 'x' }))
        .status,
    ).toBe(403);
    expect((await request(app).get(`/api/v1/field/visits/${stranger.body.data._id}`).set(auth(L.token))).status).toBe(
      403,
    );
    const list = await request(app).get('/api/v1/field/visits').set(auth(L.token));
    expect((list.body.data as Array<{ _id: string }>).map((v) => v._id)).toEqual([theirs.body.data._id]);
  });

  it('404 NO_EMPLOYEE_PROFILE for a rep without an employee record', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field.view'] } });
    const res = await request(app).get('/api/v1/field/visits').set(auth(token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });
});

describe('visit lifecycle', () => {
  it('one open visit per rep; check-out only once; duration ≥ 0', async () => {
    const site = await newSite();
    const first = await checkIn(A, { siteId: String(site._id) });
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('in_progress');

    const second = await checkIn(A, { siteId: String(site._id) });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('VISIT_ALREADY_OPEN');

    const out = await checkOut(A, first.body.data._id, { notes: 'Met the owner' });
    expect(out.status).toBe(200);
    expect(out.body.data.status).toBe('completed');
    expect(out.body.data.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(out.body.data.checkOut.notes).toBe('Met the owner');

    const again = await checkOut(A, first.body.data._id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('VISIT_ALREADY_CHECKED_OUT');

    // Closed — the next visit may start.
    expect((await checkIn(A, { siteId: String(site._id) })).status).toBe(201);
    // Each check-in counts on the site.
    expect(await FieldSite.findById(site._id).lean()).toMatchObject({ visitCount: 2 });
  });

  it('check-out requires a check-in', async () => {
    const site = await newSite({ assignedTo: [A.employee._id] });
    const planned = await request(app)
      .post('/api/v1/field/visits/plan')
      .set(auth(A.token))
      .send({ siteId: String(site._id), plannedDate: ymdIn(1), purpose: 'Audit' });
    expect(planned.status).toBe(201);
    expect(planned.body.data.status).toBe('planned');
    const out = await checkOut(A, planned.body.data._id);
    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('VISIT_NOT_CHECKED_IN');
  });

  it('checking in to a planned visit starts that visit', async () => {
    const site = await newSite({ assignedTo: [A.employee._id] });
    const planned = await request(app)
      .post('/api/v1/field/visits/plan')
      .set(auth(A.token))
      .send({ siteId: String(site._id), plannedDate: ymdIn(1), purpose: 'Maintenance' });
    const started = await checkIn(A, { visitId: planned.body.data._id, purpose: undefined });
    expect(started.status).toBe(201);
    expect(started.body.data._id).toBe(planned.body.data._id);
    expect(started.body.data).toMatchObject({ status: 'in_progress', purpose: 'Maintenance' });
    expect(await Visit.countDocuments({})).toBe(1);
  });

  it('flags a check-in 1 km from the site without rejecting it', async () => {
    const located = await newSite({ location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });
    const far = await checkIn(A, { siteId: String(located._id), location: { lat: MUMBAI.lat + 0.009, lng: MUMBAI.lng } });
    expect(far.status).toBe(201);
    expect(far.body.data.flags.awayFromSite).toBe(true);
    expect(far.body.data.checkIn.distanceM).toBeGreaterThan(950);
    expect(far.body.data.checkIn.distanceM).toBeLessThan(1050);
    await checkOut(A, far.body.data._id);

    const near = await checkIn(A, { siteId: String(located._id), location: MUMBAI });
    expect(near.body.data.flags.awayFromSite).toBe(false);
    expect(near.body.data.checkIn.distanceM).toBe(0);
    await checkOut(A, near.body.data._id);

    const unlocated = await newSite({ name: 'Nowhere' });
    const unknown = await checkIn(A, { siteId: String(unlocated._id), location: MUMBAI });
    expect(unknown.body.data.flags.awayFromSite).toBe(false);
    expect(unknown.body.data.checkIn.distanceM ?? null).toBeNull();
  });

  it('check-in notes and check-out notes are kept apart', async () => {
    const site = await newSite();
    const res = await checkIn(A, { siteId: String(site._id), location: MUMBAI, notes: 'Walk-in' });
    expect(res.status).toBe(201);
    expect(res.body.data.checkIn.location).toMatchObject(MUMBAI);
    expect(res.body.data.notes).toBe('Walk-in');

    const out = await checkOut(A, res.body.data._id, { notes: 'Will call back', location: MUMBAI, report: { outcome: 'other' } });
    expect(out.status).toBe(200);
    expect(out.body.data.notes).toBe('Walk-in');
    expect(out.body.data.checkOut.notes).toBe('Will call back');
    expect(out.body.data.checkOut.location).toMatchObject(MUMBAI);
    const shown = await request(app).get(`/api/v1/field/visits/${res.body.data._id}`).set(auth(M.token));
    expect(shown.body.data).toMatchObject({ notes: 'Walk-in', checkOut: { notes: 'Will call back' }, report: { outcome: 'other' } });
  });

  it('404 for an unknown site', async () => {
    const res = await checkIn(A, { siteId: '64b000000000000000000000' });
    expect(res.status).toBe(404);
  });
});

describe('IST day boundaries', () => {
  const realTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    if (realTZ === undefined) delete process.env.TZ;
    else process.env.TZ = realTZ;
  });

  it('my day at 00:30 IST holds a visit made at 00:15 IST, not one at 23:50 IST the day before', async () => {
    process.env.TZ = 'UTC'; // production servers run on UTC
    const site = await newSite();
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date('2026-10-20T18:20:00Z')); // 23:50 IST, 20 Oct
    const yesterday = await checkIn(A, { siteId: String(site._id) });
    await checkOut(A, yesterday.body.data._id);

    vi.setSystemTime(new Date('2026-10-20T18:45:00Z')); // 00:15 IST, 21 Oct
    const early = await checkIn(A, { siteId: String(site._id) });
    expect(early.status).toBe(201);

    vi.setSystemTime(new Date('2026-10-20T19:00:00Z')); // 00:30 IST, 21 Oct
    const today = await request(app).get('/api/v1/field/my-day').set(auth(A.token));
    expect(today.body.data.date).toBe('2026-10-21');
    expect(today.body.data.inProgress._id).toBe(early.body.data._id);
    expect(today.body.data.completed).toHaveLength(0);
    const before = await request(app).get('/api/v1/field/my-day').query({ date: '2026-10-20' }).set(auth(A.token));
    expect(before.body.data.completed.map((v: { _id: string }) => v._id)).toEqual([yesterday.body.data._id]);
  });
});

describe('field tasks', () => {
  it('notifies the assignee on create and on reassignment', async () => {
    const created = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Inspect the panel', assignedTo: String(A.employee._id) });
    expect(created.status).toBe(201);
    const forA = await Notification.find({ userId: A.userId }).lean();
    expect(forA).toHaveLength(1);
    expect(forA[0]).toMatchObject({ type: 'task_assigned', link: `/field/tasks/${created.body.data._id}` });

    const moved = await request(app)
      .patch(`/api/v1/field/tasks/${created.body.data._id}`)
      .set(auth(M.token))
      .send({ assignedTo: String(B.employee._id) });
    expect(moved.status).toBe(200);
    expect(await Notification.countDocuments({ userId: B.userId })).toBe(1);
    // An edit that keeps the assignee does not notify again.
    await request(app).patch(`/api/v1/field/tasks/${created.body.data._id}`).set(auth(M.token)).send({ priority: 'high' });
    expect(await Notification.countDocuments({ userId: B.userId })).toBe(1);
  });

  it('400 when the assignee is not an employee', async () => {
    const res = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Ghost', assignedTo: '64b000000000000000000000' });
    expect(res.status).toBe(400);
  });

  it("completion accepts the mobile's `notes`; a closed task cannot be completed again", async () => {
    const task = await FieldTask.create({ title: 'Deliver', assignedTo: A.employee._id });
    const done = await request(app)
      .patch(`/api/v1/field/tasks/${task._id}/complete`)
      .set(auth(A.token))
      .send({ notes: 'Delivered to the site office' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', completionNotes: 'Delivered to the site office' });
    const again = await request(app).patch(`/api/v1/field/tasks/${task._id}/complete`).set(auth(A.token)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('TASK_CLOSED');
  });

  it('a task at a site: siteId is stored, shown populated, and null clears it', async () => {
    const site = await newSite({ location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });
    const task = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({
        title: 'Check the meter',
        assignedTo: String(A.employee._id),
        siteId: String(site._id),
        location: { lat: MUMBAI.lat, lng: MUMBAI.lng, address: 'MG Road' },
        dueDate: '2027-01-05',
      });
    expect(task.status).toBe(201);
    const shown = await request(app).get(`/api/v1/field/tasks/${task.body.data._id}`).set(auth(A.token));
    expect(shown.body.data.siteId).toMatchObject({ _id: String(site._id), name: 'Acme Plant' });

    const cleared = await request(app)
      .patch(`/api/v1/field/tasks/${task.body.data._id}`)
      .set(auth(M.token))
      .send({ siteId: null, location: null, dueDate: null });
    expect(cleared.status).toBe(200);
    const stored = await FieldTask.findById(task.body.data._id).lean();
    expect(stored?.siteId ?? null).toBeNull();
    expect(stored?.location ?? null).toBeNull();
    expect(stored?.dueDate ?? null).toBeNull();
    expect(String(stored?.assignedTo)).toBe(String(A.employee._id));
    expect(
      (await request(app).patch(`/api/v1/field/tasks/${task.body.data._id}`).set(auth(M.token)).send({ assignedTo: null }))
        .status,
    ).toBe(400);
  });
});

describe('field photo upload', () => {
  // 1×1 transparent PNG.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );

  it('stores an image privately and returns a signed url plus its key', async () => {
    const res = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', PNG, { filename: 'selfie.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^field-photos\/\d{4}\/\d{2}\/.+\.png$/);
    expect(res.body.data.url).toContain('/api/v1/files/field-photos/');
    expect(res.body.data.url).toContain('sig=');

    const path = new URL(res.body.data.url).pathname + new URL(res.body.data.url).search;
    const file = await request(app).get(path);
    expect(file.status).toBe(200);

    // Attached to a check-in, the stored form is kept and handed back signed.
    const site = await newSite();
    const visit = await checkIn(A, { siteId: String(site._id), selfieKey: res.body.data.url });
    expect(visit.status).toBe(201);
    expect(visit.body.data.checkIn.selfieUrl).toContain('sig=');
    expect((await Visit.findById(visit.body.data._id).lean())?.checkIn?.photo).toMatch(/^\/uploads\/field-photos\//);
  });

  it('refuses anything that is not an image', async () => {
    const pdf = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', Buffer.from('%PDF-1.4 fake'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    const disguised = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(A.token))
      .attach('photo', Buffer.from('%PDF-1.4 fake'), { filename: 'x.png', contentType: 'image/png' });
    expect(disguised.status).toBe(400);
    const missing = await request(app).post('/api/v1/field/uploads/photo').set(auth(A.token));
    expect(missing.status).toBe(400);
  });
});

describe('list endpoints', () => {
  it('cap limit at 100, reject unknown filter values and sort keys', async () => {
    const visits = await request(app).get('/api/v1/field/visits').query({ limit: 500 }).set(auth(A.token));
    expect(visits.status).toBe(200);
    expect(visits.body.pagination.limit).toBe(100);
    expect((await request(app).get('/api/v1/field/visits').query({ status: 'bogus' }).set(auth(A.token))).status).toBe(400);
    expect((await request(app).get('/api/v1/field/visits').query({ sort: 'password' }).set(auth(A.token))).status).toBe(400);
  });

  it('my tasks are paginated', async () => {
    const res = await request(app).get('/api/v1/field/tasks/my').set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({ page: 1 });
  });
});

describe('check-in without a location fix', () => {
  it('is flagged noGps, never refused', async () => {
    const pinned = await newSite({ location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });
    const blind = await checkIn(A, { siteId: String(pinned._id) });
    expect(blind.status).toBe(201);
    expect(blind.body.data.flags).toMatchObject({ noGps: true, awayFromSite: false });
    await checkOut(A, blind.body.data._id);

    const located = await checkIn(A, { siteId: String(pinned._id), location: MUMBAI });
    expect(located.body.data.flags.noGps).toBe(false);
    await checkOut(A, located.body.data._id);

    // A 0,0 "fix" is a phone without GPS.
    const zero = await checkIn(A, { siteId: String(pinned._id), location: { lat: 0, lng: 0 } });
    expect(zero.status).toBe(201);
    expect(zero.body.data.flags.noGps).toBe(true);
  });
});
