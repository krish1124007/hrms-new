/**
 * Field reports: a day's timeline per employee, a summary grouped by
 * employee / site / purpose, the exceptions list (one row per flag and per
 * missed plan) and the site-wise report — JSON by default, an Excel workbook
 * (`format=xlsx`, header row first) or a PDF (`format=pdf`) on request.
 * Scope: field.view → self + direct reports; field.manage → everybody.
 */
import request from 'supertest';
import type { Express } from 'express';
import * as XLSX from 'xlsx';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { estimatedLegMeters } from '../services/google-maps.service.js';
import type { IFieldSite } from '../models/field-site.model.js';
import type { IVisit } from '../models/visit.model.js';
import {
  PLACES,
  actor,
  auth,
  binaryParser,
  dayIn,
  dayOut,
  ist,
  makeSite,
  visitAt,
  type Actor,
} from '../test/field-day-fixtures.js';

const DAY = '2026-10-15';
const RANGE = { from: '2026-10-13', to: '2026-10-15' };
const km = (metres: number): number => Math.round(metres / 10) / 100;

let app: Express;
let boss: Actor;
let asha: Actor;
let bala: Actor;
let zed: Actor;
let hr: Actor;
let siteA: IFieldSite;
let siteB: IFieldSite;
let ashaA: IVisit;
let ashaB: IVisit;
let balaA: IVisit;
let balaMissed: IVisit;

beforeEach(async () => {
  app = createApp();
  boss = await actor('field_manager', { firstName: 'Boss' });
  asha = await actor('field_employee', { firstName: 'Asha', reportingManager: boss.employee._id });
  bala = await actor('field_employee', { firstName: 'Bala', reportingManager: boss.employee._id });
  zed = await actor('field_employee', { firstName: 'Zed' });
  hr = await actor('hr_executive', { firstName: 'Hema' });
  siteA = await makeSite('Site A', PLACES.siteA);
  siteB = await makeSite('Site B', PLACES.siteB, { type: 'Branch' });

  await dayIn(asha, DAY, '09:00', PLACES.home);
  ashaA = await visitAt(asha, siteA, DAY, {
    in: '10:00',
    out: '11:00',
    purpose: 'service',
    report: {
      notes: 'Checked the pump',
      outcome: 'follow_up',
      nextAction: 'Replace the valve',
      followUpDate: new Date('2026-10-20T00:00:00Z'),
      photos: ['/uploads/field-photos/p1.jpg'],
      documents: [{ key: '/uploads/field-documents/d1.pdf', name: 'Survey.pdf' }],
      peopleMet: [{ name: 'Ravi', designation: 'Plant head' }],
      submittedAt: ist(DAY, '11:05'),
    },
  });
  ashaB = await visitAt(asha, siteB, DAY, { in: '12:00', out: '12:03', flags: { shortVisit: true } });
  await dayOut(asha, DAY, '18:00', PLACES.home);

  balaA = await visitAt(bala, siteA, DAY, {
    in: '10:30',
    out: '11:30',
    inAt: { lat: PLACES.siteA.lat + 0.004, lng: PLACES.siteA.lng },
    checkInDistanceM: 445,
    flags: { awayFromSite: true },
  });
  balaMissed = await visitAt(bala, siteB, '2026-10-14', { status: 'missed', plannedDate: '2026-10-14' });

  await visitAt(zed, siteB, DAY, { in: '15:00', out: '15:40' });
});

const report = (who: Actor, kind: string, query: Record<string, string>) =>
  request(app).get(`/api/v1/field/reports/${kind}`).query(query).set(auth(who.token));

const download = (who: Actor, kind: string, query: Record<string, string>) =>
  report(who, kind, query).buffer(true).parse(binaryParser);

function sheetRows(body: Buffer, sheet = 0): unknown[][] {
  const wb = XLSX.read(body, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[sheet]!]!, { header: 1 }) as unknown[][];
}

