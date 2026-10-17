/**
 * Regularization: an employee asks for the punch times a day should carry;
 * an approver decides; approving writes the times and re-judges the day.
 *
 * Reference days (October 2026): "now" is Wed 14 12:00 IST; "yesterday" is
 * Tue 13, the day most requests are about. The default shift is 09:30 → 18:00
 * with 15 minutes' grace. Only `Date` is faked, so the DB driver keeps working.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { Department } from '../models/department.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Notification } from '../models/notification.model.js';
import { Shift } from '../models/shift.model.js';
import type { IUser } from '../models/user.model.js';

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** An instant given as IST wall-clock time on an IST calendar day. */
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

const YESTERDAY = '2026-10-13';
const TODAY = '2026-10-14';
const TOMORROW = '2026-10-15';

interface Person {
  user: IUser;
  /** Present for everyone made with `person()`; absent for `approver()`. */
  emp: IEmployee;
  auth: () => { Authorization: string };
}

let app: Express;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist(TODAY, '12:00'));
  app = createApp();
  await Shift.create({
    name: 'General',
    startTime: '09:30',
    endTime: '18:00',
    graceMinutes: 15,
    halfDayHours: 4,
    fullDayHours: 8,
    isDefault: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function person(roleSlug: RoleSlug = 'employee', fields: Record<string, unknown> = {}): Promise<Person> {
  const { user } = await createUser({ roleSlug });
  const emp = await createEmployeeFor(user);
  if (Object.keys(fields).length > 0) await Employee.updateOne({ _id: emp._id }, { $set: fields });
  return { user, emp, auth: () => ({ Authorization: `Bearer ${user.generateAccessToken()}` }) };
}

/** A user who decides requests but has no employee record of their own. */
async function approver(roleSlug: RoleSlug = 'hr_executive'): Promise<Omit<Person, 'emp'>> {
  const { user } = await createUser({ roleSlug });
  return { user, auth: () => ({ Authorization: `Bearer ${user.generateAccessToken()}` }) };
}

const requestRegularization = (who: Person, body: Record<string, unknown>) =>
  request(app).post('/api/v1/attendance/regularize').set(who.auth()).send(body);

const decide = (who: Pick<Person, 'auth'>, id: unknown, status: 'approved' | 'rejected') =>
  request(app).patch(`/api/v1/attendance/regularize/${String(id)}`).set(who.auth()).send({ status });

const rowOf = (who: Person, iso: string) =>
  Attendance.findOne({ employeeId: who.emp._id, date: label(iso) }).lean().exec();

/** Request a full 09:30 → 18:00 day yesterday and return the stored row id. */
async function requestDay(
  who: Person,
  times: { checkIn?: Date; checkOut?: Date } = { checkIn: ist(YESTERDAY, '09:30'), checkOut: ist(YESTERDAY, '18:00') },
): Promise<string> {
  const res = await requestRegularization(who, {
    date: YESTERDAY,
    reason: 'Biometric was down',
    ...(times.checkIn ? { checkIn: times.checkIn.toISOString() } : {}),
    ...(times.checkOut ? { checkOut: times.checkOut.toISOString() } : {}),
  });
  expect(res.status).toBe(201);
  return String(res.body.data._id);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('requesting a regularization', () => {
  it('stores the requested times on a new absent row, pending', async () => {
    const who = await person();

    const res = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Forgot to punch',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
      checkOut: ist(YESTERDAY, '18:00').toISOString(),
    });

    expect(res.status).toBe(201);
    const row = await rowOf(who, YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.status).toBe('absent');
    expect(row!.isRegularized).toBe(false);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.regularization!.reason).toBe('Forgot to punch');
    expect(row!.regularization!.requestedCheckIn!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
    expect(row!.regularization!.requestedCheckOut!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());
    // Nothing is punched until somebody approves.
    expect(row!.checkIn).toBeUndefined();
  });

  it('still takes a reason-only request, without requested times', async () => {
    const who = await person();

    const res = await requestRegularization(who, { date: YESTERDAY, reason: 'Was on a client visit' });

    expect(res.status).toBe(201);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.regularization!.requestedCheckIn).toBeUndefined();
    expect(row!.regularization!.requestedCheckOut).toBeUndefined();
  });

  it('attaches the request to the existing row instead of creating a second one', async () => {
    const who = await person();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label(YESTERDAY),
      status: 'half_day',
      checkIn: { time: ist(YESTERDAY, '13:00'), method: 'manual' },
      checkOut: { time: ist(YESTERDAY, '17:30'), method: 'manual' },
    });

    const res = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Punched in late by mistake',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
    });

    expect(res.status).toBe(201);
    expect(await Attendance.countDocuments({ employeeId: who.emp._id })).toBe(1);
  });

  it('keys the day by the business (IST) calendar day', async () => {
    const who = await person();

    // 00:30 IST on the 13th is still the 12th in UTC.
    const res = await requestRegularization(who, {
      date: ist(YESTERDAY, '00:30').toISOString(),
      reason: 'Early start',
      checkIn: ist(YESTERDAY, '00:30').toISOString(),
    });

    expect(res.status).toBe(201);
    expect(await rowOf(who, YESTERDAY)).not.toBeNull();
  });

  it("allows today, but not a day that hasn't started", async () => {
    const who = await person();

    const today = await requestRegularization(who, {
      date: TODAY,
      reason: 'Forgot to punch',
      checkIn: ist(TODAY, '09:30').toISOString(),
      checkOut: ist(TODAY, '11:00').toISOString(),
    });
    expect(today.status).toBe(201);

    const tomorrow = await requestRegularization(who, { date: TOMORROW, reason: 'Planning ahead' });
    expect(tomorrow.status).toBe(400);
    expect(await rowOf(who, TOMORROW)).toBeNull();
  });

  it('refuses a second request while one is pending, with REGULARIZATION_PENDING', async () => {
    const who = await person();
    await requestDay(who);

    const again = await requestRegularization(who, { date: YESTERDAY, reason: 'Asking twice' });

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REGULARIZATION_PENDING');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.reason).toBe('Biometric was down');
  });

  it('allows a fresh request once the previous one was rejected', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);
    expect((await decide(hr, id, 'rejected')).status).toBe(200);

    const again = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Here is the proof',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
    });

    expect(again.status).toBe(201);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.regularization!.reason).toBe('Here is the proof');
  });

  it('refuses a day that carries a leave stamp, with LEAVE_DAY', async () => {
    const who = await person();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label(YESTERDAY),
      status: 'on_leave',
      isPaidLeave: true,
      leaveRequestId: new Types.ObjectId(),
      source: 'leave',
    });

    const res = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'I did work that day',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LEAVE_DAY');
    expect(res.body.error.message).toBe('Cancel the leave before regularizing this day');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization).toBeUndefined();
  });

  describe('requested times', () => {
    it('a check-in on another day is refused, and no row is left behind', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Wrong day',
        checkIn: ist(TODAY, '09:30').toISOString(),
      });

      expect(res.status).toBe(400);
      expect(await rowOf(who, YESTERDAY)).toBeNull();
    });

    it('a check-out before the check-in is refused', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Swapped',
        checkIn: ist(YESTERDAY, '18:00').toISOString(),
        checkOut: ist(YESTERDAY, '09:30').toISOString(),
      });

      expect(res.status).toBe(400);
    });

    it('a check-out more than 12 hours after the check-in is refused; exactly 12 is fine', async () => {
      const who = await person();

      const tooLong = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Marathon',
        checkIn: ist(YESTERDAY, '09:00').toISOString(),
        checkOut: ist(YESTERDAY, '21:01').toISOString(),
      });
      expect(tooLong.status).toBe(400);

      const edge = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Long day',
        checkIn: ist(YESTERDAY, '09:00').toISOString(),
        checkOut: ist(YESTERDAY, '21:00').toISOString(),
      });
      expect(edge.status).toBe(201);
    });

    it('a check-out may cross midnight', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Night shift',
        checkIn: ist(YESTERDAY, '22:00').toISOString(),
        checkOut: ist(TODAY, '04:00').toISOString(),
      });

      expect(res.status).toBe(201);
      const row = await rowOf(who, YESTERDAY);
      expect(row!.regularization!.requestedCheckOut!.toISOString()).toBe(ist(TODAY, '04:00').toISOString());
    });

    it('a check-out without a check-in is refused', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Only the end',
        checkOut: ist(YESTERDAY, '18:00').toISOString(),
      });

      expect(res.status).toBe(400);
      expect(await rowOf(who, YESTERDAY)).toBeNull();
    });

    it('a time that has not happened yet is refused', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: TODAY,
        reason: 'Will leave at six',
        checkIn: ist(TODAY, '09:30').toISOString(),
        checkOut: ist(TODAY, '18:00').toISOString(),
      });

      expect(res.status).toBe(400);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('approving a regularization', () => {
  it('writes the requested punches, computes hours and turns an absent day present', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
    expect(row!.checkIn!.method).toBe('manual');
    expect(row!.checkIn!.metadata!.regularized).toBe(true);
    expect(row!.checkOut!.time!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());
    expect(row!.checkOut!.method).toBe('manual');
    expect(row!.checkOut!.metadata!.regularized).toBe(true);
    expect(row!.totalWorkingHours).toBe(8.5);
    expect(row!.status).toBe('present');
    expect(row!.lateBy).toBe(0);
    expect(row!.earlyLeaveBy).toBe(0);
    expect(row!.overtimeHours).toBe(0.5);
    expect(row!.source).toBe('regularization');
    expect(row!.isRegularized).toBe(true);
    expect(row!.regularization!.status).toBe('approved');
    expect(String(row!.regularization!.approvedBy)).toBe(String(hr.user._id));
    expect(row!.regularization!.approvedAt).toBeInstanceOf(Date);
  });

  it("judges the day by the employee's shift: past grace → late", async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, { checkIn: ist(YESTERDAY, '10:00'), checkOut: ist(YESTERDAY, '18:00') });

    await decide(hr, id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(row!.lateBy).toBe(15);
    expect(row!.status).toBe('late');
    expect(row!.totalWorkingHours).toBe(8);
  });

  it('a short day becomes a half day', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, { checkIn: ist(YESTERDAY, '09:30'), checkOut: ist(YESTERDAY, '12:00') });

    await decide(hr, id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(row!.totalWorkingHours).toBe(2.5);
    expect(row!.status).toBe('half_day');
    expect(row!.earlyLeaveBy).toBe(360);
  });

  it('corrects the punches of a row that already has them', async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label(YESTERDAY),
      status: 'half_day',
      checkIn: { time: ist(YESTERDAY, '14:00'), method: 'qr' },
      checkOut: { time: ist(YESTERDAY, '18:00'), method: 'qr' },
      totalWorkingHours: 4,
    });
    const res = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Scanned in late by mistake',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
    });

    await decide(hr, res.body.data._id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
    expect(row!.checkIn!.method).toBe('manual');
    // The recorded check-out stays, and the hours follow the corrected pair.
    expect(row!.checkOut!.time!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());
    expect(row!.totalWorkingHours).toBe(8.5);
    expect(row!.status).toBe('present');
  });

  it('a check-in alone leaves the day open, judged for lateness only', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, { checkIn: ist(YESTERDAY, '09:40') });

    await decide(hr, id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:40').toISOString());
    expect(row!.checkOut).toBeUndefined();
    expect(row!.status).toBe('present');
    expect(row!.source).toBe('regularization');
  });

  it('a reason-only request cannot invent punches: only the regularization and isRegularized change', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, {});

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('approved');
    expect(row!.isRegularized).toBe(true);
    expect(row!.checkIn).toBeUndefined();
    expect(row!.checkOut).toBeUndefined();
    expect(row!.status).toBe('absent');
    expect(row!.totalWorkingHours).toBe(0);
    expect(row!.source).toBe('punch');
  });

  it('refuses to put a check-in after the check-out already on the row', async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label(YESTERDAY),
      status: 'half_day',
      checkIn: { time: ist(YESTERDAY, '09:30'), method: 'qr' },
      checkOut: { time: ist(YESTERDAY, '13:00'), method: 'qr' },
      totalWorkingHours: 3.5,
    });
    const res = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Wrong time',
      checkIn: ist(YESTERDAY, '15:00').toISOString(),
    });

    const decided = await decide(hr, res.body.data._id, 'approved');

    expect(decided.status).toBe(400);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
  });

  it('refuses when a leave has been stamped on the day since the request', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);
    await Attendance.updateOne(
      { _id: id },
      { $set: { leaveRequestId: new Types.ObjectId(), isPaidLeave: true, status: 'on_leave', source: 'leave' } },
    );

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LEAVE_DAY');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.checkIn).toBeUndefined();
    expect(row!.regularization!.status).toBe('pending');
  });
});

