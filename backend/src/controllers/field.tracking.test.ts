/**
 * Field live tracking: the one consented ingest (both URLs), the live socket
 * broadcast, the live / trail / map read endpoints and their visibility, and
 * the socket handshake.
 *
 * Visibility everywhere: `field-sales.manage` sees every rep; a plain
 * `field-sales.view` holder sees themselves and their direct reports.
 */
import request from 'supertest';
import type { Express } from 'express';
import type { Server as SocketServer } from 'socket.io';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User, type IUser } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { LocationTrack } from '../models/location-track.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { atBusinessTime, startOfBusinessDay } from '../lib/business-day.js';
import * as ioRegistry from '../sockets/io-registry.js';
import { socketAuth } from '../sockets/auth.middleware.js';
import { fieldTrackingAccess } from '../sockets/field-tracking.socket.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;
const HOUR = 60 * MIN;

/** The instant the IST wall clock reads `hhmm` on calendar day `day` (YYYY-MM-DD). */
const ist = (day: string, hhmm: string): Date => atBusinessTime(new Date(`${day}T00:00:00Z`), hhmm);

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

/** An `employee`-role user with field access and an Employee record. */
async function fieldActor(
  opts: { manage?: boolean; firstName?: string; reportingManager?: unknown } = {},
): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  const perms = opts.manage ? ['field-sales.view', 'field-sales.manage'] : ['field-sales.view'];
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: perms } });
  const employee = await createEmployeeFor(user, {
    firstName: opts.firstName ?? 'Rep',
    lastName: 'Kumar',
    ...(opts.reportingManager ? { reportingManager: opts.reportingManager } : {}),
  });
  return { user, token, employee };
}

async function enableTracking(enabled = true): Promise<void> {
  await AttendanceConfig.updateOne(
    {},
    { $set: { 'liveTracking.enabled': enabled } },
    { upsert: true },
  );
}

async function clockIn(employee: IEmployee, opts: { checkedOut?: boolean } = {}): Promise<void> {
  const now = Date.now();
  await Attendance.create({
    employeeId: employee._id,
    date: startOfBusinessDay(new Date()),
    status: 'present',
    checkIn: { time: new Date(now - HOUR), method: 'manual' },
    ...(opts.checkedOut ? { checkOut: { time: new Date(now - MIN), method: 'manual' } } : {}),
  });
}

async function track(employee: IEmployee, at: Date, lng = 72.85, lat = 19.07): Promise<void> {
  await LocationTrack.create({
    employeeId: employee._id,
    timestamp: at,
    location: { type: 'Point', coordinates: [lng, lat] },
    accuracy: 12,
  });
}

const point = (minutesAgo: number, lat = 19.07, lng = 72.85) => ({
  lat,
  lng,
  accuracy: 8,
  speed: 1.5,
  heading: 90,
  recordedAt: new Date(Date.now() - minutesAgo * MIN).toISOString(),
});

/** A stand-in Socket.io server that records the rooms and events emitted to. */
function fakeIo() {
  const rooms: string[] = [];
  const namespaces: string[] = [];
  const emit = vi.fn();
  const chain = {
    to(room: string | string[]) {
      rooms.push(...[room].flat());
      return chain;
    },
    emit,
  };
  const io = {
    of(name: string) {
      namespaces.push(name);
      return chain;
    },
  } as unknown as SocketServer;
  return { io, rooms, namespaces, emit };
}

let app: Express;
beforeEach(() => {
  app = createApp();
});

// ─── Ingest ────────────────────────────────────────────────────────────────

