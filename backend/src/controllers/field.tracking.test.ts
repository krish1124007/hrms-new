/**
 * Continuous tracking is removed (locations only at check-in/check-out): both
 * upload URLs answer 200 `{ ignored: true }` for any body and store nothing,
 * even for clocked-in field staff with live tracking switched on; the live,
 * trail and visit-map reads — and the attendance live map — are gone (the
 * team map uses /field/team/status and /field/route/:employeeId). The
 * `/field-tracking` socket namespace is gone too.
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

  it('the attendance live map answers 404, even for HR', async () => {
    const { token } = await createUser({ roleSlug: 'hr_executive' });
    expect((await request(app).get('/api/v1/attendance/tracking/live').set(auth(token))).status).toBe(404);
  });
});
