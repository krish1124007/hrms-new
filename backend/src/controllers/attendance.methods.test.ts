/**
 * Self-service punches: which check-in methods are really enforced, how the
 * shift judges a day (late / early leave / half day / overtime), night shifts
 * that end after midnight, and the configurable expense-before-checkout gate.
 *
 * Reference days (October 2026): Mon 12 · Tue 13 · Wed 14. The clock is faked
 * (Date only) so every punch lands at a known IST wall-clock time; tokens are
 * minted after each clock change so they are never "expired".
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { AllowedIP } from '../models/allowed-ip.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Shift, type IShift } from '../models/shift.model.js';
import type { IUser } from '../models/user.model.js';

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** An instant given as IST wall-clock time on an IST calendar day. */
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

interface Staff {
  user: IUser;
  emp: IEmployee;
  /** A fresh bearer header for the (faked) current time. */
  auth: () => { Authorization: string };
}

let app: Express;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist('2026-10-12', '08:00'));
  app = createApp();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Upsert the single attendance config. The expense gate defaults to `none`
 * here so tests about other rules need not file an expense first.
 */
async function configure(
  opts: { enabledMethods?: string[]; settings?: Record<string, unknown> } = {},
): Promise<void> {
  const $set: Record<string, unknown> = {
    enabledMethods: opts.enabledMethods ?? ['manual'],
    'settings.expenseBeforeCheckout': 'none',
  };
  for (const [k, v] of Object.entries(opts.settings ?? {})) $set[`settings.${k}`] = v;
  await AttendanceConfig.updateOne({}, { $set }, { upsert: true });
}

async function staff(fields: Record<string, unknown> = {}): Promise<Staff> {
  const { user } = await createUser({ roleSlug: 'employee' });
  const emp = await createEmployeeFor(user);
  if (Object.keys(fields).length > 0) await Employee.updateOne({ _id: emp._id }, { $set: fields });
  return { user, emp, auth: () => ({ Authorization: `Bearer ${user.generateAccessToken()}` }) };
}

async function shift(fields: Partial<Record<keyof IShift, unknown>>): Promise<IShift> {
  return Shift.create({ name: `Shift ${new Types.ObjectId().toHexString()}`, ...fields });
}

/** Punch in or out at `at` (IST instant), as `who`. */
async function punch(
  kind: 'in' | 'out',
  who: Staff,
  at: Date,
  body: Record<string, unknown> = { method: 'manual' },
  headers: Record<string, string> = {},
) {
  vi.setSystemTime(at);
  return request(app)
    .post(`/api/v1/attendance/check-${kind}`)
    .set({ ...who.auth(), ...headers })
    .send(body);
}

const rowsOf = (who: Staff) => Attendance.find({ employeeId: who.emp._id }).sort({ date: 1 }).lean().exec();

// ─────────────────────────────────────────────────────────────────────────────

