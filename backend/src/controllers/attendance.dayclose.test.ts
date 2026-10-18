/**
 * Admin day-close endpoints: POST /attendance/close-day and /close-days run
 * the nightly day-close for a past day (or a range of them), gated on
 * `attendance.manage` and audited.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { AuditLog } from '../models/audit-log.model.js';
import { Employee } from '../models/employee.model.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { logger } from '../config/logger.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const DAY_MS = 86_400_000;
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

let app: Express;
let adminToken: string;

beforeEach(async () => {
  app = createApp();
  ({ token: adminToken } = await createUser({ roleSlug: 'admin' }));
});

async function worker() {
  return Employee.create({
    firstName: 'Back',
    lastName: 'Fill',
    email: `backfill.${Date.now()}.${Math.random().toString(36).slice(2)}@test.local`,
    joiningDate: new Date('2024-01-15'),
  });
}

describe('POST /api/v1/attendance/close-day', () => {
  it('closes the given day, returns the counts and writes an audit row', async () => {
    const emp = await worker();

    const res = await request(app)
      .post('/api/v1/attendance/close-day')
      .set(auth(adminToken))
      .send({ date: '2026-10-12' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      date: '2026-10-12',
      absentCreated: 1,
      leaveStamped: 0,
      autoCheckedOut: 0,
      skipped: 0,
    });
    const row = await Attendance.findOne({ employeeId: emp._id }).lean().exec();
    expect(row!.status).toBe('absent');
    expect(row!.source).toBe('auto_absent');
    expect(row!.date.toISOString()).toBe(label('2026-10-12').toISOString());

    await vi.waitFor(async () =>
      expect(await AuditLog.countDocuments({ entity: 'Attendance' })).toBe(1),
    );
    const log = await AuditLog.findOne({ entity: 'Attendance' }).lean().exec();
    expect(log!.action).toBe('update');
    expect(log!.metadata).toMatchObject({
      event: 'day-close',
      date: '2026-10-12',
      counts: { absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
    });
  });

  it('is idempotent across two calls', async () => {
    await worker();
    await request(app).post('/api/v1/attendance/close-day').set(auth(adminToken)).send({ date: '2026-10-12' });

    const again = await request(app)
      .post('/api/v1/attendance/close-day')
      .set(auth(adminToken))
      .send({ date: '2026-10-12' });

    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 });
    expect(await Attendance.countDocuments()).toBe(1);
  });

  it('403 for an employee, and nothing is written', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await createEmployeeFor(user);

    const res = await request(app)
      .post('/api/v1/attendance/close-day')
      .set(auth(token))
      .send({ date: '2026-10-12' });

    expect(res.status).toBe(403);
    expect(await Attendance.countDocuments()).toBe(0);
  });

  it('400 without a valid date', async () => {
    const missing = await request(app).post('/api/v1/attendance/close-day').set(auth(adminToken)).send({});
    expect(missing.status).toBe(400);
    const junk = await request(app)
      .post('/api/v1/attendance/close-day')
      .set(auth(adminToken))
      .send({ date: 'not-a-date' });
    expect(junk.status).toBe(400);
  });

  it('400 for today or a future day, which have not finished yet', async () => {
    await worker();
    const today = startOfBusinessDay(new Date());

    for (const day of [today, new Date(today.getTime() + DAY_MS)]) {
      const res = await request(app)
        .post('/api/v1/attendance/close-day')
        .set(auth(adminToken))
        .send({ date: isoDay(day) });
      expect(res.status).toBe(400);
    }
    expect(await Attendance.countDocuments()).toBe(0);
  });
});

describe('POST /api/v1/attendance/close-days', () => {
  it('runs each day in the range in order and returns per-day counts', async () => {
    const emp = await worker();

    // Sat 10 (2nd Saturday, working) · Sun 11 (week-off) · Mon 12 · Tue 13
    const res = await request(app)
      .post('/api/v1/attendance/close-days')
      .set(auth(adminToken))
      .send({ from: '2026-10-10', to: '2026-10-13' });

    expect(res.status).toBe(200);
    expect(res.body.data.days).toEqual([
      { date: '2026-10-10', absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
      { date: '2026-10-11', absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 1, exitsApplied: 0 },
      { date: '2026-10-12', absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
      { date: '2026-10-13', absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
    ]);
    expect(res.body.data.totals).toEqual({ absentCreated: 3, leaveStamped: 0, autoCheckedOut: 0, skipped: 1, exitsApplied: 0 });

    const rows = await Attendance.find({ employeeId: emp._id }).sort({ date: 1 }).lean().exec();
    expect(rows.map((r) => isoDay(r.date))).toEqual(['2026-10-10', '2026-10-12', '2026-10-13']);

    // One audit row per day closed, each with that day's counts.
    await vi.waitFor(async () =>
      expect(await AuditLog.countDocuments({ entity: 'Attendance' })).toBe(4),
    );
    const logs = await AuditLog.find({ entity: 'Attendance' }).lean().exec();
    const byDate = new Map(logs.map((l) => [l.metadata!.date as string, l]));
    expect([...byDate.keys()].sort()).toEqual(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
    for (const l of logs) {
      expect(l.action).toBe('update');
      expect(l.metadata).toMatchObject({ event: 'day-close', from: '2026-10-10', to: '2026-10-13' });
    }
    expect(byDate.get('2026-10-11')!.metadata).toMatchObject({
      counts: { absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 1, exitsApplied: 0 },
    });
    expect(byDate.get('2026-10-12')!.metadata).toMatchObject({
      counts: { absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
    });
  });

  it('a failing day stops the run but every day reached is audited, the failing one with partial counts', async () => {
    const emp = await worker();
    const other = await worker();
    // An open row on Mon 12 that cannot be saved (schema-invalid check-in
    // method — a path auto-checkout does not rewrite, unlike the status).
    const bad = await Attendance.create({
      employeeId: other._id,
      date: label('2026-10-12'),
      checkIn: { time: new Date('2026-10-12T04:00:00.000Z'), method: 'manual' },
      status: 'present',
    });
    await Attendance.collection.updateOne({ _id: bad._id }, { $set: { 'checkIn.method': 'bogus' } });
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    const res = await request(app)
      .post('/api/v1/attendance/close-days')
      .set(auth(adminToken))
      .send({ from: '2026-10-10', to: '2026-10-13' });
    logged.mockRestore();

    expect(res.status).toBe(500);
    // Sat 10, Sun 11 and Mon 12 were reached; Tue 13 was not.
    await vi.waitFor(async () =>
      expect(await AuditLog.countDocuments({ entity: 'Attendance' })).toBe(3),
    );
    const failed = await AuditLog.findOne({ entity: 'Attendance', 'metadata.date': '2026-10-12' }).lean().exec();
    expect(failed!.metadata).toMatchObject({
      event: 'day-close',
      counts: { absentCreated: 1, autoCheckedOut: 0 },
      failures: [{ step: 'auto-checkout', attendanceId: String(bad._id) }],
    });
    const days = (await Attendance.find({ employeeId: emp._id }).lean().exec()).map((r) => isoDay(r.date));
    expect(days.sort()).toEqual(['2026-10-10', '2026-10-12']);
  });

  it('accepts a 62-day range (to − from = 61 days)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/close-days')
      .set(auth(adminToken))
      .send({ from: '2026-01-01', to: '2026-03-03' });

    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(62);
  });

  it('400 when the range is longer than 62 days, reversed, or reaches today', async () => {
    await worker();
    const today = startOfBusinessDay(new Date());
    const bodies = [
      { from: '2026-01-01', to: '2026-03-04' },
      { from: '2026-10-13', to: '2026-10-12' },
      { from: isoDay(new Date(today.getTime() - DAY_MS)), to: isoDay(today) },
    ];
    for (const body of bodies) {
      const res = await request(app).post('/api/v1/attendance/close-days').set(auth(adminToken)).send(body);
      expect(res.status).toBe(400);
    }
    expect(await Attendance.countDocuments()).toBe(0);
  });

  it('403 for an employee', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .post('/api/v1/attendance/close-days')
      .set(auth(token))
      .send({ from: '2026-10-10', to: '2026-10-13' });
    expect(res.status).toBe(403);
  });
});