describe('POST /field/tracking/batch — one consented ingest', () => {
  it('403 TRACKING_DISABLED when live tracking has not been consented to; nothing stored', async () => {
    const rep = await fieldActor();
    await clockIn(rep.employee);
    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1)] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TRACKING_DISABLED');

    await enableTracking(false);
    const off = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1)] });
    expect(off.status).toBe(403);
    expect(await LocationTrack.countDocuments({})).toBe(0);
  });

  it('403 NOT_CLOCKED_IN when not clocked in, or already clocked out; nothing stored', async () => {
    await enableTracking();
    const rep = await fieldActor();
    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1)] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_CLOCKED_IN');

    await clockIn(rep.employee, { checkedOut: true });
    const after = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1)] });
    expect(after.status).toBe(403);
    expect(await LocationTrack.countDocuments({})).toBe(0);
  });

  it('201 and stores each point with the server receivedAt and the device recordedAt', async () => {
    await enableTracking();
    const rep = await fieldActor();
    await clockIn(rep.employee);
    const before = Date.now();
    const sent = [point(10), point(5)];
    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: sent });
    const after = Date.now();
    expect(res.status).toBe(201);
    expect(res.body.data.ingested).toBe(2);

    const docs = await LocationTrack.find({ employeeId: rep.employee._id }).sort({ timestamp: 1 }).lean();
    expect(docs).toHaveLength(2);
    for (const [i, doc] of docs.entries()) {
      expect(doc.timestamp.toISOString()).toBe(sent[i].recordedAt);
      expect(doc.receivedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(doc.receivedAt.getTime()).toBeLessThanOrEqual(after);
      expect(doc.accuracy).toBe(8);
    }
  });

  it('400 for more than 200 points; nothing stored', async () => {
    await enableTracking();
    const rep = await fieldActor();
    await clockIn(rep.employee);
    const many = Array.from({ length: 201 }, () => point(1));
    const big = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: many });
    expect(big.status).toBe(400);
    expect(await LocationTrack.countDocuments({})).toBe(0);
  });

  it('drops a point recorded more than 24 h ago and stores the rest: { ingested, dropped }', async () => {
    await enableTracking();
    const rep = await fieldActor();
    await clockIn(rep.employee);
    const stale = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1), point(25 * 60)] });
    expect(stale.status).toBe(201);
    expect(stale.body.data).toEqual({ ingested: 1, dropped: 1 });
    expect(await LocationTrack.countDocuments({})).toBe(1);

    const allStale = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(26 * 60)] });
    expect(allStale.status).toBe(201);
    expect(allStale.body.data).toEqual({ ingested: 0, dropped: 1 });
    expect(await LocationTrack.countDocuments({})).toBe(1);
  });

  it('403 NOT_FIELD_STAFF for a wildcard admin who is not field staff; an isFieldStaff employee is tracked', async () => {
    await enableTracking();
    const { user, token } = await createUser({ roleSlug: 'admin' });
    const admin = await createEmployeeFor(user);
    await clockIn(admin);
    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(token))
      .send({ points: [point(1)] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_FIELD_STAFF');

    await admin.updateOne({ $set: { isFieldStaff: true } });
    const flagged = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(token))
      .send({ points: [point(1)] });
    expect(flagged.status).toBe(201);
    expect(await LocationTrack.countDocuments({ employeeId: admin._id })).toBe(1);
  });

  it('the legacy URL answers a failed gate with 200 { ignored: true } and stores nothing for non-field staff', async () => {
    await enableTracking();
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const office = await createEmployeeFor(user);
    await clockIn(office);
    const res = await request(app)
      .post('/api/v1/attendance/tracking/batch')
      .set(auth(token))
      .send({ points: [point(1)] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, ignored: true, data: { ignored: true, reason: 'NOT_FIELD_STAFF' } });
    expect(await LocationTrack.countDocuments({})).toBe(0);
  });

  it('the legacy /attendance/tracking/batch URL goes through the same gate and store', async () => {
    const rep = await fieldActor();
    await clockIn(rep.employee);
    const off = await request(app)
      .post('/api/v1/attendance/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(1)] });
    // Shipped apps poll this URL: a closed gate is not an error there.
    expect(off.status).toBe(200);
    expect(off.body.ignored).toBe(true);
    expect(off.body.data.reason).toBe('TRACKING_DISABLED');
    expect(await LocationTrack.countDocuments({})).toBe(0);

    await enableTracking();
    // The shipped mobile app sends `timestamp` (not `recordedAt`) and nulls.
    const recordedAt = new Date(Date.now() - 2 * MIN).toISOString();
    const ok = await request(app)
      .post('/api/v1/attendance/tracking/batch')
      .set(auth(rep.token))
      .send({
        points: [
          { lat: 19.1, lng: 72.9, accuracy: 20, speed: null, heading: null, altitude: null, timestamp: recordedAt },
        ],
      });
    expect(ok.status).toBe(201);
    const doc = await LocationTrack.findOne({ employeeId: rep.employee._id }).lean();
    expect(doc?.timestamp.toISOString()).toBe(recordedAt);
    expect(doc?.receivedAt).toBeInstanceOf(Date);
  });

  it('404 NO_EMPLOYEE_PROFILE for a user without an employee record', async () => {
    await enableTracking();
    const { token } = await createUser({ roleSlug: 'admin' });
    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(token))
      .send({ points: [point(1)] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
  });

  it("emits location:update to managers:all and the rep's manager's reports room", async () => {
    await enableTracking();
    const manager = await fieldActor({ firstName: 'Meera' });
    const rep = await fieldActor({ firstName: 'Ravi', reportingManager: manager.employee._id });
    await clockIn(rep.employee);
    const fake = fakeIo();
    const spy = vi.spyOn(ioRegistry, 'getIO').mockReturnValue(fake.io);
    try {
      const latest = point(1, 19.2, 72.95);
      const res = await request(app)
        .post('/api/v1/field/tracking/batch')
        .set(auth(rep.token))
        // Out of order on purpose: the broadcast carries the newest fix.
        .send({ points: [latest, point(6)] });
      expect(res.status).toBe(201);
    } finally {
      spy.mockRestore();
    }

    expect(fake.namespaces).toEqual(['/field-tracking']);
    expect(fake.rooms).toEqual(
      expect.arrayContaining(['managers:all', `reports:${String(manager.employee._id)}`]),
    );
    expect(fake.rooms).toHaveLength(2);
    expect(fake.emit).toHaveBeenCalledTimes(1);
    const [event, payload] = fake.emit.mock.calls[0];
    expect(event).toBe('location:update');
    expect(payload).toMatchObject({
      employeeId: String(rep.employee._id),
      name: 'Ravi Kumar',
      lat: 19.2,
      lng: 72.95,
      accuracy: 8,
    });
    expect(new Date(payload.recordedAt).getTime()).toBeGreaterThan(Date.now() - 2 * MIN);
  });
});

