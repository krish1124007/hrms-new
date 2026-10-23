/**
 * Continuous tracking is removed (locations only at check-in/check-out): both
 * upload URLs answer 200 `{ ignored: true }` for any body and store nothing,
 * even for clocked-in field staff with live tracking switched on; the live,
 * trail and visit-map reads are gone (the team map uses /field/team/status
 * and /field/route/:employeeId). The `/field-tracking` socket handshake still
 * admits field users only.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User, type IUser } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { LocationTrack } from '../models/location-track.model.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { socketAuth } from '../sockets/auth.middleware.js';
import { fieldTrackingAccess } from '../sockets/field-tracking.socket.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const MIN = 60_000;

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

/** An `employee`-role user with field access and an Employee record flagged as field staff. */
async function fieldActor(opts: { manage?: boolean } = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  const perms = opts.manage ? ['field.view', 'field.manage'] : ['field.view'];
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: perms } });
  const employee = await createEmployeeFor(user, { firstName: 'Rep', lastName: 'Kumar', isFieldStaff: true });
  return { user, token, employee };
}

const point = (minutesAgo: number) => ({
  lat: 19.07,
  lng: 72.85,
  accuracy: 8,
  recordedAt: new Date(Date.now() - minutesAgo * MIN).toISOString(),
});

let app: Express;
beforeEach(() => {
  app = createApp();
});

describe('location uploads are ignored', () => {
  it('POST /field/tracking/batch: 200 { ignored: true } and nothing stored — even clocked in with tracking on', async () => {
    const rep = await fieldActor();
    await AttendanceConfig.updateOne({}, { $set: { 'liveTracking.enabled': true } }, { upsert: true });
    await Attendance.create({
      employeeId: rep.employee._id,
      date: startOfBusinessDay(new Date()),
      status: 'present',
      checkIn: { time: new Date(Date.now() - 60 * MIN), method: 'manual' },
    });

    const res = await request(app)
      .post('/api/v1/field/tracking/batch')
      .set(auth(rep.token))
      .send({ points: [point(2), point(1)] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, ignored: true, data: { ignored: true } });
    expect(await LocationTrack.countDocuments()).toBe(0);
  });

  it('the legacy POST /attendance/tracking/batch answers the same for anyone, whatever the body', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    for (const body of [{ points: [point(1)] }, { points: 'nonsense' }, {}]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/v1/attendance/tracking/batch').set(auth(token)).send(body);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ ignored: true });
    }
    expect(await LocationTrack.countDocuments()).toBe(0);
  });

  it('still needs a signed-in user', async () => {
    expect((await request(app).post('/api/v1/field/tracking/batch').send({ points: [] })).status).toBe(401);
  });
});

describe('live tracking reads are gone', () => {
  it('live, trail and history answer 404', async () => {
    const head = await fieldActor({ manage: true });
    const id = String(head.employee._id);
    for (const path of ['/api/v1/field/tracking/live', `/api/v1/field/tracking/${id}/trail`, `/api/v1/field/tracking/history/${id}`]) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get(path).set(auth(head.token))).status).toBe(404);
    }
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

  it('joins managers:all for field.manage, reports:<own employee> for view, refuses others', async () => {
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
