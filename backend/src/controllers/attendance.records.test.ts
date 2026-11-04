/**
 * The HR records list (`GET /attendance/records`): leave days hidden on
 * request, how early an on-time check-in was, and which place a punch is
 * described against — the office, or the employee's own field site.
 *
 * Reference day: Mon 12 Oct 2026; the clock is faked (Date only).
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Shift } from '../models/shift.model.js';
import { GeofenceZone } from '../models/geofence-zone.model.js';
import { FieldSite } from '../models/field-site.model.js';

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** An instant given as IST wall-clock time on an IST calendar day. */
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

const HQ = { lat: 23.0921, lng: 72.5293 };
const FAR_SITE = { lat: 22.72, lng: 71.63 }; // ~100 km from HQ

let app: Express;
let adminAuth: () => { Authorization: string };

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist('2026-10-12', '20:00'));
  app = createApp();
  await AttendanceConfig.updateOne({}, { $set: { enabledMethods: ['manual'] } }, { upsert: true });
  const { token } = await createUser({ roleSlug: 'admin' });
  adminAuth = () => ({ Authorization: `Bearer ${token}` });
});

afterEach(() => {
  vi.useRealTimers();
});

async function employee(fields: Record<string, unknown> = {}): Promise<IEmployee> {
  const { user } = await createUser({ roleSlug: 'employee' });
  const emp = await createEmployeeFor(user);
  if (Object.keys(fields).length > 0) await Employee.updateOne({ _id: emp._id }, { $set: fields });
  return emp;
}

/** A finished day checked in at `inAt` (IST, `HH:mm`) at `where`. */
async function dayAt(emp: IEmployee, inAt: string, where: { lat: number; lng: number }, lateBy = 0) {
  return Attendance.create({
    employeeId: emp._id,
    date: label('2026-10-12'),
    checkIn: { time: ist('2026-10-12', inAt), method: 'manual', location: where },
    checkOut: { time: ist('2026-10-12', '18:30'), method: 'manual', location: where },
    status: lateBy > 0 ? 'late' : 'present',
    lateBy,
    totalWorkingHours: 8,
  });
}

async function records(query = '') {
  const res = await request(app).get(`/api/v1/attendance/records${query}`).set(adminAuth());
  expect(res.status).toBe(200);
  return res.body.data as Array<{
    _id: string;
    status: string;
    lateBy: number;
    earlyBy: number;
    checkInArea: { name: string; distance: number; inside: boolean } | null;
  }>;
}

const rowOf = (rows: Awaited<ReturnType<typeof records>>, id: unknown) =>
  rows.find((r) => r._id === String(id))!;

describe('GET /attendance/records', () => {
  it('hideLeave=true leaves out leave days; without it they are listed', async () => {
    const emp = await employee();
    await Attendance.create({ employeeId: emp._id, date: label('2026-10-13'), status: 'on_leave', source: 'leave' });
    const worked = await dayAt(emp, '10:05', HQ);

    const hidden = await records('?hideLeave=true');
    expect(hidden.map((r) => r.status)).toEqual(['present']);
    expect(hidden[0]!._id).toBe(String(worked._id));

    const all = await records();
    expect(all.map((r) => r.status).sort()).toEqual(['on_leave', 'present']);
  });

  it('earlyBy counts minutes before shift start + grace; 0 when late', async () => {
    const shift = await Shift.create({
      name: `Shift ${new Types.ObjectId().toHexString()}`,
      startTime: '10:00',
      endTime: '18:30',
      graceMinutes: 15,
    });
    const early = await employee({ shift: shift._id });
    const late = await employee({ shift: shift._id });
    const earlyRow = await dayAt(early, '10:10', HQ);
    const lateRow = await dayAt(late, '10:20', HQ, 5);

    const rows = await records();
    expect(rowOf(rows, earlyRow._id).earlyBy).toBe(5);
    expect(rowOf(rows, lateRow._id).lateBy).toBe(5);
    expect(rowOf(rows, lateRow._id).earlyBy).toBe(0);
  });

  it("describes a punch against the employee's own field site, not an office 100 km away", async () => {
    await GeofenceZone.create({ name: 'SG Business Hub', type: 'circle', center: HQ, radius: 100 });
    const fieldWorker = await employee();
    const officeWorker = await employee();
    const noSite = await employee();
    await FieldSite.create({
      name: 'Cc Road Tpi',
      type: 'project',
      location: { type: 'Point', coordinates: [FAR_SITE.lng, FAR_SITE.lat] },
      radiusM: 100,
      assignedTo: [fieldWorker._id],
    });

    const atSite = await dayAt(fieldWorker, '10:00', { lat: FAR_SITE.lat + 0.001, lng: FAR_SITE.lng });
    const atOffice = await dayAt(officeWorker, '10:00', { lat: HQ.lat + 0.0003, lng: HQ.lng });
    // Someone else's site is not "their" site: still measured from the office.
    const elsewhere = await dayAt(noSite, '10:00', { lat: FAR_SITE.lat, lng: FAR_SITE.lng });

    const rows = await records();
    const site = rowOf(rows, atSite._id).checkInArea!;
    expect(site.name).toBe('Cc Road Tpi');
    expect(site.distance).toBeLessThan(200);
    expect(rowOf(rows, atOffice._id).checkInArea).toMatchObject({ name: 'SG Business Hub', inside: true });
    const office = rowOf(rows, elsewhere._id).checkInArea!;
    expect(office.name).toBe('SG Business Hub');
    expect(office.distance).toBeGreaterThan(50_000);
  });

  it('a field worker punching inside the office is described as the office', async () => {
    await GeofenceZone.create({ name: 'SG Business Hub', type: 'circle', center: HQ, radius: 100 });
    const fieldWorker = await employee();
    await FieldSite.create({
      name: 'Cc Road Tpi',
      type: 'project',
      location: { type: 'Point', coordinates: [FAR_SITE.lng, FAR_SITE.lat] },
      radiusM: 100,
      assignedTo: [fieldWorker._id],
    });
    const row = await dayAt(fieldWorker, '10:00', HQ);

    expect(rowOf(await records(), row._id).checkInArea).toMatchObject({ name: 'SG Business Hub', inside: true });
  });
});
