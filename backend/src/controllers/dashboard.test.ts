/**
 * Dashboard trend and the manager's team view, read off real attendance rows.
 *
 * The trend chart compared statuses against `'half-day'` while rows store
 * `half_day`, so half days vanished from it. The team view mapped a leave
 * row that has no punch — a half-day leave, an unpaid leave (stamped
 * `absent`) — to "present" / "absent" instead of "on leave".
 *
 * The clock is pinned to Wed 14 Oct 2026, 12:00 IST.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';

const NOW = new Date('2026-10-14T06:30:00.000Z');
const TODAY = new Date('2026-10-14T00:00:00.000Z');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let app: Express;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  app = createApp();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /dashboard/attendance-trend', () => {
  it('counts a half_day row (with the late arrivals, as the chart stacks them)', async () => {
    const { user, token } = await createUser({ roleSlug: 'admin' });
    const a = await createEmployeeFor(user);
    const b = await Employee.create({ firstName: 'Other', lastName: 'Person', email: 'other.person@test.local', joiningDate: new Date('2024-01-15') });
    await Attendance.create({ employeeId: a._id, date: TODAY, status: 'half_day', checkIn: { time: NOW } });
    await Attendance.create({ employeeId: b._id, date: TODAY, status: 'present', checkIn: { time: NOW } });

    const res = await request(app).get('/api/v1/dashboard/attendance-trend').set(auth(token));

    expect(res.status).toBe(200);
    const today = res.body.data.find((d: { date: string }) => d.date === '2026-10-14');
    expect(today).toMatchObject({ present: 1, late: 1, absent: 0 });
  });
});

describe('GET /team/overview', () => {
  async function teamOf(n: number): Promise<{ token: string; members: IEmployee[] }> {
    const { user, token } = await createUser({ roleSlug: 'manager' });
    const me = await createEmployeeFor(user);
    // Reports need no login of their own here (and skipping one saves a bcrypt hash each).
    const members: IEmployee[] = [];
    for (let i = 0; i < n; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      members.push(
        await Employee.create({
          firstName: 'Team',
          lastName: `Member${i + 1}`,
          email: `team.${i + 1}.${new Types.ObjectId().toHexString()}@test.local`,
          joiningDate: new Date('2024-01-15'),
          reportingManager: me._id,
        }),
      );
    }
    return { token, members };
  }

  const statusOf = (body: { data: { members: { _id: string; status: string }[] } }, e: IEmployee) =>
    body.data.members.find((m) => m._id === String(e._id))?.status;

  it('members with a leave row for today show on_leave — paid, half-day or unpaid — and are counted so', async () => {
    const { token, members } = await teamOf(4);
    const [paid, half, unpaid, worked] = members as [IEmployee, IEmployee, IEmployee, IEmployee];
    const leaveRequestId = new Types.ObjectId();
    await Attendance.create({ employeeId: paid._id, date: TODAY, status: 'on_leave', isPaidLeave: true, leaveRequestId, source: 'leave' });
    await Attendance.create({ employeeId: half._id, date: TODAY, status: 'half_day', isPaidLeave: true, leaveRequestId, source: 'leave' });
    await Attendance.create({ employeeId: unpaid._id, date: TODAY, status: 'absent', isPaidLeave: false, leaveRequestId, source: 'leave' });
    // Half a day off, and checked in for the other half: they are at work.
    await Attendance.create({ employeeId: worked._id, date: TODAY, status: 'present', checkIn: { time: NOW }, leaveRequestId, isPaidLeave: true });

    const res = await request(app).get('/api/v1/team/overview').set(auth(token));

    expect(res.status).toBe(200);
    expect(statusOf(res.body, paid)).toBe('on_leave');
    expect(statusOf(res.body, half)).toBe('on_leave');
    expect(statusOf(res.body, unpaid)).toBe('on_leave');
    expect(statusOf(res.body, worked)).toBe('present');
    expect(res.body.data).toMatchObject({ onLeave: 3, present: 1, absent: 0 });
  });

  it('an auto_absent row still shows absent', async () => {
    const { token, members } = await teamOf(1);
    await Attendance.create({ employeeId: members[0]!._id, date: TODAY, status: 'absent', source: 'auto_absent' });

    const res = await request(app).get('/api/v1/team/overview').set(auth(token));

    expect(statusOf(res.body, members[0]!)).toBe('absent');
  });
});