describe('rejecting a regularization', () => {
  it('leaves the row as it was apart from the regularization status', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);

    const res = await decide(hr, id, 'rejected');

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.status).toBe('absent');
    expect(row!.checkIn).toBeUndefined();
    expect(row!.checkOut).toBeUndefined();
    expect(row!.totalWorkingHours).toBe(0);
    expect(row!.isRegularized).toBe(false);
    expect(row!.source).toBe('punch');
    expect(row!.regularization!.status).toBe('rejected');
    expect(String(row!.regularization!.approvedBy)).toBe(String(hr.user._id));
    expect(row!.regularization!.approvedAt).toBeInstanceOf(Date);
  });
});

describe('who may decide', () => {
  it('not the employee who asked, even with the permission: 403 SELF_APPROVAL', async () => {
    const hr = await person('hr_executive');
    const id = await requestDay(hr);

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
    const row = await rowOf(hr, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.checkIn).toBeUndefined();
  });

  it('not a plain employee: 403', async () => {
    const who = await person();
    const colleague = await person();
    const id = await requestDay(who);

    const res = await decide(colleague, id, 'approved');

    expect(res.status).toBe(403);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
  });

  it('a request that was already decided cannot be decided again', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);
    expect((await decide(hr, id, 'approved')).status).toBe(200);

    const again = await decide(hr, id, 'rejected');

    expect(again.status).toBe(400);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('approved');
    expect(row!.checkIn).toBeDefined();
  });

  it('a row with no request is a 400, an unknown row a 404', async () => {
    const who = await person();
    const hr = await approver();
    const bare = await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent' });

    expect((await decide(hr, bare._id, 'approved')).status).toBe(400);
    expect((await decide(hr, new Types.ObjectId(), 'approved')).status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('GET /attendance/regularizations', () => {
  const list = (who: Pick<Person, 'auth'>, query = '') =>
    request(app).get(`/api/v1/attendance/regularizations${query}`).set(who.auth());

  it('lists pending requests for an approver, with the employee populated', async () => {
    const dept = await Department.create({ name: 'Operations', code: 'OPS' });
    const who = await person('employee', { department: dept._id });
    const hr = await approver();
    const id = await requestDay(who);
    // A day with no request must not show up.
    await Attendance.create({ employeeId: who.emp._id, date: label('2026-10-12'), status: 'present' });

    const res = await list(hr);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    const row = res.body.data[0];
    expect(row._id).toBe(id);
    expect(row.regularization.status).toBe('pending');
    expect(row.regularization.requestedCheckIn).toBe(ist(YESTERDAY, '09:30').toISOString());
    expect(row.employeeId.firstName).toBe(who.emp.firstName);
    expect(row.employeeId.lastName).toBe(who.emp.lastName);
    expect(row.employeeId.employeeId).toBe(who.emp.employeeId);
    expect(row.employeeId.department).toBe(String(dept._id));
    // Only the fields the queue needs.
    expect(row.employeeId).not.toHaveProperty('email');
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 1, pages: 1 });
  });

  it('filters by status, and defaults to pending', async () => {
    const a = await person();
    const b = await person();
    const hr = await approver();
    const approvedId = await requestDay(a);
    const rejectedId = await requestDay(b);
    const pendingId = await requestRegularization(a, { date: '2026-10-12', reason: 'Another day' }).then((r) =>
      String(r.body.data._id),
    );
    await decide(hr, approvedId, 'approved');
    await decide(hr, rejectedId, 'rejected');

    const ids = async (query: string) => ((await list(hr, query)).body.data as Array<{ _id: string }>).map((r) => r._id);

    expect(await ids('')).toEqual([pendingId]);
    expect(await ids('?status=pending')).toEqual([pendingId]);
    expect(await ids('?status=approved')).toEqual([approvedId]);
    expect(await ids('?status=rejected')).toEqual([rejectedId]);
  });

  it('paginates', async () => {
    const hr = await approver();
    for (let i = 0; i < 3; i++) await requestDay(await person());

    const res = await list(hr, '?page=2&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('rejects an unknown status', async () => {
    const hr = await approver();

    expect((await list(hr, '?status=maybe')).status).toBe(400);
  });

  it('is 403 for an employee and for a manager without attendance.approve', async () => {
    const who = await person();
    const manager = await person('manager');

    expect((await list(who)).status).toBe(403);
    expect((await list(manager)).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('notifications', () => {
  it("tells the reporting manager about a new request, with a link to the queue", async () => {
    const manager = await person('manager');
    const who = await person('employee', { reportingManager: manager.emp._id });

    const id = await requestDay(who);

    const notes = await Notification.find({ userId: manager.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('regularization_request');
    expect(notes[0]!.link).toBe('/attendance/regularizations');
    expect(notes[0]!.message).toContain(`${who.emp.firstName} ${who.emp.lastName}`);
    expect(notes[0]!.message).toContain('13 Oct 2026');
    expect(notes[0]!.isRead).toBe(false);
    expect(notes[0]!.metadata).toMatchObject({ attendanceId: id });
    // Nobody else hears about it.
    expect(await Notification.countDocuments({ userId: who.user._id })).toBe(0);
  });

  it('sends nothing when the employee has no reporting manager, or is their own', async () => {
    const solo = await person();
    const self = await person();
    await Employee.updateOne({ _id: self.emp._id }, { $set: { reportingManager: self.emp._id } });

    await requestDay(solo);
    await requestDay(self);

    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('tells the employee when the request is approved, linking to their attendance', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);

    await decide(hr, id, 'approved');

    const notes = await Notification.find({ userId: who.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('regularization_decision');
    expect(notes[0]!.link).toBe('/attendance');
    expect(notes[0]!.message).toContain('13 Oct 2026');
    expect(notes[0]!.message).toContain('approved');
    expect(notes[0]!.metadata).toMatchObject({ status: 'approved', attendanceId: id });
  });

  it('tells the employee when the request is rejected', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);

    await decide(hr, id, 'rejected');

    const notes = await Notification.find({ userId: who.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('regularization_decision');
    expect(notes[0]!.message).toContain('rejected');
  });

  it('a failing notification never fails the request or the decision', async () => {
    const manager = await person('manager');
    const who = await person('employee', { reportingManager: manager.emp._id });
    const hr = await approver();
    vi.spyOn(Notification, 'create').mockRejectedValue(new Error('notification store down'));

    const created = await requestRegularization(who, {
      date: YESTERDAY,
      reason: 'Biometric was down',
      checkIn: ist(YESTERDAY, '09:30').toISOString(),
      checkOut: ist(YESTERDAY, '18:00').toISOString(),
    });
    expect(created.status).toBe(201);

    const decided = await decide(hr, created.body.data._id, 'approved');
    expect(decided.status).toBe(200);
    expect((await rowOf(who, YESTERDAY))!.status).toBe('present');
  });
});