describe('check-in methods', () => {
  it('face is refused with METHOD_UNAVAILABLE, even when the config enables it', async () => {
    await configure({ enabledMethods: ['face', 'manual'] });
    const who = await staff();

    const res = await punch('in', who, ist('2026-10-12', '09:30'), {
      method: 'face',
      faceConfidence: 0.99,
      liveness: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('METHOD_UNAVAILABLE');
    expect(res.body.error.message).toBe('Face verification is not available yet');
    expect(await rowsOf(who)).toHaveLength(0);
  });

  it('manual check-in without a location is refused when requireLocation is on', async () => {
    await configure({ settings: { requireLocation: true } });
    const who = await staff();

    const without = await punch('in', who, ist('2026-10-12', '09:30'));
    expect(without.status).toBe(400);
    expect(without.body.error.code).toBe('LOCATION_REQUIRED');
    expect(await rowsOf(who)).toHaveLength(0);

    const withFix = await punch('in', who, ist('2026-10-12', '09:31'), {
      method: 'manual',
      location: { lat: 19.07, lng: 72.87 },
    });
    expect(withFix.status).toBe(201);
  });

  it("manual check-in honours the employee's own requireLocation flag", async () => {
    await configure();
    const who = await staff({ requireLocation: true });

    const res = await punch('in', who, ist('2026-10-12', '09:30'));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOCATION_REQUIRED');
  });

  it('ip: X-Forwarded-For set by the trusted proxy matches an allowed IP', async () => {
    await configure({ enabledMethods: ['ip'] });
    await AllowedIP.create({ label: 'Office', ipAddress: '10.0.0.5' });
    const who = await staff();

    const res = await punch('in', who, ist('2026-10-12', '09:30'), { method: 'ip' }, { 'X-Forwarded-For': '10.0.0.5' });

    expect(res.status).toBe(201);
    const [row] = await rowsOf(who);
    expect(row!.checkIn!.method).toBe('ip');
    expect(row!.checkIn!.metadata!.ipAddress).toBe('10.0.0.5');
  });

  it('ip: an allowed address forged as the first X-Forwarded-For entry is ignored', async () => {
    await configure({ enabledMethods: ['ip'] });
    await AllowedIP.create({ label: 'Office', ipAddress: '10.0.0.5' });
    const who = await staff();

    // The client sent "X-Forwarded-For: 10.0.0.5"; the proxy appended the real peer.
    const res = await punch(
      'in',
      who,
      ist('2026-10-12', '09:30'),
      { method: 'ip' },
      { 'X-Forwarded-For': '10.0.0.5, 203.0.113.9' },
    );

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('203.0.113.9');
    expect(await rowsOf(who)).toHaveLength(0);
  });

  it('a check-in on an auto_absent row makes it a punch row', async () => {
    await configure();
    const who = await staff();
    await Attendance.create({ employeeId: who.emp._id, date: label('2026-10-12'), status: 'absent', source: 'auto_absent' });

    const res = await punch('in', who, ist('2026-10-12', '09:30'));

    expect(res.status).toBe(201);
    const rows = await rowsOf(who);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source).toBe('punch');
    expect(rows[0]!.status).toBe('present');
  });

  it('a check-in on a pre-stamped leave row keeps the leave stamp and status', async () => {
    await configure();
    const who = await staff();
    const leaveRequestId = new Types.ObjectId();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label('2026-10-12'),
      status: 'half_day',
      isPaidLeave: true,
      leaveRequestId,
      source: 'leave',
    });

    const res = await punch('in', who, ist('2026-10-12', '14:00'));

    expect(res.status).toBe(201);
    const [row] = await rowsOf(who);
    expect(row!.source).toBe('punch');
    expect(String(row!.leaveRequestId)).toBe(String(leaveRequestId));
    expect(row!.isPaidLeave).toBe(true);
    expect(row!.status).toBe('half_day');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('shift rules', () => {
  it('late past start + grace (09:30 + 15, in at 09:50 → lateBy 5); out at 17:00 on an 18:00 shift → earlyLeaveBy 60', async () => {
    await configure();
    const s = await shift({ startTime: '09:30', endTime: '18:00', graceMinutes: 15 });
    const who = await staff({ shift: s._id });

    const inRes = await punch('in', who, ist('2026-10-12', '09:50'));
    expect(inRes.status).toBe(201);
    expect(inRes.body.data.lateBy).toBe(5);
    expect(inRes.body.data.status).toBe('late');

    const outRes = await punch('out', who, ist('2026-10-12', '17:00'));
    expect(outRes.status).toBe(200);
    const [row] = await rowsOf(who);
    expect(row!.earlyLeaveBy).toBe(60);
    expect(row!.lateBy).toBe(5);
    expect(row!.totalWorkingHours).toBe(7.17);
    expect(row!.status).toBe('late');
    expect(row!.overtimeHours).toBe(0);
  });

  it('within grace is on time', async () => {
    await configure();
    const s = await shift({ startTime: '09:30', endTime: '18:00', graceMinutes: 15 });
    const who = await staff({ shift: s._id });

    const res = await punch('in', who, ist('2026-10-12', '09:44'));

    expect(res.body.data.lateBy).toBe(0);
    expect(res.body.data.status).toBe('present');
  });

  it('an employee without a shift is judged by the default shift', async () => {
    await configure();
    await shift({ startTime: '09:30', endTime: '18:30', graceMinutes: 0, isDefault: true });
    const who = await staff();

    const res = await punch('in', who, ist('2026-10-12', '09:45'));

    expect(res.body.data.lateBy).toBe(15);
    expect(res.body.data.status).toBe('late');
  });

  it('overtime counts past the shift fullDayHours', async () => {
    await configure();
    const s = await shift({ startTime: '09:30', endTime: '18:00', fullDayHours: 8 });
    const who = await staff({ shift: s._id });

    await punch('in', who, ist('2026-10-12', '09:30'));
    await punch('out', who, ist('2026-10-12', '19:30'));

    const [row] = await rowsOf(who);
    expect(row!.totalWorkingHours).toBe(10);
    expect(row!.overtimeHours).toBe(2);
    expect(row!.earlyLeaveBy).toBe(0);
    expect(row!.status).toBe('present');
  });

  it('half day (shift halfDayHours) wins over late', async () => {
    await configure();
    const s = await shift({ startTime: '09:30', endTime: '18:00', halfDayHours: 5 });
    const who = await staff({ shift: s._id });

    await punch('in', who, ist('2026-10-12', '13:00'));
    await punch('out', who, ist('2026-10-12', '17:30'));

    const [row] = await rowsOf(who);
    expect(row!.totalWorkingHours).toBe(4.5);
    expect(row!.status).toBe('half_day');
    expect(row!.lateBy).toBe(195);
    expect(row!.earlyLeaveBy).toBe(30);
  });

  it('no shift and no default shift: never late, overtime from the config threshold', async () => {
    await configure({ settings: { overtimeThresholdMinutes: 540 } });
    const who = await staff();

    const inRes = await punch('in', who, ist('2026-10-12', '11:00'));
    expect(inRes.body.data.lateBy).toBe(0);
    expect(inRes.body.data.status).toBe('present');
    await punch('out', who, ist('2026-10-12', '21:00'));

    const [row] = await rowsOf(who);
    expect(row!.overtimeHours).toBe(1);
    expect(row!.earlyLeaveBy).toBe(0);
    expect(row!.status).toBe('present');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('night shift (22:00 → 06:00)', () => {
  async function nightWorker(): Promise<Staff> {
    const s = await shift({ startTime: '22:00', endTime: '06:00', isNightShift: true, graceMinutes: 15 });
    return staff({ shift: s._id });
  }

  it('in at 22:30 IST, out at 06:10 IST the next day closes the same row', async () => {
    await configure();
    const who = await nightWorker();

    const inRes = await punch('in', who, new Date('2026-10-12T17:00:00.000Z'));
    expect(inRes.status).toBe(201);
    const outRes = await punch('out', who, new Date('2026-10-13T00:40:00.000Z'));
    expect(outRes.status).toBe(200);

    const rows = await rowsOf(who);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!._id)).toBe(String(inRes.body.data._id));
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-12').toISOString());
    expect(rows[0]!.checkOut!.time!.toISOString()).toBe('2026-10-13T00:40:00.000Z');
    expect(rows[0]!.totalWorkingHours).toBeCloseTo(7.67, 2);
    expect(rows[0]!.earlyLeaveBy).toBe(0);
    expect(rows[0]!.lateBy).toBe(15);
  });

  it('after midnight, /today and breaks act on the open row from the evening before', async () => {
    await configure();
    const who = await nightWorker();
    const inRes = await punch('in', who, ist('2026-10-12', '22:30'));

    vi.setSystemTime(ist('2026-10-13', '02:00'));
    const today = await request(app).get('/api/v1/attendance/today').set(who.auth());
    expect(today.status).toBe(200);
    expect(today.body.data._id).toBe(inRes.body.data._id);
    expect(today.body.data.totalWorkingHours).toBe(3.5);

    const start = await request(app).post('/api/v1/attendance/breaks/start').set(who.auth()).send({ type: 'lunch' });
    expect(start.status).toBe(201);
    vi.setSystemTime(ist('2026-10-13', '02:30'));
    const end = await request(app).post('/api/v1/attendance/breaks/end').set(who.auth()).send({});
    expect(end.status).toBe(200);

    await punch('out', who, ist('2026-10-13', '06:10'));
    const [row] = await rowsOf(who);
    expect(row!.breaks).toHaveLength(1);
    expect(row!.totalWorkingHours).toBe(7.17);
  });

  it('a check-in after midnight belongs to the shift that began the evening before', async () => {
    await configure();
    const who = await nightWorker();
    // Day-close already wrote the 12th off as absent at 23:59.
    await Attendance.create({ employeeId: who.emp._id, date: label('2026-10-12'), status: 'absent', source: 'auto_absent' });

    const inRes = await punch('in', who, ist('2026-10-13', '00:30'));
    expect(inRes.status).toBe(201);
    const outRes = await punch('out', who, ist('2026-10-13', '06:10'));
    expect(outRes.status).toBe(200);

    const rows = await rowsOf(who);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-12').toISOString());
    expect(rows[0]!.source).toBe('punch');
    expect(rows[0]!.lateBy).toBe(135);
    expect(rows[0]!.earlyLeaveBy).toBe(0);
    expect(rows[0]!.status).toBe('late');
  });

  it('the next night is a new row', async () => {
    await configure();
    const who = await nightWorker();

    await punch('in', who, ist('2026-10-12', '22:00'));
    await punch('out', who, ist('2026-10-13', '06:00'));
    const again = await punch('in', who, ist('2026-10-13', '22:00'));

    expect(again.status).toBe(201);
    const rows = await rowsOf(who);
    expect(rows.map((r) => r.date.toISOString())).toEqual([
      label('2026-10-12').toISOString(),
      label('2026-10-13').toISOString(),
    ]);
  });

  it('a night row left open stops being current at shift end + grace: the next evening is a fresh day', async () => {
    await configure();
    const who = await nightWorker();
    const stale = await punch('in', who, ist('2026-10-12', '22:00'));
    const staleId = stale.body.data._id as string;

    // Still the running shift at 06:00 + 15 min grace.
    vi.setSystemTime(ist('2026-10-13', '06:15'));
    const atGrace = await request(app).get('/api/v1/attendance/today').set(who.auth());
    expect(atGrace.body.data._id).toBe(staleId);

    // 21:55 the next evening: a forgotten check-out, not a 23.92 h day in progress.
    vi.setSystemTime(ist('2026-10-13', '21:55'));
    const today = await request(app).get('/api/v1/attendance/today').set(who.auth());
    expect(today.status).toBe(200);
    expect(today.body.data).toBeNull();

    const out = await punch('out', who, ist('2026-10-13', '21:55'));
    expect(out.status).toBe(400);
    expect(out.body.error.message).toBe('You must check in first');
    expect((await Attendance.findById(staleId).lean())!.checkOut?.time).toBeFalsy();

    const fresh = await punch('in', who, ist('2026-10-13', '21:55'));
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.date).toBe(label('2026-10-13').toISOString());

    const closed = await punch('out', who, ist('2026-10-14', '06:00'));
    expect(closed.status).toBe(200);
    expect(closed.body.data._id).toBe(fresh.body.data._id);
    expect((await Attendance.findById(staleId).lean())!.checkOut?.time).toBeFalsy();
  });

  it('/my, /monthly and /records report live hours for the running night row, not for a stale one', async () => {
    await configure();
    const who = await nightWorker();
    const inRes = await punch('in', who, ist('2026-10-12', '22:30'));
    const id = inRes.body.data._id as string;
    const hoursIn = (body: { data: { _id: string; totalWorkingHours: number }[] }) =>
      body.data.find((r) => r._id === id)!.totalWorkingHours;

    vi.setSystemTime(ist('2026-10-13', '02:00'));
    const my = await request(app).get('/api/v1/attendance/my').set(who.auth());
    expect(hoursIn(my.body)).toBe(3.5);
    const monthly = await request(app).get('/api/v1/attendance/monthly?year=2026&month=10').set(who.auth());
    expect(hoursIn(monthly.body)).toBe(3.5);
    const { token: adminToken } = await createUser({ roleSlug: 'admin' });
    const records = await request(app)
      .get('/api/v1/attendance/records')
      .set({ Authorization: `Bearer ${adminToken}` });
    expect(hoursIn(records.body)).toBe(3.5);

    vi.setSystemTime(ist('2026-10-13', '21:55'));
    const later = await request(app).get('/api/v1/attendance/my').set(who.auth());
    expect(hoursIn(later.body)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('check-out lookup', () => {
  it('an open check-in older than 36 h is not closed: "You must check in first"', async () => {
    await configure();
    const who = await staff();
    await Attendance.create({
      employeeId: who.emp._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      status: 'present',
    });

    const res = await punch('out', who, ist('2026-10-13', '22:00'));

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('You must check in first');
  });

  it("a second check-out today is refused even if an older row is still open", async () => {
    await configure();
    const who = await staff();
    const stale = await Attendance.create({
      employeeId: who.emp._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      status: 'present',
    });

    await punch('in', who, ist('2026-10-13', '09:30'));
    expect((await punch('out', who, ist('2026-10-13', '18:00'))).status).toBe(200);
    const again = await punch('out', who, ist('2026-10-13', '18:05'));

    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/^Already checked out today at/);
    expect((await Attendance.findById(stale._id).lean())!.checkOut?.time).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('check-out method handling', () => {
  it('is not re-validated against the enabled methods (mobile always sends manual)', async () => {
    await configure({ enabledMethods: ['ip'] });
    await AllowedIP.create({ label: 'Office', ipAddress: '10.0.0.5' });
    const who = await staff();

    const inRes = await punch('in', who, ist('2026-10-12', '09:30'), { method: 'ip' }, { 'X-Forwarded-For': '10.0.0.5' });
    expect(inRes.status).toBe(201);

    const outRes = await request(app)
      .post('/api/v1/attendance/check-out')
      .set(who.auth())
      .send({});
    expect(outRes.status).toBe(200);
    expect(outRes.body.data.checkOut.method).toBe('manual');
  });

  it("a check-out sent as 'face' (the web default when face is listed first) succeeds, recorded as manual", async () => {
    await configure({ enabledMethods: ['face', 'manual'] });
    const who = await staff();

    await punch('in', who, ist('2026-10-12', '09:30'));
    const res = await punch('out', who, ist('2026-10-12', '18:30'), { method: 'face' });

    expect(res.status).toBe(200);
    expect(res.body.data.checkOut.method).toBe('manual');
  });

  it('still enforces the location rule', async () => {
    await configure({ settings: { requireLocation: true } });
    const who = await staff();
    const location = { lat: 19.07, lng: 72.87 };

    await punch('in', who, ist('2026-10-12', '09:30'), { method: 'manual', location });
    const res = await punch('out', who, ist('2026-10-12', '18:30'));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('LOCATION_REQUIRED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('expense before check-out', () => {
  async function dayWithGate(gate: 'all' | 'field' | 'none', fields: Record<string, unknown> = {}) {
    await configure({ settings: { expenseBeforeCheckout: gate } });
    const who = await staff(fields);
    await punch('in', who, ist('2026-10-12', '09:30'));
    return punch('out', who, ist('2026-10-12', '18:30'));
  }

  it("'field' with an office employee: check-out succeeds without an expense", async () => {
    const res = await dayWithGate('field');
    expect(res.status).toBe(200);
  });

  it("'field' with a field employee: EXPENSE_REQUIRED_FOR_CHECKOUT", async () => {
    const res = await dayWithGate('field', { isFieldStaff: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPENSE_REQUIRED_FOR_CHECKOUT');
  });

  it("'all': EXPENSE_REQUIRED_FOR_CHECKOUT", async () => {
    const res = await dayWithGate('all');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EXPENSE_REQUIRED_FOR_CHECKOUT');
    expect(res.body.error.message).toBe("Submit today's expense entry before checking out.");
  });

  it("'none': check-out succeeds", async () => {
    const res = await dayWithGate('none');
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('HR correction uses the same shift rules', () => {
  it('re-judges the day from scratch with the employee shift', async () => {
    await configure();
    const s = await shift({ startTime: '09:30', endTime: '18:00', fullDayHours: 8 });
    const who = await staff({ shift: s._id });
    const row = await Attendance.create({
      employeeId: who.emp._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      checkOut: { time: ist('2026-10-12', '12:00'), method: 'manual' },
      totalWorkingHours: 2.5,
      earlyLeaveBy: 360,
      status: 'half_day',
    });
    const { token: adminToken } = await createUser({ roleSlug: 'admin' });

    const res = await request(app)
      .patch(`/api/v1/attendance/records/${String(row._id)}`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({ checkOut: ist('2026-10-12', '18:30').toISOString(), reason: 'Forgot to punch out' });

    expect(res.status).toBe(200);
    const after = await Attendance.findById(row._id).lean().exec();
    expect(after!.totalWorkingHours).toBe(9);
    expect(after!.status).toBe('present');
    expect(after!.earlyLeaveBy).toBe(0);
    expect(after!.overtimeHours).toBe(1);
  });
});
