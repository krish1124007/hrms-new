/**
 * Team status and day routes. A day's points are the attendance check-in,
 * each visit's check-in and check-out and the attendance check-out, by time;
 * the legs between them are road distances from Google (straight
 * line × 1.3, marked estimated, when Google is off or fails), and a visit's
 * own check-in → check-out leg under 50 m is skipped. Scope: field.view sees
 * self + direct reports, field.manage everybody.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { User } from '../models/user.model.js';
import { FieldDayRoute } from '../models/field-day-route.model.js';
import { distanceMeters } from '../lib/field-utils.js';
import {
  clearGoogleMapsCache,
  estimatedLegMeters,
  googleMaps,
  type LatLng,
} from '../services/google-maps.service.js';
import { createUser } from '../test/factories.js';
import {
  PLACES,
  actor,
  auth,
  dayIn,
  dayOut,
  ist,
  makeSite,
  north,
  visitAt,
  type Actor,
} from '../test/field-day-fixtures.js';

const DAY = '2026-10-15';
const km = (metres: number): number => Math.round(metres / 10) / 100;

let app: Express;
let boss: Actor;
let asha: Actor;
let bala: Actor;
let chitra: Actor;
let dev: Actor;
let zed: Actor;

beforeEach(async () => {
  app = createApp();
  boss = await actor('field_manager', { firstName: 'Boss', isFieldStaff: true });
  const report = (firstName: string) =>
    actor('field_employee', { firstName, reportingManager: boss.employee._id, isFieldStaff: true });
  asha = await report('Asha');
  bala = await report('Bala');
  chitra = await report('Chitra');
  dev = await report('Dev');
  zed = await actor('field_employee', { firstName: 'Zed', isFieldStaff: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  env.GOOGLE_MAPS_API_KEY = undefined;
  clearGoogleMapsCache();
});

const teamStatus = (who: Actor | { token: string }, date = DAY) =>
  request(app).get('/api/v1/field/team/status').query({ date }).set(auth(who.token));

const route = (who: Actor | { token: string }, employee: Actor, date = DAY) =>
  request(app).get(`/api/v1/field/route/${String(employee.employee._id)}`).query({ date }).set(auth(who.token));

interface Row {
  employee: { _id: string; firstName: string; lastName: string; employeeId: string };
  status: string;
  currentVisit: { _id: string; site: { _id: string; name: string }; since: string } | null;
  lastPoint: { lat: number; lng: number; at: string; kind: string; siteName?: string } | null;
  visitsToday: number;
  kmToday: number;
}

describe('GET /field/team/status', () => {
  it('at site, between sites, day ended and not started — for the caller and their direct reports only', async () => {
    const siteA = await makeSite('Site A', PLACES.siteA);
    const siteB = await makeSite('Site B', PLACES.siteB);

    await dayIn(asha, DAY, '09:00', PLACES.home);
    const open = await visitAt(asha, siteA, DAY, { in: '10:00' });

    await dayIn(bala, DAY, '09:00', PLACES.home);
    await visitAt(bala, siteA, DAY, { in: '10:00', out: '11:00' });

    await dayIn(chitra, DAY, '09:00', PLACES.home);
    await visitAt(chitra, siteB, DAY, { in: '10:00', out: '10:45' });
    await dayOut(chitra, DAY, '18:00', PLACES.home);

    await dayIn(zed, DAY, '09:00', PLACES.home);

    const res = await teamStatus(boss);
    expect(res.status).toBe(200);
    const rows = res.body.data as Row[];
    expect(rows.map((r) => r.employee.firstName)).toEqual(['Asha', 'Bala', 'Boss', 'Chitra', 'Dev']);
    const by = (name: string) => rows.find((r) => r.employee.firstName === name)!;

    expect(by('Asha')).toEqual({
      employee: {
        _id: String(asha.employee._id),
        firstName: 'Asha',
        lastName: 'Test',
        employeeId: asha.employee.employeeId,
      },
      status: 'at_site',
      currentVisit: {
        _id: String(open._id),
        site: { _id: String(siteA._id), name: 'Site A' },
        since: ist(DAY, '10:00').toISOString(),
      },
      lastPoint: {
        lat: PLACES.siteA.lat,
        lng: PLACES.siteA.lng,
        at: ist(DAY, '10:00').toISOString(),
        kind: 'visit_in',
        siteName: 'Site A',
      },
      visitsToday: 1,
      kmToday: km(estimatedLegMeters(PLACES.home, PLACES.siteA)),
    });

    expect(by('Bala')).toMatchObject({
      status: 'between_sites',
      currentVisit: null,
      lastPoint: { kind: 'visit_out', siteName: 'Site A', at: ist(DAY, '11:00').toISOString() },
      visitsToday: 1,
      // The visit's own check-in → check-out leg (same spot) is not travel.
      kmToday: km(estimatedLegMeters(PLACES.home, PLACES.siteA)),
    });

    expect(by('Chitra')).toMatchObject({
      status: 'day_ended',
      currentVisit: null,
      lastPoint: { kind: 'day_out', at: ist(DAY, '18:00').toISOString() },
      visitsToday: 1,
      kmToday: km(estimatedLegMeters(PLACES.home, PLACES.siteB) * 2),
    });
    expect(by('Chitra').lastPoint).not.toHaveProperty('siteName');

    expect(by('Dev')).toMatchObject({
      employee: { _id: String(dev.employee._id) },
      status: 'not_started',
      currentVisit: null,
      lastPoint: null,
      visitsToday: 0,
      kmToday: 0,
    });
    expect(by('Boss')).toMatchObject({ status: 'not_started', visitsToday: 0 });
  });

  it('field.manage sees every field employee, not the office staff; a field employee without reports sees just themselves', async () => {
    await actor('employee', { firstName: 'Office' });
    const hr = await actor('hr_executive', { firstName: 'Hema' });
    const all = await teamStatus(hr);
    expect(all.status).toBe(200);
    expect((all.body.data as Row[]).map((r) => r.employee.firstName)).toEqual(['Asha', 'Bala', 'Boss', 'Chitra', 'Dev', 'Zed']);

    const own = await teamStatus(zed);
    expect(own.status).toBe(200);
    expect((own.body.data as Row[]).map((r) => r.employee.firstName)).toEqual(['Zed']);
  });

  it('lists someone who did visits that day even when HR has not flagged them as field staff', async () => {
    const hr = await actor('hr_executive');
    const helper = await actor('employee', { firstName: 'Helper' });
    const siteA = await makeSite('Site A', PLACES.siteA);
    await visitAt(helper, siteA, DAY, { in: '10:00', out: '10:30' });
    const res = await teamStatus(hr);
    expect((res.body.data as Row[]).map((r) => r.employee.firstName)).toContain('Helper');
  });

  it('a field.view holder without an employee record gets 404 NO_EMPLOYEE_PROFILE; an admin without one sees everybody', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field.view'] } });
    const res = await teamStatus({ token });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');

    const admin = await createUser({ roleSlug: 'admin' });
    const all = await teamStatus(admin);
    expect(all.status).toBe(200);
    expect((all.body.data as Row[]).length).toBe(6);
  });

  it('400 for a date that is not YYYY-MM-DD', async () => {
    expect((await teamStatus(boss, '15-10-2026')).status).toBe(400);
  });
});

describe('GET /field/route/:employeeId', () => {
  /** Day-in at home → visit A (out 20 m away) → visit B (out 120 m away) → day-out at home. */
  async function busyDay(who: Actor) {
    const siteA = await makeSite('Site A', PLACES.siteA);
    const siteB = await makeSite('Site B', PLACES.siteB);
    await dayIn(who, DAY, '08:30', PLACES.home);
    await visitAt(who, siteA, DAY, { in: '09:30', out: '10:30', outAt: north(PLACES.siteA, 20) });
    await visitAt(who, siteB, DAY, { in: '12:00', out: '13:00', outAt: north(PLACES.siteB, 120) });
    await dayOut(who, DAY, '18:00', PLACES.home);
    return { siteA, siteB };
  }

  /** A fake road distance: 1.2 × the straight line, whole metres. */
  const road = (a: LatLng, b: LatLng): number => Math.round(distanceMeters(a, b) * 1.2);

  function mockRoads() {
    return vi.spyOn(googleMaps, 'routeDistanceMeters').mockImplementation(async (points: LatLng[]) => {
      const legsM = points.slice(1).map((b, i) => road(points[i]!, b));
      return { legsM, legsEstimated: legsM.map(() => false), estimated: false };
    });
  }

  it('sorts the day’s points by time, measures each leg with Google and skips a visit’s own leg under 50 m', async () => {
    await busyDay(asha);
    const spy = mockRoads();

    const res = await route(boss, asha);
    expect(res.status).toBe(200);
    const { points, legs, totalKm, estimated, date } = res.body.data;
    expect(date).toBe(DAY);
    expect(points.map((p: { kind: string; siteName?: string }) => [p.kind, p.siteName ?? null])).toEqual([
      ['day_in', null],
      ['visit_in', 'Site A'],
      ['visit_out', 'Site A'],
      ['visit_in', 'Site B'],
      ['visit_out', 'Site B'],
      ['day_out', null],
    ]);
    expect(points[0]).toMatchObject({ lat: PLACES.home.lat, lng: PLACES.home.lng, at: ist(DAY, '08:30').toISOString() });

    const aOut = north(PLACES.siteA, 20);
    const bOut = north(PLACES.siteB, 120);
    expect(legs).toEqual([
      { fromIndex: 0, toIndex: 1, distanceM: road(PLACES.home, PLACES.siteA), estimated: false },
      { fromIndex: 2, toIndex: 3, distanceM: road(aOut, PLACES.siteB), estimated: false },
      { fromIndex: 3, toIndex: 4, distanceM: road(PLACES.siteB, bOut), estimated: false },
      { fromIndex: 4, toIndex: 5, distanceM: road(bOut, PLACES.home), estimated: false },
    ]);
    const total = legs.reduce((s: number, l: { distanceM: number }) => s + l.distanceM, 0);
    expect(totalKm).toBe(km(total));
    expect(estimated).toBe(false);

    // The skipped leg never reached Google.
    const asked = spy.mock.calls.flatMap(([pts]) => pts.slice(1).map((b, i) => [pts[i], b]));
    expect(asked).not.toContainEqual([expect.objectContaining(PLACES.siteA), expect.objectContaining(aOut)]);
  });

  it('falls back to the straight line × 1.3 and marks the route estimated when Google fails', async () => {
    await busyDay(asha);
    env.GOOGLE_MAPS_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const res = await route(asha, asha);
    expect(res.status).toBe(200);
    const { legs, estimated, totalKm } = res.body.data;
    expect(estimated).toBe(true);
    expect(legs).toHaveLength(4);
    expect(legs.every((l: { estimated: boolean }) => l.estimated)).toBe(true);
    expect(legs[0].distanceM).toBe(estimatedLegMeters(PLACES.home, PLACES.siteA));
    expect(totalKm).toBe(km(legs.reduce((s: number, l: { distanceM: number }) => s + l.distanceM, 0)));
    // A failed Google answer is not kept: the next request tries again.
    expect(await FieldDayRoute.countDocuments()).toBe(0);
  });

  it('caches the computed route until a new point arrives', async () => {
    const siteA = await makeSite('Site A', PLACES.siteA);
    await dayIn(asha, DAY, '08:30', PLACES.home);
    await visitAt(asha, siteA, DAY, { in: '09:30', out: '10:30' });
    const spy = mockRoads();

    await route(asha, asha);
    const calls = spy.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    await route(asha, asha);
    expect(spy.mock.calls.length).toBe(calls);

    await dayOut(asha, DAY, '18:00', PLACES.home);
    const res = await route(asha, asha);
    expect(spy.mock.calls.length).toBeGreaterThan(calls);
    expect(res.body.data.points).toHaveLength(4);
    expect(res.body.data.legs).toHaveLength(2);
  });

  it('skips a visit’s own check-in → check-out leg and leaves out points without GPS', async () => {
    const siteA = await makeSite('Site A', PLACES.siteA);
    const siteC = await makeSite('Site C', PLACES.siteC);
    await dayIn(asha, DAY, '08:30', null);
    await visitAt(asha, siteA, DAY, { in: '09:30', out: '10:30' });
    await visitAt(asha, siteC, DAY, { in: '11:30', out: '12:00', inAt: null, outAt: null });
    const res = await route(asha, asha);
    expect(res.body.data.points.map((p: { kind: string }) => p.kind)).toEqual(['visit_in', 'visit_out']);
    expect(res.body.data.legs).toEqual([]);
    expect(res.body.data.totalKm).toBe(0);
  });

  it('an empty day is an empty route', async () => {
    const res = await route(asha, asha);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ date: DAY, points: [], legs: [], totalKm: 0, estimated: false });
  });

  it('scope: a field manager sees their reports but not others (they do not hold field.manage); HR sees anyone', async () => {
    expect((await route(boss, asha)).status).toBe(200);
    const denied = await route(boss, zed);
    expect(denied.status).toBe(403);
    expect((await route(asha, bala)).status).toBe(403);
    const hr = await actor('hr_executive');
    expect((await route(hr, zed)).status).toBe(200);
  });

  it('404 for an unknown employee, 400 for a bad id', async () => {
    const hr = await actor('hr_executive');
    expect(
      (await request(app).get('/api/v1/field/route/64b000000000000000000000').query({ date: DAY }).set(auth(hr.token))).status,
    ).toBe(404);
    expect((await request(app).get('/api/v1/field/route/nope').query({ date: DAY }).set(auth(hr.token))).status).toBe(400);
  });
});
