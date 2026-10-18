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
import { Holiday } from '../models/holiday.model.js';
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

/** The 400 a refused request / decision returns. */
function expectRefused(res: request.Response, message: string): void {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe('VALIDATION_ERROR');
  expect(res.body.error.message).toBe(message);
}

/** An attendance row with a real check-in — the punch details a correction must not lose. */
const REAL_CHECK_IN = {
  time: ist(YESTERDAY, '09:30'),
  method: 'qr',
  location: { lat: 19.07, lng: 72.87, address: 'Head Office' },
  photo: 'in.jpg',
  deviceInfo: { model: 'Pixel 8' },
};
const REAL_CHECK_OUT = {
  time: ist(YESTERDAY, '13:00'),
  method: 'qr',
  location: { lat: 19.07, lng: 72.87, address: 'Head Office' },
  photo: 'out.jpg',
  deviceInfo: { model: 'Pixel 8' },
};

/**
 * Hold the first `count` `Attendance.<method>().exec()` reads until all of them
 * have returned, so that many requests are certain to have read the row before
 * any of them writes. This is how a race is forced rather than hoped for.
 */
function holdReads(method: 'findById' | 'findOne', count = 2): void {
  const original = Attendance[method].bind(Attendance) as unknown as (
    ...args: unknown[]
  ) => { exec: () => Promise<unknown> };
  let held = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(Attendance, method).mockImplementation(((...args: unknown[]) => {
    const query = original(...args);
    const exec = query.exec.bind(query);
    query.exec = async () => {
      const doc = await exec();
      if (held < count) {
        held += 1;
        if (held === count) release();
        await gate;
      }
      return doc;
    };
    return query;
  }) as never);
}

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

  describe('non-working days', () => {
    it('a weekend day with no row is refused, NOT_A_WORKING_DAY, and no row is left behind', async () => {
      const who = await person();

      // Sun 11 Oct 2026: the company week-off.
      const res = await requestRegularization(who, { date: '2026-10-11', reason: 'Worked from home' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NOT_A_WORKING_DAY');
      expect(await rowOf(who, '2026-10-11')).toBeNull();
    });

    it("a public holiday, or a day outside the employee's shift, is refused the same way", async () => {
      const who = await person();
      await Holiday.create({ name: 'Founders Day', date: new Date('2026-10-12'), type: 'public' });
      const monFri = await Shift.create({ name: 'Mon-Fri', startTime: '09:30', endTime: '18:00', workDays: [1, 2, 3, 4, 5] });
      const weekdays = await person('employee', { shift: monFri._id });

      const holiday = await requestRegularization(who, { date: '2026-10-12', reason: 'Came in anyway' });
      // Sat 10 Oct is the 2nd Saturday: a company working day, but not on this shift.
      const saturday = await requestRegularization(weekdays, { date: '2026-10-10', reason: 'Came in anyway' });

      expect(holiday.status).toBe(400);
      expect(holiday.body.error.code).toBe('NOT_A_WORKING_DAY');
      expect(saturday.status).toBe(400);
      expect(saturday.body.error.code).toBe('NOT_A_WORKING_DAY');
      expect(await Attendance.countDocuments({ employeeId: { $in: [who.emp._id, weekdays.emp._id] } })).toBe(0);
    });

    it('a non-working day the employee actually punched on can still be regularized', async () => {
      const who = await person();
      await Attendance.create({
        employeeId: who.emp._id,
        date: label('2026-10-11'),
        status: 'present',
        checkIn: { time: ist('2026-10-11', '10:00'), method: 'manual' },
      });

      const res = await requestRegularization(who, {
        date: '2026-10-11',
        reason: 'Forgot to punch out',
        checkOut: ist('2026-10-11', '16:00').toISOString(),
      });

      expect(res.status).toBe(201);
    });
  });

  describe('requested times', () => {
    it('a check-in on another day is refused, and no row is left behind', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Wrong day',
        checkIn: ist(TODAY, '09:30').toISOString(),
      });

      expectRefused(res, 'The check-in must fall on the day being regularized');
      expect(await rowOf(who, YESTERDAY)).toBeNull();
    });

    it('a check-out before, or at, the check-in is refused', async () => {
      const who = await person();

      const before = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Swapped',
        checkIn: ist(YESTERDAY, '18:00').toISOString(),
        checkOut: ist(YESTERDAY, '09:30').toISOString(),
      });
      expectRefused(before, 'The check-out must be after the check-in');

      const same = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'A zero-hour day',
        checkIn: ist(YESTERDAY, '09:30').toISOString(),
        checkOut: ist(YESTERDAY, '09:30').toISOString(),
      });
      expectRefused(same, 'The check-out must be after the check-in');
      expect(await rowOf(who, YESTERDAY)).toBeNull();
    });

    it('a check-out more than 12 hours after the check-in is refused; exactly 12 is fine', async () => {
      const who = await person();

      const tooLong = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Marathon',
        checkIn: ist(YESTERDAY, '09:00').toISOString(),
        checkOut: ist(YESTERDAY, '21:01').toISOString(),
      });
      expectRefused(tooLong, 'The check-out must be within 12 hours of the check-in');

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

    it('a time that has not happened yet is refused', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: TODAY,
        reason: 'Will leave at six',
        checkIn: ist(TODAY, '09:30').toISOString(),
        checkOut: ist(TODAY, '18:00').toISOString(),
      });

      expectRefused(res, 'A requested time cannot be in the future');
    });

    it('a future date is refused with its own message', async () => {
      const who = await person();

      const res = await requestRegularization(who, { date: TOMORROW, reason: 'Planning ahead' });

      expectRefused(res, 'Cannot regularize a future date');
    });
  });

  describe('partial punch requests', () => {
    const withCheckIn = (who: Person, extra: Record<string, unknown> = {}) =>
      Attendance.create({
        employeeId: who.emp._id,
        date: label(YESTERDAY),
        status: 'present',
        checkIn: REAL_CHECK_IN,
        ...extra,
      });

    it('a check-out alone is refused when the day has no check-in, and no row is left behind', async () => {
      const who = await person();

      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Only the end',
        checkOut: ist(YESTERDAY, '18:00').toISOString(),
      });

      expectRefused(res, 'A check-out time needs a check-in time');
      expect(await rowOf(who, YESTERDAY)).toBeNull();
    });

    it("a check-out alone is checked against the day's recorded check-in: after it, within 12 h", async () => {
      const who = await person();
      await withCheckIn(who);
      const ask = (at: string, day = YESTERDAY) =>
        requestRegularization(who, { date: YESTERDAY, reason: 'Forgot to punch out', checkOut: ist(day, at).toISOString() });

      expectRefused(await ask('09:30'), 'The requested check-out must be after the check-in already recorded for this day');
      expectRefused(await ask('08:00'), 'The requested check-out must be after the check-in already recorded for this day');
      expectRefused(await ask('21:31'), 'The check-out must be within 12 hours of the check-in');
      expect((await ask('18:00')).status).toBe(201);
    });

    it('a check-out alone: approving keeps the recorded check-in intact and computes the hours', async () => {
      const who = await person();
      const hr = await approver();
      await withCheckIn(who);
      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Forgot to punch out',
        checkOut: ist(YESTERDAY, '18:00').toISOString(),
      });
      expect(res.status).toBe(201);
      const stored = await rowOf(who, YESTERDAY);
      expect(stored!.regularization!.requestedCheckIn).toBeUndefined();
      expect(stored!.regularization!.requestedCheckOut!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());

      const decided = await decide(hr, res.body.data._id, 'approved');

      expect(decided.status).toBe(200);
      const row = await rowOf(who, YESTERDAY);
      expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
      expect(row!.checkIn!.method).toBe('qr');
      expect(row!.checkIn!.location).toMatchObject({ lat: 19.07, lng: 72.87, address: 'Head Office' });
      expect(row!.checkIn!.photo).toBe('in.jpg');
      expect(row!.checkIn!.deviceInfo).toMatchObject({ model: 'Pixel 8' });
      expect(row!.checkIn!.metadata?.regularized).toBeFalsy();
      expect(row!.checkOut!.time!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());
      expect(row!.checkOut!.method).toBe('manual');
      expect(row!.checkOut!.metadata!.regularized).toBe(true);
      expect(row!.totalWorkingHours).toBe(8.5);
      expect(row!.status).toBe('present');
      expect(row!.source).toBe('regularization');
      expect(row!.isRegularized).toBe(true);
    });

    it('a check-out alone ends a break left open at the requested check-out and deducts it', async () => {
      const who = await person();
      const hr = await approver();
      await withCheckIn(who, { breaks: [{ startTime: ist(YESTERDAY, '13:00'), type: 'lunch' }] });
      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Forgot to end the break and punch out',
        checkOut: ist(YESTERDAY, '18:00').toISOString(),
      });

      await decide(hr, res.body.data._id, 'approved');

      const row = await rowOf(who, YESTERDAY);
      expect(row!.breaks).toHaveLength(1);
      expect(row!.breaks[0]!.endTime!.toISOString()).toBe(ist(YESTERDAY, '18:00').toISOString());
      expect(row!.breaks[0]!.duration).toBe(300);
      // 09:30 → 18:00 is 8.5 h; the 5 h break comes off.
      expect(row!.totalWorkingHours).toBe(3.5);
      expect(row!.status).toBe('half_day');
    });

    it("a check-in alone is checked against the day's recorded check-out, at request time", async () => {
      const who = await person();
      await withCheckIn(who, { checkOut: REAL_CHECK_OUT, checkIn: { ...REAL_CHECK_IN, time: ist(YESTERDAY, '10:30') } });
      const ask = (at: string) =>
        requestRegularization(who, { date: YESTERDAY, reason: 'Scanned in late', checkIn: ist(YESTERDAY, at).toISOString() });

      expectRefused(await ask('15:00'), 'The requested check-in must be before the check-out already recorded for this day');
      expectRefused(await ask('13:00'), 'The requested check-in must be before the check-out already recorded for this day');
      expect((await ask('09:30')).status).toBe(201);
    });

    it('a check-in alone: approving keeps the recorded check-out intact and recomputes the hours', async () => {
      const who = await person();
      const hr = await approver();
      await withCheckIn(who, {
        status: 'half_day',
        checkIn: { ...REAL_CHECK_IN, time: ist(YESTERDAY, '10:30') },
        checkOut: REAL_CHECK_OUT,
        totalWorkingHours: 2.5,
      });
      const res = await requestRegularization(who, {
        date: YESTERDAY,
        reason: 'Scanned in late',
        checkIn: ist(YESTERDAY, '09:30').toISOString(),
      });

      await decide(hr, res.body.data._id, 'approved');

      const row = await rowOf(who, YESTERDAY);
      expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
      expect(row!.checkIn!.method).toBe('manual');
      expect(row!.checkIn!.metadata!.regularized).toBe(true);
      expect(row!.checkOut!.time!.toISOString()).toBe(ist(YESTERDAY, '13:00').toISOString());
      expect(row!.checkOut!.method).toBe('qr');
      expect(row!.checkOut!.location).toMatchObject({ address: 'Head Office' });
      expect(row!.checkOut!.photo).toBe('out.jpg');
      expect(row!.checkOut!.metadata?.regularized).toBeFalsy();
      expect(row!.totalWorkingHours).toBe(3.5);
      expect(row!.status).toBe('half_day');
    });
  });

  describe('racing requests', () => {
    it('two submits that both read an open day: one is accepted, the other is REGULARIZATION_PENDING, one notification', async () => {
      const manager = await person('manager');
      const who = await person('employee', { reportingManager: manager.emp._id });
      await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent' });
      holdReads('findOne');

      const [a, b] = await Promise.all([
        requestRegularization(who, { date: YESTERDAY, reason: 'First tap' }),
        requestRegularization(who, { date: YESTERDAY, reason: 'Second tap' }),
      ]);
      vi.restoreAllMocks();

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.error.code).toBe('REGULARIZATION_PENDING');
      expect(await Notification.countDocuments({ userId: manager.user._id })).toBe(1);
      expect(await Attendance.countDocuments({ employeeId: who.emp._id })).toBe(1);
    });

    it("two first-time submits that both create the day's row: one row, one accepted, the other REGULARIZATION_PENDING", async () => {
      await Attendance.init();
      const manager = await person('manager');
      const who = await person('employee', { reportingManager: manager.emp._id });
      holdReads('findOne');

      const [a, b] = await Promise.all([
        requestRegularization(who, { date: YESTERDAY, reason: 'First tap' }),
        requestRegularization(who, { date: YESTERDAY, reason: 'Second tap' }),
      ]);
      vi.restoreAllMocks();

      expect([a.status, b.status].sort()).toEqual([201, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.error.code).toBe('REGULARIZATION_PENDING');
      expect(await Attendance.countDocuments({ employeeId: who.emp._id })).toBe(1);
      expect(await Notification.countDocuments({ userId: manager.user._id })).toBe(1);
    });

    it('a leave stamped between reading the day and claiming it is refused, LEAVE_DAY', async () => {
      const who = await person();
      const row = await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent' });
      const original = Attendance.findOne.bind(Attendance) as unknown as (
        ...args: unknown[]
      ) => { exec: () => Promise<unknown> };
      vi.spyOn(Attendance, 'findOne').mockImplementation(((...args: unknown[]) => {
        const query = original(...args);
        const exec = query.exec.bind(query);
        query.exec = async () => {
          const doc = await exec();
          await Attendance.updateOne(
            { _id: row._id },
            { $set: { leaveRequestId: new Types.ObjectId(), isPaidLeave: true, status: 'on_leave', source: 'leave' } },
          );
          return doc;
        };
        return query;
      }) as never);

      const res = await requestRegularization(who, { date: YESTERDAY, reason: 'I did work that day' });
      vi.restoreAllMocks();

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LEAVE_DAY');
      expect((await rowOf(who, YESTERDAY))!.regularization).toBeUndefined();
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

  it('a reason-only request on an auto-absent day: approving marks it present, with no punches and 0 hours', async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent', source: 'auto_absent' });
    const id = await requestDay(who, {});

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('approved');
    expect(row!.status).toBe('present');
    expect(row!.isRegularized).toBe(true);
    expect(row!.source).toBe('regularization');
    expect(row!.checkIn?.time).toBeUndefined();
    expect(row!.checkOut?.time).toBeUndefined();
    expect(row!.totalWorkingHours).toBe(0);
    expect(row!.lateBy).toBe(0);
    expect(row!.overtimeHours).toBe(0);
  });

  it('a reason-only approval on a day with punches keeps them and the hours, and marks the day present', async () => {
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
    const id = await requestDay(who, {});

    await decide(hr, id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(row!.status).toBe('present');
    expect(row!.source).toBe('regularization');
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
    expect(row!.checkIn!.method).toBe('qr');
    expect(row!.totalWorkingHours).toBe(3.5);
  });

  it('a reason-only approval is still refused on a leave-stamped day', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, {});
    await Attendance.updateOne(
      { _id: id },
      { $set: { leaveRequestId: new Types.ObjectId(), isPaidLeave: true, status: 'on_leave', source: 'leave' } },
    );

    const res = await decide(hr, id, 'approved');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LEAVE_DAY');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.status).toBe('on_leave');
    expect(row!.regularization!.status).toBe('pending');
  });

  it('refuses to put a check-in at or after the check-out now on the row, leaving the request pending', async () => {
    const who = await person();
    const hr = await approver();
    // Filed when the row had no check-out; a check-out was punched since.
    const row = await Attendance.create({
      employeeId: who.emp._id,
      date: label(YESTERDAY),
      status: 'half_day',
      checkIn: { time: ist(YESTERDAY, '09:30'), method: 'qr' },
      checkOut: { time: ist(YESTERDAY, '13:00'), method: 'qr' },
      totalWorkingHours: 3.5,
      regularization: {
        requestedAt: ist(YESTERDAY, '12:00'),
        reason: 'Wrong time',
        status: 'pending',
        requestedCheckIn: ist(YESTERDAY, '15:00'),
      },
    });

    const decided = await decide(hr, row._id, 'approved');

    expectRefused(decided, 'The requested punches leave the check-out at or before the check-in');
    const after = await rowOf(who, YESTERDAY);
    expect(after!.regularization!.status).toBe('pending');
    expect(after!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '09:30').toISOString());
  });

  it('requested times on an auto-absent row: approving makes it a regularized present day', async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent', source: 'auto_absent' });
    const id = await requestDay(who);

    await decide(hr, id, 'approved');

    const row = await rowOf(who, YESTERDAY);
    expect(await Attendance.countDocuments({ employeeId: who.emp._id })).toBe(1);
    expect(row!.status).toBe('present');
    expect(row!.source).toBe('regularization');
    expect(row!.isRegularized).toBe(true);
    expect(row!.totalWorkingHours).toBe(8.5);
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

  it('removes the bare row the request itself created when the day is not a working day (holiday declared since)', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, {});
    await Holiday.create({ name: 'Declared later', date: new Date(YESTERDAY), type: 'public' });

    const res = await decide(hr, id, 'rejected');

    expect(res.status).toBe(200);
    // No `absent` row stays behind for payroll to dock.
    expect(await rowOf(who, YESTERDAY)).toBeNull();
    expect(await Attendance.countDocuments({ employeeId: who.emp._id }).setOptions({ withDeleted: true })).toBe(0);
  });

  it("keeps a pre-existing row on a non-working day: only a row the request created is removed", async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent', source: 'auto_absent' });
    const id = await requestDay(who, {});
    await Holiday.create({ name: 'Declared later', date: new Date(YESTERDAY), type: 'public' });

    expect((await decide(hr, id, 'rejected')).status).toBe(200);

    const row = await rowOf(who, YESTERDAY);
    expect(row).not.toBeNull();
    expect(row!.regularization!.status).toBe('rejected');
  });

  it('keeps a row the request created on a working day: the day was not worked, so it stays absent', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who, {});

    expect((await decide(hr, id, 'rejected')).status).toBe(200);

    const row = await rowOf(who, YESTERDAY);
    expect(row!.status).toBe('absent');
    expect(row!.regularization!.status).toBe('rejected');
  });

  it('a reason-only request on an auto-absent day stays absent when rejected', async () => {
    const who = await person();
    const hr = await approver();
    await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent', source: 'auto_absent' });
    const id = await requestDay(who, {});

    const res = await decide(hr, id, 'rejected');

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('rejected');
    expect(row!.status).toBe('absent');
    expect(row!.isRegularized).toBe(false);
    expect(row!.source).toBe('auto_absent');
    expect(row!.checkIn?.time).toBeUndefined();
    expect(row!.totalWorkingHours).toBe(0);
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

    expectRefused(again, 'This regularization request was already approved');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('approved');
    expect(row!.checkIn).toBeDefined();
  });

  it('a row with no request is a 400, an unknown row a 404', async () => {
    const who = await person();
    const hr = await approver();
    const bare = await Attendance.create({ employeeId: who.emp._id, date: label(YESTERDAY), status: 'absent' });

    expectRefused(await decide(hr, bare._id, 'approved'), 'No regularization request on this record');
    expect((await decide(hr, new Types.ObjectId(), 'approved')).status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('racing decisions', () => {
  it('an approve and a reject that both read the pending request: one wins, the other is 409 DECIDED_MEANWHILE', async () => {
    const who = await person();
    const hr = await approver();
    const otherHr = await approver();
    const id = await requestDay(who);
    holdReads('findById');

    const [approve, reject] = await Promise.all([decide(hr, id, 'approved'), decide(otherHr, id, 'rejected')]);
    vi.restoreAllMocks();

    expect([approve.status, reject.status].sort()).toEqual([200, 409]);
    const loser = approve.status === 409 ? approve : reject;
    expect(loser.body.error.code).toBe('DECIDED_MEANWHILE');
    // The row is exactly what the winner decided: the loser changed nothing.
    const row = await rowOf(who, YESTERDAY);
    if (approve.status === 200) {
      expect(row!.regularization!.status).toBe('approved');
      expect(row!.status).toBe('present');
      expect(row!.isRegularized).toBe(true);
      expect(row!.checkIn!.time).toBeInstanceOf(Date);
    } else {
      expect(row!.regularization!.status).toBe('rejected');
      expect(row!.status).toBe('absent');
      expect(row!.isRegularized).toBe(false);
      expect(row!.checkIn).toBeUndefined();
      expect(row!.source).toBe('punch');
    }
    // And the employee hears about that one decision only.
    const notes = await Notification.find({ userId: who.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toContain(row!.regularization!.status);
  });

  it('two approvals racing: one 200, one 409, the punches written once', async () => {
    const who = await person();
    const hr = await approver();
    const otherHr = await approver();
    const id = await requestDay(who);
    holdReads('findById');

    const [a, b] = await Promise.all([decide(hr, id, 'approved'), decide(otherHr, id, 'approved')]);
    vi.restoreAllMocks();

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await Notification.countDocuments({ userId: who.user._id })).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('HR correction while a request is pending', () => {
  const correct = (hr: Pick<Person, 'auth'>, id: unknown) =>
    request(app)
      .patch(`/api/v1/attendance/records/${String(id)}`)
      .set(hr.auth())
      .send({ checkIn: ist(YESTERDAY, '10:00').toISOString(), checkOut: ist(YESTERDAY, '17:00').toISOString(), reason: 'Fixed by HR' });

  it('is refused with REGULARIZATION_PENDING, leaving the request and the row alone', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);

    const res = await correct(hr, id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REGULARIZATION_PENDING');
    expect(res.body.error.message).toBe('Decide the pending regularization request first');
    const row = await rowOf(who, YESTERDAY);
    expect(row!.regularization!.status).toBe('pending');
    expect(row!.regularization!.reason).toBe('Biometric was down');
    expect(row!.checkIn).toBeUndefined();
  });

  it("nobody corrects their own record, even with attendance.manage: 403 SELF_APPROVAL, row untouched", async () => {
    const hr = await person('hr_manager');
    const own = await Attendance.create({ employeeId: hr.emp._id, date: label(YESTERDAY), status: 'absent', source: 'auto_absent' });

    const res = await correct(hr, own._id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
    const row = await rowOf(hr, YESTERDAY);
    expect(row!.status).toBe('absent');
    expect(row!.checkIn).toBeUndefined();
    expect(row!.isRegularized).toBe(false);
  });

  it('works again once the request is decided', async () => {
    const who = await person();
    const hr = await approver();
    const id = await requestDay(who);
    expect((await decide(hr, id, 'rejected')).status).toBe(200);

    const res = await correct(hr, id);

    expect(res.status).toBe(200);
    const row = await rowOf(who, YESTERDAY);
    expect(row!.checkIn!.time!.toISOString()).toBe(ist(YESTERDAY, '10:00').toISOString());
    expect(row!.regularization!.reason).toBe('Fixed by HR');
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

  it('is 403 for an employee, who lacks attendance.approve', async () => {
    const who = await person();

    expect((await list(who)).status).toBe(403);
  });

  it("gives a manager (attendance.approve) only their direct reports' requests", async () => {
    const manager = await person('manager');
    const report = await person('employee', { reportingManager: manager.emp._id });
    const stranger = await person();
    const reportRow = await requestDay(report);
    await requestDay(stranger);

    const res = await list(manager);

    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { _id: string }) => String(row._id))).toEqual([reportRow]);
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