const NO_FLAGS = {
  awayFromSite: false,
  noGps: false,
  noSelfie: false,
  shortVisit: false,
  autoClosed: false,
  syncedLate: false,
  capturedOffline: false,
};

describe('GET /field/reports/daily', () => {
  it('the employee’s timeline: visits with their work report, the day’s points, legs and km', async () => {
    const res = await report(boss, 'daily', { employeeId: String(asha.employee._id), date: DAY });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Object.keys(data).sort()).toEqual(['date', 'employee', 'estimated', 'legs', 'points', 'totalKm', 'visits']);
    expect(data.date).toBe(DAY);
    expect(data.employee).toEqual({
      _id: String(asha.employee._id),
      firstName: 'Asha',
      lastName: 'Test',
      employeeId: asha.employee.employeeId,
    });
    expect(data.visits).toHaveLength(2);
    const [first, second] = data.visits;
    expect(first).toMatchObject({
      _id: String(ashaA._id),
      site: { _id: String(siteA._id), name: 'Site A', type: 'Client office' },
      purpose: 'service',
      status: 'completed',
      checkIn: { at: ist(DAY, '10:00').toISOString() },
      checkOut: { at: ist(DAY, '11:00').toISOString() },
      durationMinutes: 60,
      flags: NO_FLAGS,
      report: {
        notes: 'Checked the pump',
        outcome: 'follow_up',
        nextAction: 'Replace the valve',
        followUpDate: '2026-10-20T00:00:00.000Z',
        peopleMet: [{ name: 'Ravi', designation: 'Plant head' }],
        submittedAt: ist(DAY, '11:05').toISOString(),
      },
    });
    expect(first.report.photos).toHaveLength(1);
    expect(first.report.photos[0]).toContain('/api/v1/files/field-photos/p1.jpg?exp=');
    expect(first.report.documents).toEqual([
      { url: expect.stringContaining('/api/v1/files/field-documents/d1.pdf?exp='), name: 'Survey.pdf' },
    ]);
    expect(second).toMatchObject({ _id: String(ashaB._id), flags: { ...NO_FLAGS, shortVisit: true }, report: null });

    expect(data.points.map((p: { kind: string }) => p.kind)).toEqual([
      'day_in',
      'visit_in',
      'visit_out',
      'visit_in',
      'visit_out',
      'day_out',
    ]);
    const expectedM =
      estimatedLegMeters(PLACES.home, PLACES.siteA) +
      estimatedLegMeters(PLACES.siteA, PLACES.siteB) +
      estimatedLegMeters(PLACES.siteB, PLACES.home);
    expect(data.totalKm).toBe(km(expectedM));
    expect(data.estimated).toBe(true);
    expect(data.legs).toHaveLength(3);
  });

  it('defaults to the caller; another team’s employee is 403', async () => {
    const own = await report(asha, 'daily', { date: DAY });
    expect(own.status).toBe(200);
    expect(own.body.data.employee._id).toBe(String(asha.employee._id));
    expect((await report(boss, 'daily', { employeeId: String(zed.employee._id), date: DAY })).status).toBe(403);
    expect((await report(hr, 'daily', { employeeId: String(zed.employee._id), date: DAY })).status).toBe(200);
  });

  it('format=xlsx is a workbook with the header row first; format=pdf is a PDF', async () => {
    const q = { employeeId: String(asha.employee._id), date: DAY };
    const xlsx = await download(boss, 'daily', { ...q, format: 'xlsx' });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(xlsx.headers['content-disposition']).toMatch(/^attachment; filename="field-daily_.+_2026-10-15\.xlsx"$/);
    const rows = sheetRows(xlsx.body as Buffer);
    expect(rows[0]).toEqual([
      '#',
      'Site',
      'Purpose',
      'Status',
      'Check-in',
      'Check-out',
      'Minutes on site',
      'Flags',
      'Outcome',
      'Notes',
      'People met',
      'Next action',
    ]);
    expect(rows[1]).toEqual(expect.arrayContaining([1, 'Site A', 'service', 'completed', 60, 'Checked the pump', 'Ravi (Plant head)']));
    expect(rows[2]).toEqual(expect.arrayContaining([2, 'Site B', 'Short visit']));
    const route = sheetRows(xlsx.body as Buffer, 1);
    expect(route[0]).toEqual(['From', 'To', 'Km', 'Estimated']);

    const pdf = await download(boss, 'daily', { ...q, format: 'pdf' });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('GET /field/reports/summary', () => {
  it('groupBy=employee: visits, completed, missed, minutes on site and km per person in scope', async () => {
    const res = await report(boss, 'summary', { ...RANGE, groupBy: 'employee' });
    expect(res.status).toBe(200);
    const ashaKm = km(
      estimatedLegMeters(PLACES.home, PLACES.siteA) +
        estimatedLegMeters(PLACES.siteA, PLACES.siteB) +
        estimatedLegMeters(PLACES.siteB, PLACES.home),
    );
    expect(res.body.data).toEqual([
      { key: String(asha.employee._id), label: 'Asha Test', visits: 2, completed: 2, missed: 0, minutesOnSite: 63, km: ashaKm },
      { key: String(bala.employee._id), label: 'Bala Test', visits: 1, completed: 1, missed: 1, minutesOnSite: 60, km: 0 },
    ]);
  });

  it('groupBy=site and groupBy=purpose; km is the travel to reach the site', async () => {
    const bySite = await report(boss, 'summary', { ...RANGE, groupBy: 'site' });
    expect(bySite.body.data).toEqual([
      {
        key: String(siteA._id),
        label: 'Site A',
        visits: 2,
        completed: 2,
        missed: 0,
        minutesOnSite: 120,
        km: km(estimatedLegMeters(PLACES.home, PLACES.siteA)),
      },
      {
        key: String(siteB._id),
        label: 'Site B',
        visits: 1,
        completed: 1,
        missed: 1,
        minutesOnSite: 3,
        km: km(estimatedLegMeters(PLACES.siteA, PLACES.siteB)),
      },
    ]);

    const byPurpose = await report(hr, 'summary', { ...RANGE, groupBy: 'purpose' });
    expect(byPurpose.body.data.map((r: { key: string; visits: number; missed: number }) => [r.key, r.visits, r.missed])).toEqual([
      ['other', 3, 1],
      ['service', 1, 0],
    ]);
  });

  it('exports with the group as the first column', async () => {
    const xlsx = await download(boss, 'summary', { ...RANGE, groupBy: 'site', format: 'xlsx' });
    expect(sheetRows(xlsx.body as Buffer)[0]).toEqual(['Site', 'Visits', 'Completed', 'Missed', 'Minutes on site', 'Km']);
    const pdf = await download(boss, 'summary', { ...RANGE, groupBy: 'employee', format: 'pdf' });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('400 for an inverted or too long range', async () => {
    expect((await report(boss, 'summary', { from: '2026-10-15', to: '2026-10-01', groupBy: 'employee' })).status).toBe(400);
    const long = await report(boss, 'summary', { from: '2026-01-01', to: '2026-10-15', groupBy: 'employee' });
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe('RANGE_TOO_LONG');
    expect((await report(boss, 'summary', { ...RANGE, groupBy: 'colour' })).status).toBe(400);
  });
});

describe('GET /field/reports/exceptions', () => {
  it('one row per flag and per missed plan, every type included', async () => {
    await visitAt(zed, siteA, DAY, { in: '09:00', out: '09:40', inAt: null, flags: { noGps: true, noSelfie: true } });
    await visitAt(zed, siteA, '2026-10-13', { in: '17:00', out: '23:30', flags: { autoClosed: true } });
    await visitAt(zed, siteB, '2026-10-14', { in: '11:00', out: '11:30', flags: { syncedLate: true, capturedOffline: true } });

    const res = await report(hr, 'exceptions', RANGE);
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ visitId: string; type: string; date: string; detail: string; employee: { firstName: string }; site: { name: string } }>;
    expect(new Set(rows.map((r) => r.type))).toEqual(
      new Set(['away_from_site', 'no_gps', 'no_selfie', 'short_visit', 'auto_closed', 'missed_plan', 'synced_late']),
    );
    expect(rows.some((r) => r.type === 'captured_offline')).toBe(false);

    const away = rows.find((r) => r.type === 'away_from_site')!;
    expect(away).toMatchObject({
      visitId: String(balaA._id),
      date: DAY,
      employee: { _id: String(bala.employee._id), firstName: 'Bala', lastName: 'Test', employeeId: bala.employee.employeeId },
      site: { _id: String(siteA._id), name: 'Site A', type: 'Client office' },
    });
    expect(away.detail).toContain('445 m');
    const missed = rows.find((r) => r.type === 'missed_plan')!;
    expect(missed).toMatchObject({ visitId: String(balaMissed._id), date: '2026-10-14', site: { name: 'Site B' } });
    expect(rows.find((r) => r.type === 'short_visit')!.detail).toContain('3 min');

    // Oldest first.
    const dates = rows.map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('a field manager sees only their team’s exceptions; exports work', async () => {
    await visitAt(zed, siteA, DAY, { in: '09:00', out: '09:40', flags: { noGps: true } });
    const res = await report(boss, 'exceptions', RANGE);
    expect(res.body.data.map((r: { type: string }) => r.type).sort()).toEqual(['away_from_site', 'missed_plan', 'short_visit']);

    const xlsx = await download(boss, 'exceptions', { ...RANGE, format: 'xlsx' });
    expect(sheetRows(xlsx.body as Buffer)[0]).toEqual(['Date', 'Employee', 'Employee ID', 'Site', 'Exception', 'Detail']);
    const pdf = await download(boss, 'exceptions', { ...RANGE, format: 'pdf' });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});

describe('GET /field/reports/sites', () => {
  it('per site: visits, last visit, who visited (names) and how many people', async () => {
    const res = await report(boss, 'sites', RANGE);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      {
        site: { _id: String(siteA._id), name: 'Site A', type: 'Client office' },
        visits: 2,
        lastVisitAt: ist(DAY, '10:30').toISOString(),
        employees: [
          { _id: String(asha.employee._id), firstName: 'Asha', lastName: 'Test', employeeId: asha.employee.employeeId },
          { _id: String(bala.employee._id), firstName: 'Bala', lastName: 'Test', employeeId: bala.employee.employeeId },
        ],
        employeeCount: 2,
      },
      {
        site: { _id: String(siteB._id), name: 'Site B', type: 'Branch' },
        visits: 1,
        lastVisitAt: ist(DAY, '12:00').toISOString(),
        employees: [{ _id: String(asha.employee._id), firstName: 'Asha', lastName: 'Test', employeeId: asha.employee.employeeId }],
        employeeCount: 1,
      },
    ]);

    const all = await report(hr, 'sites', RANGE);
    const b = all.body.data.find((r: { site: { name: string } }) => r.site.name === 'Site B');
    expect(b).toMatchObject({ visits: 2, employeeCount: 2, lastVisitAt: ist(DAY, '15:00').toISOString() });
  });

  it('exports', async () => {
    const xlsx = await download(boss, 'sites', { ...RANGE, format: 'xlsx' });
    const rows = sheetRows(xlsx.body as Buffer);
    expect(rows[0]).toEqual(['Site', 'Type', 'Visits', 'Last visit', 'Visited by', 'People']);
    expect(rows[1]).toEqual(expect.arrayContaining(['Site A', 'Client office', 2, 'Asha Test, Bala Test', 2]));
    const pdf = await download(boss, 'sites', { ...RANGE, format: 'pdf' });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