// ─── Live ──────────────────────────────────────────────────────────────────

describe('GET /field/tracking/live', () => {
  it('a plain-view manager sees their report, not a stranger; field-sales.manage sees both', async () => {
    const manager = await fieldActor({ firstName: 'Meera' });
    const report = await fieldActor({ firstName: 'Ravi', reportingManager: manager.employee._id });
    const stranger = await fieldActor({ firstName: 'Sam' });
    const head = await fieldActor({ manage: true, firstName: 'Hema' });
    const now = Date.now();
    await track(report.employee, new Date(now - 50 * MIN), 72.8, 19.0);
    await track(report.employee, new Date(now - 5 * MIN), 72.81, 19.01);
    await track(stranger.employee, new Date(now - 10 * MIN));

    const client = await Client.create({ name: 'Acme Traders' });
    await Visit.create({
      employeeId: report.employee._id,
      clientId: client._id,
      status: 'in_progress',
      checkIn: { time: new Date(now - 20 * MIN), location: { lat: 19.01, lng: 72.81 } },
    });

    const mine = await request(app).get('/api/v1/field/tracking/live').set(auth(manager.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    const row = mine.body.data[0];
    expect(row).toMatchObject({
      employeeId: String(report.employee._id),
      name: 'Ravi Kumar',
      lat: 19.01,
      lng: 72.81,
      accuracy: 12,
      onVisit: { clientName: 'Acme Traders' },
    });
    expect(new Date(row.recordedAt).getTime()).toBe(now - 5 * MIN);
    expect(row).toHaveProperty('avatar');

    const all = await request(app).get('/api/v1/field/tracking/live').set(auth(head.token));
    expect(all.status).toBe(200);
    const ids = all.body.data.map((r: { employeeId: string }) => r.employeeId).sort();
    expect(ids).toEqual([String(report.employee._id), String(stranger.employee._id)].sort());
    const sam = all.body.data.find((r: { employeeId: string }) => r.employeeId === String(stranger.employee._id));
    expect(sam.onVisit).toBeNull();
  });

  it('shows only field staff: a fix stored for an office employee stays hidden from live and trail', async () => {
    const head = await fieldActor({ manage: true });
    const { user } = await createUser({ roleSlug: 'employee' });
    const office = await createEmployeeFor(user, { firstName: 'Olga' });
    const flagged = await createEmployeeFor((await createUser({ roleSlug: 'employee' })).user, {
      firstName: 'Farah',
      isFieldStaff: true,
    });
    await track(office, new Date(Date.now() - 5 * MIN));
    await track(flagged, new Date(Date.now() - 5 * MIN));

    const live = await request(app).get('/api/v1/field/tracking/live').set(auth(head.token));
    expect(live.status).toBe(200);
    expect(live.body.data.map((r: { employeeId: string }) => r.employeeId)).toEqual([String(flagged._id)]);

    const trail = await request(app).get(`/api/v1/field/tracking/${office._id}/trail`).set(auth(head.token));
    expect(trail.status).toBe(200);
    expect(trail.body.data.points).toEqual([]);
    const shown = await request(app).get(`/api/v1/field/tracking/${flagged._id}/trail`).set(auth(head.token));
    expect(shown.body.data.points).toHaveLength(1);
  });

  it('leaves out reps whose latest fix is older than 2 hours', async () => {
    const head = await fieldActor({ manage: true });
    const rep = await fieldActor();
    await track(rep.employee, new Date(Date.now() - 3 * HOUR));
    const res = await request(app).get('/api/v1/field/tracking/live').set(auth(head.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// ─── Trail ─────────────────────────────────────────────────────────────────

describe('GET /field/tracking/:employeeId/trail', () => {
  it('returns only the requested IST day, ordered, with that day’s visits', async () => {
    const manager = await fieldActor();
    const rep = await fieldActor({ reportingManager: manager.employee._id });
    await track(rep.employee, ist('2026-10-14', '23:50'), 72.1); // previous IST day
    await track(rep.employee, ist('2026-10-15', '18:00'), 72.4);
    await track(rep.employee, ist('2026-10-15', '00:10'), 72.2);
    await track(rep.employee, ist('2026-10-15', '23:50'), 72.5);
    await track(rep.employee, ist('2026-10-16', '00:05'), 72.6); // next IST day

    const client = await Client.create({
      name: 'Acme Traders',
      location: { type: 'Point', coordinates: [72.3, 19.3] },
    });
    await Visit.create({
      employeeId: rep.employee._id,
      clientId: client._id,
      status: 'completed',
      checkIn: { time: ist('2026-10-15', '11:00'), location: { lat: 19.31, lng: 72.31 } },
      checkOut: { time: ist('2026-10-15', '11:40') },
    });
    await Visit.create({
      employeeId: rep.employee._id,
      clientId: client._id,
      status: 'completed',
      checkIn: { time: ist('2026-10-14', '23:30') },
    });

    const res = await request(app)
      .get(`/api/v1/field/tracking/${rep.employee._id}/trail`)
      .query({ date: '2026-10-15' })
      .set(auth(manager.token));
    expect(res.status).toBe(200);
    const lngs = res.body.data.points.map((p: { lng: number }) => p.lng);
    expect(lngs).toEqual([72.2, 72.4, 72.5]);
    expect(res.body.data.points[0]).toMatchObject({ lat: 19.07, accuracy: 12 });
    expect(res.body.data.points[0].recordedAt).toBe(ist('2026-10-15', '00:10').toISOString());

    expect(res.body.data.visits).toHaveLength(1);
    expect(res.body.data.visits[0]).toMatchObject({
      clientName: 'Acme Traders',
      lat: 19.31,
      lng: 72.31,
      checkInAt: ist('2026-10-15', '11:00').toISOString(),
      checkOutAt: ist('2026-10-15', '11:40').toISOString(),
    });
  });

  it("403 for a stranger's trail; the legacy /tracking/history URL keeps working", async () => {
    const manager = await fieldActor();
    const report = await fieldActor({ reportingManager: manager.employee._id });
    const stranger = await fieldActor();
    await track(stranger.employee, new Date());

    const theirs = await request(app)
      .get(`/api/v1/field/tracking/${stranger.employee._id}/trail`)
      .set(auth(manager.token));
    expect(theirs.status).toBe(403);

    const reports = await request(app)
      .get(`/api/v1/field/tracking/${report.employee._id}/trail`)
      .set(auth(manager.token));
    expect(reports.status).toBe(200);

    const legacy = await request(app)
      .get(`/api/v1/field/tracking/history/${report.employee._id}`)
      .set(auth(manager.token));
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.points).toEqual([]);

    const bad = await request(app)
      .get(`/api/v1/field/tracking/${report.employee._id}/trail`)
      .query({ date: '15-10-2026' })
      .set(auth(manager.token));
    expect(bad.status).toBe(400);
  });
});

// ─── Map pins ──────────────────────────────────────────────────────────────

describe('GET /field/visits/map', () => {
  it('visits checked in on the IST day, scoped to the caller’s reps', async () => {
    const manager = await fieldActor();
    const report = await fieldActor({ firstName: 'Ravi', reportingManager: manager.employee._id });
    const stranger = await fieldActor({ firstName: 'Sam' });
    const head = await fieldActor({ manage: true });
    const client = await Client.create({
      name: 'Acme Traders',
      location: { type: 'Point', coordinates: [72.3, 19.3] },
    });
    const visit = (employee: IEmployee, at: Date) =>
      Visit.create({
        employeeId: employee._id,
        clientId: client._id,
        status: 'completed',
        checkIn: { time: at, location: { lat: 19.31, lng: 72.31 } },
      });
    await visit(report.employee, ist('2026-10-15', '00:30'));
    await visit(report.employee, ist('2026-10-14', '23:50'));
    await visit(stranger.employee, ist('2026-10-15', '12:00'));

    const mine = await request(app)
      .get('/api/v1/field/visits/map')
      .query({ date: '2026-10-15' })
      .set(auth(manager.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({
      employeeId: String(report.employee._id),
      employeeName: 'Ravi Kumar',
      clientName: 'Acme Traders',
      lat: 19.31,
      lng: 72.31,
      checkInAt: ist('2026-10-15', '00:30').toISOString(),
    });

    const forbidden = await request(app)
      .get('/api/v1/field/visits/map')
      .query({ date: '2026-10-15', employeeId: String(stranger.employee._id) })
      .set(auth(manager.token));
    expect(forbidden.status).toBe(403);

    const all = await request(app)
      .get('/api/v1/field/visits/map')
      .query({ date: '2026-10-15' })
      .set(auth(head.token));
    expect(all.body.data).toHaveLength(2);
    const one = await request(app)
      .get('/api/v1/field/visits/map')
      .query({ date: '2026-10-15', employeeId: String(stranger.employee._id) })
      .set(auth(head.token));
    expect(one.body.data).toHaveLength(1);
    expect(one.body.data[0].employeeName).toBe('Sam Kumar');
  });
});

describe('GET /field/clients/map', () => {
  it('returns only clients inside the bbox', async () => {
    const rep = await fieldActor();
    await Client.create({ name: 'Inside', location: { type: 'Point', coordinates: [72.85, 19.07] } });
    await Client.create({ name: 'East', location: { type: 'Point', coordinates: [80.2, 13.08] } });
    await Client.create({ name: 'No location' });

    const res = await request(app)
      .get('/api/v1/field/clients/map')
      .query({ bbox: '72.5,18.8,73.2,19.4' })
      .set(auth(rep.token));
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(['Inside']);
    expect(res.body.data[0]).toMatchObject({ lat: 19.07, lng: 72.85 });
    expect(res.body.truncated).toBe(false);

    const bad = await request(app)
      .get('/api/v1/field/clients/map')
      .query({ bbox: '72.5,18.8,abc' })
      .set(auth(rep.token));
    expect(bad.status).toBe(400);
  });

  it('is bounded to 500 pins', async () => {
    const rep = await fieldActor();
    await Client.insertMany(
      Array.from({ length: 505 }, (_, i) => ({
        name: `Client ${i}`,
        location: { type: 'Point', coordinates: [72.85, 19.07] },
      })),
    );
    const res = await request(app)
      .get('/api/v1/field/clients/map')
      .query({ bbox: '72.5,18.8,73.2,19.4' })
      .set(auth(rep.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(500);
    expect(res.body.truncated).toBe(true);
  });
});

// ─── Socket handshake ──────────────────────────────────────────────────────

interface FakeSocket {
  id: string;
  handshake: { auth: Record<string, unknown> };
  data: Record<string, unknown>;
  joined: string[];
  join(room: string | string[]): void;
}

function fakeSocket(token?: string): FakeSocket {
  const joined: string[] = [];
  return {
    id: 'socket-1',
    handshake: { auth: token ? { token } : {} },
    data: {},
    joined,
    join(room) {
      joined.push(...[room].flat());
    },
  };
}

type Middleware = (socket: never, next: (err?: Error) => void) => unknown;
function run(mw: Middleware, socket: FakeSocket): Promise<Error | undefined> {
  return new Promise((resolve) => {
    void mw(socket as never, (err?: Error) => resolve(err));
  });
}

describe('socket handshake', () => {
  it('rejects an inactive user; accepts an active one', async () => {
    const rep = await fieldActor();
    const ok = fakeSocket(rep.token);
    expect(await run(socketAuth as Middleware, ok)).toBeUndefined();
    expect(ok.data.userId).toBe(String(rep.user._id));

    await User.updateOne({ _id: rep.user._id }, { $set: { status: 'inactive' } });
    const err = await run(socketAuth as Middleware, fakeSocket(rep.token));
    expect(err?.message).toBe('USER_INACTIVE');
  });

  it('joins managers:all for field-sales.manage, reports:<own employee> for view, refuses others', async () => {
    const head = await fieldActor({ manage: true });
    const headSocket = fakeSocket(head.token);
    expect(await run(socketAuth as Middleware, headSocket)).toBeUndefined();
    expect(await run(fieldTrackingAccess as Middleware, headSocket)).toBeUndefined();
    expect(headSocket.joined).toContain('managers:all');

    const manager = await fieldActor();
    const managerSocket = fakeSocket(manager.token);
    await run(socketAuth as Middleware, managerSocket);
    expect(await run(fieldTrackingAccess as Middleware, managerSocket)).toBeUndefined();
    expect(managerSocket.joined).toContain(`reports:${String(manager.employee._id)}`);
    expect(managerSocket.joined).not.toContain('managers:all');

    const { token } = await createUser({ roleSlug: 'employee' });
    const plain = fakeSocket(token);
    await run(socketAuth as Middleware, plain);
    expect((await run(fieldTrackingAccess as Middleware, plain))?.message).toBe('FORBIDDEN');
  });
});
