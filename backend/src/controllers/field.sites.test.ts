/**
 * /field/sites: pinning (idempotent by clientRef, creator assigned, address
 * reverse-geocoded when Google is configured), who sees which site, the
 * creator's 24-hour edit window, near-me sorting, the map, and Excel import.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import * as XLSX from 'xlsx';
import { Types } from 'mongoose';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User, type IUser } from '../models/user.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { env } from '../config/env.js';
import { clearGoogleMapsCache } from '../services/google-maps.service.js';
import { DAY_MS } from '../lib/business-day.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(
  roleSlug: 'field_employee' | 'field_manager' | 'hr_executive' | 'employee',
  overrides: Partial<Record<keyof IEmployee, unknown>> = {},
): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user, overrides);
  return { user, token, employee };
}

/** Mumbai. */
const MUMBAI = { lat: 19.076, lng: 72.8777 };

let app: Express;
let rep: Actor;
let head: Actor;

beforeEach(async () => {
  app = createApp();
  rep = await actor('field_employee');
  // field.manage (sees every site): HR. A field manager is team-scoped (field.view).
  head = await actor('hr_executive');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  env.GOOGLE_MAPS_API_KEY = undefined;
  clearGoogleMapsCache();
});

const pin = (who: Actor, body: Record<string, unknown>) =>
  request(app).post('/api/v1/field/sites').set(auth(who.token)).send(body);

const pinBody = (extra: Record<string, unknown> = {}) => ({
  clientRef: randomUUID(),
  name: 'Acme Plant',
  type: 'Project site',
  location: MUMBAI,
  ...extra,
});

/** A site stored directly, assigned to `assignees`. */
const siteFor = (assignees: IEmployee[], extra: Record<string, unknown> = {}) =>
  FieldSite.create({
    name: 'Stored site',
    type: 'Branch',
    location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] },
    assignedTo: assignees.map((e) => e._id),
    ...extra,
  });

describe('POST /field/sites — pinning', () => {
  it('a field employee pins a site: 201, assigned to them, created via mobile_pin, default radius', async () => {
    const res = await pin(rep, pinBody({ contactName: 'Ravi', contactPhone: '9800000000', address: { line1: '12 MG Road', city: 'Pune' } }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Acme Plant',
      type: 'Project site',
      location: MUMBAI,
      radiusM: 200,
      createdVia: 'mobile_pin',
      contactName: 'Ravi',
      contactPhone: '9800000000',
      address: { line1: '12 MG Road', city: 'Pune', state: '', pincode: '' },
      visitCount: 0,
      lastVisitAt: null,
      createdBy: { _id: String(rep.user._id), firstName: 'Test' },
    });
    expect(res.body.data.assignedTo).toEqual([
      expect.objectContaining({ _id: String(rep.employee._id), employeeId: rep.employee.employeeId }),
    ]);
    const stored = await FieldSite.findById(res.body.data._id).lean();
    expect(stored?.location?.coordinates).toEqual([MUMBAI.lng, MUMBAI.lat]);
  });

  it('a site made on the website (no clientRef) is created via web', async () => {
    const res = await pin(head, { name: 'HQ', type: 'Branch', location: MUMBAI, radiusM: 150 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ createdVia: 'web', radiusM: 150 });
    // The field manager pinned it, so it is theirs.
    expect(res.body.data.assignedTo.map((a: { _id: string }) => a._id)).toEqual([String(head.employee._id)]);
  });

  it('only field.view holders pin; a field.view holder without an employee record gets NO_EMPLOYEE_PROFILE', async () => {
    const plain = await actor('employee');
    expect((await pin(plain, pinBody())).status).toBe(403);

    const { user, token } = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field.view'] } });
    const res = await request(app).post('/api/v1/field/sites').set(auth(token)).send(pinBody());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_EMPLOYEE_PROFILE');
    expect(await FieldSite.countDocuments()).toBe(0);
  });

  it('the same clientRef twice (a retry) stores one site and answers the stored one', async () => {
    const body = pinBody();
    const first = await pin(rep, body);
    const again = await pin(rep, { ...body, name: 'Renamed on retry' });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.data._id).toBe(first.body.data._id);
    expect(again.body.data.name).toBe('Acme Plant');
    expect(await FieldSite.countDocuments()).toBe(1);
  });

  it('concurrent retries of one pin still store one site', async () => {
    const body = pinBody();
    const results = await Promise.all([pin(rep, body), pin(rep, body), pin(rep, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.data._id)).size).toBe(1);
    expect(await FieldSite.countDocuments()).toBe(1);
  });

  it("another user's clientRef is a 409, never their site", async () => {
    const body = pinBody();
    await pin(rep, body);
    const other = await actor('field_employee');
    const res = await pin(other, body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLIENT_REF_CONFLICT');
  });

  it('rejects an unknown site type, a 0,0 location and an out-of-range radius', async () => {
    const badType = await pin(rep, pinBody({ type: 'Warehouse' }));
    expect(badType.status).toBe(400);
    expect(badType.body.error.code).toBe('INVALID_SITE_TYPE');
    expect((await pin(rep, pinBody({ location: { lat: 0, lng: 0 } }))).status).toBe(400);
    expect((await pin(rep, pinBody({ radiusM: 5 }))).status).toBe(400);
    // The type matches the settings' spelling whatever the case.
    const lower = await pin(rep, pinBody({ type: 'project SITE' }));
    expect(lower.body.data.type).toBe('Project site');
  });

  it('honours capturedAt within offlineMaxAgeDays; 8 days old → 400 CAPTURED_AT_INVALID; a future one → arrival time', async () => {
    const old = await pin(rep, pinBody({ capturedAt: new Date(Date.now() - 8 * DAY_MS).toISOString() }));
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('CAPTURED_AT_INVALID');
    const before = Date.now();
    const future = await pin(rep, pinBody({ capturedAt: new Date(Date.now() + 10 * 60_000).toISOString() }));
    expect(future.status).toBe(201);
    const stored = (await FieldSite.findById(future.body.data._id).lean())?.capturedAt?.getTime() ?? 0;
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());

    const at = new Date(Date.now() - 3 * DAY_MS);
    const ok = await pin(rep, pinBody({ capturedAt: at.toISOString() }));
    expect(ok.status).toBe(201);
    expect((await FieldSite.findById(ok.body.data._id).lean())?.capturedAt?.toISOString()).toBe(at.toISOString());
  });

  it('assignedTo: a lead may add their direct report, not a stranger; a field manager anyone', async () => {
    const lead = await actor('field_employee');
    const report = await actor('field_employee', { reportingManager: lead.employee._id });
    const ok = await pin(lead, pinBody({ assignedTo: [String(report.employee._id)] }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.assignedTo.map((a: { _id: string }) => a._id).sort()).toEqual(
      [String(lead.employee._id), String(report.employee._id)].sort(),
    );
    expect((await pin(lead, pinBody({ assignedTo: [String(rep.employee._id)] }))).status).toBe(403);
    expect((await pin(head, pinBody({ assignedTo: [String(rep.employee._id)] }))).status).toBe(201);
    expect((await pin(head, pinBody({ assignedTo: ['64b000000000000000000000'] }))).status).toBe(400);
  });

  it('attaches an uploaded photo by key (signed photoUrl out); a key that is not a field upload is refused', async () => {
    const PNG = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const up = await request(app)
      .post('/api/v1/field/uploads/photo')
      .set(auth(rep.token))
      .attach('photo', PNG, { filename: 'site.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const res = await pin(rep, pinBody({ photo: up.body.data.key }));
    expect(res.status).toBe(201);
    expect(res.body.data.photoUrl).toContain('/api/v1/files/field-photos/');
    expect(res.body.data.photoUrl).toContain('sig=');
    expect((await FieldSite.findById(res.body.data._id).lean())?.photo).toBe(`/uploads/${up.body.data.key}`);

    for (const photo of ['payslips/2026/10/secret.pdf', 'field-photos/2026/10/1-000000000000.png', '../etc/passwd']) {
      // eslint-disable-next-line no-await-in-loop
      const bad = await pin(rep, pinBody({ photo }));
      expect({ photo, status: bad.status, code: bad.body.error?.code }).toEqual({ photo, status: 400, code: 'INVALID_FILE_KEY' });
    }
  });
});

describe('POST /field/sites — reverse geocoding', () => {
  const GEOCODE = {
    status: 'OK',
    results: [
      {
        formatted_address: 'Plot 7, Andheri East, Mumbai, Maharashtra 400069, India',
        address_components: [
          { long_name: 'Mumbai', types: ['locality', 'political'] },
          { long_name: 'Maharashtra', types: ['administrative_area_level_1', 'political'] },
          { long_name: '400069', types: ['postal_code'] },
        ],
      },
    ],
  };

  it('fills the address from Google when a key is set and none was sent', async () => {
    env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(GEOCODE), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await pin(rep, pinBody());
    expect(res.status).toBe(201);
    expect(res.body.data.address).toEqual({
      line1: 'Plot 7, Andheri East, Mumbai, Maharashtra 400069, India',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400069',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain('https://maps.googleapis.com/maps/api/geocode/json?latlng=19.076%2C72.8777');

    // An address the employee typed is kept as entered.
    const typed = await pin(rep, pinBody({ address: { line1: 'Gate 2' } }));
    expect(typed.body.data.address.line1).toBe('Gate 2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('leaves the address untouched (no call) without a key, and when Google fails', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await pin(rep, pinBody());
    expect(res.status).toBe(201);
    expect(res.body.data.address).toEqual({ line1: '', city: '', state: '', pincode: '' });
    expect(fetchMock).not.toHaveBeenCalled();

    env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const failed = await pin(rep, pinBody());
    expect(failed.status).toBe(201);
    expect(failed.body.data.address.line1).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('GET /field/sites — scope, filters, near me', () => {
  it('a rep sees sites assigned to them or created by them; a lead also their report’s; a field manager all', async () => {
    const lead = await actor('field_employee');
    const report = await actor('field_employee', { reportingManager: lead.employee._id });
    const stranger = await actor('field_employee');
    const mine = await siteFor([rep.employee], { name: 'Mine' });
    const reports = await siteFor([report.employee], { name: 'Report’s' });
    const strangers = await siteFor([stranger.employee], { name: 'Stranger’s' });
    const unassigned = await siteFor([], { name: 'Unassigned' });
    const createdByRep = await siteFor([], { name: 'Pinned by rep', createdBy: rep.user._id });

    const names = async (who: Actor) => {
      const res = await request(app).get('/api/v1/field/sites').set(auth(who.token));
      expect(res.status).toBe(200);
      return (res.body.data as Array<{ name: string }>).map((s) => s.name).sort();
    };
    expect(await names(rep)).toEqual([mine.name, createdByRep.name].sort());
    expect(await names(lead)).toEqual([reports.name]);
    expect(await names(report)).toEqual([reports.name]);
    expect(await names(head)).toEqual([mine, reports, strangers, unassigned, createdByRep].map((s) => s.name).sort());

    // The detail follows the same rule.
    expect((await request(app).get(`/api/v1/field/sites/${strangers._id}`).set(auth(rep.token))).status).toBe(403);
    expect((await request(app).get(`/api/v1/field/sites/${reports._id}`).set(auth(lead.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/field/sites/${unassigned._id}`).set(auth(head.token))).status).toBe(200);
  });

  it('an admin without an employee record sees every site; a deleted site is gone', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const s = await siteFor([rep.employee]);
    const res = await request(app).get('/api/v1/field/sites').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect((await request(app).delete(`/api/v1/field/sites/${s._id}`).set(auth(rep.token))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/field/sites/${s._id}`).set(auth(head.token))).status).toBe(200);
    expect((await request(app).get('/api/v1/field/sites').set(auth(token))).body.data).toEqual([]);
    expect((await request(app).get(`/api/v1/field/sites/${s._id}`).set(auth(token))).status).toBe(404);
  });

  it('near=lat,lng sorts nearest first with distanceM; radiusKm limits; search and type filter', async () => {
    await siteFor([rep.employee], { name: 'Far', location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat + 0.1] } });
    await siteFor([rep.employee], { name: 'Near', location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat + 0.01] } });
    await siteFor([rep.employee], { name: 'Here', type: 'Vendor', location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });
    await siteFor([], { name: 'Not mine', location: { type: 'Point', coordinates: [MUMBAI.lng, MUMBAI.lat] } });

    const res = await request(app)
      .get('/api/v1/field/sites')
      .query({ near: `${MUMBAI.lat},${MUMBAI.lng}` })
      .set(auth(rep.token));
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ name: string; distanceM: number }>;
    expect(rows.map((s) => s.name)).toEqual(['Here', 'Near', 'Far']);
    expect(rows[0]!.distanceM).toBe(0);
    expect(rows[1]!.distanceM).toBeGreaterThan(1000);
    expect(rows[1]!.distanceM).toBeLessThan(1200);
    expect(res.body.pagination).toMatchObject({ total: 3, page: 1 });

    const within = await request(app)
      .get('/api/v1/field/sites')
      .query({ near: `${MUMBAI.lat},${MUMBAI.lng}`, radiusKm: 5 })
      .set(auth(rep.token));
    expect(within.body.data.map((s: { name: string }) => s.name)).toEqual(['Here', 'Near']);

    const typed = await request(app).get('/api/v1/field/sites').query({ type: 'Vendor' }).set(auth(rep.token));
    expect(typed.body.data.map((s: { name: string }) => s.name)).toEqual(['Here']);
    const searched = await request(app).get('/api/v1/field/sites').query({ search: 'ne(a+)+$[' }).set(auth(rep.token));
    expect(searched.status).toBe(200);
    expect((await request(app).get('/api/v1/field/sites').query({ near: 'abc' }).set(auth(rep.token))).status).toBe(400);
  });

  it('GET /sites/:id carries the latest visits the caller may see', async () => {
    const s = await siteFor([rep.employee]);
    await Visit.create({ employeeId: rep.employee._id, siteId: s._id, status: 'completed', checkIn: { time: new Date() } });
    const res = await request(app).get(`/api/v1/field/sites/${s._id}`).set(auth(rep.token));
    expect(res.status).toBe(200);
    expect(res.body.data.recentVisits).toHaveLength(1);
    expect(res.body.data.recentVisits[0]).toMatchObject({
      status: 'completed',
      employee: { _id: String(rep.employee._id) },
    });
    expect(res.body.data.recentVisits[0].checkIn.at).toBeTruthy();
  });
});

describe('GET /field/sites/map', () => {
  it('returns only the visible sites inside the bbox, with their radius', async () => {
    await siteFor([rep.employee], { name: 'Inside', radiusM: 300 });
    await siteFor([rep.employee], { name: 'East', location: { type: 'Point', coordinates: [80.2, 13.08] } });
    await siteFor([], { name: 'Hidden' });
    const res = await request(app).get('/api/v1/field/sites/map').query({ bbox: '72.5,18.8,73.2,19.4' }).set(auth(rep.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({ name: 'Inside', type: 'Branch', radiusM: 300, location: MUMBAI, lastVisitAt: null }),
    ]);
    expect(res.body.truncated).toBe(false);
    expect((await request(app).get('/api/v1/field/sites/map').query({ bbox: '72.5,18.8,abc' }).set(auth(rep.token))).status).toBe(400);
  });

  it('is bounded to 500 pins', async () => {
    await FieldSite.insertMany(
      Array.from({ length: 505 }, (_, i) => ({
        name: `Site ${i}`,
        type: 'Branch',
        location: { type: 'Point', coordinates: [72.85, 19.07] },
        assignedTo: [rep.employee._id],
      })),
    );
    const res = await request(app).get('/api/v1/field/sites/map').query({ bbox: '72.5,18.8,73.2,19.4' }).set(auth(head.token));
    expect(res.body.data).toHaveLength(500);
    expect(res.body.truncated).toBe(true);
  });
});

describe('PATCH /field/sites/:id', () => {
  it('the creator corrects their pin within 24 h; after that 403; a field manager any time', async () => {
    const created = await pin(rep, pinBody());
    const id = created.body.data._id as string;
    const fix = await request(app)
      .patch(`/api/v1/field/sites/${id}`)
      .set(auth(rep.token))
      .send({ name: 'Acme Plant Gate 2', location: { lat: 19.08, lng: 72.88 }, notes: 'Use gate 2', radiusM: 120 });
    expect(fix.status).toBe(200);
    expect(fix.body.data).toMatchObject({ name: 'Acme Plant Gate 2', location: { lat: 19.08, lng: 72.88 }, notes: 'Use gate 2', radiusM: 120 });

    const cleared = await request(app).patch(`/api/v1/field/sites/${id}`).set(auth(rep.token)).send({ notes: null });
    expect(cleared.body.data.notes).toBe('');

    const other = await actor('field_employee');
    expect((await request(app).patch(`/api/v1/field/sites/${id}`).set(auth(other.token)).send({ name: 'x' })).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/field/sites/${id}`).set(auth(rep.token)).send({ assignedTo: [String(rep.employee._id)] })).status,
    ).toBe(403);

    await FieldSite.collection.updateOne({ _id: new Types.ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    const late = await request(app).patch(`/api/v1/field/sites/${id}`).set(auth(rep.token)).send({ name: 'Too late' });
    expect(late.status).toBe(403);
    expect(late.body.error.code).toBe('EDIT_WINDOW_CLOSED');

    const byManager = await request(app)
      .patch(`/api/v1/field/sites/${id}`)
      .set(auth(head.token))
      .send({ name: 'Acme', type: 'branch', assignedTo: [String(rep.employee._id), String(other.employee._id)] });
    expect(byManager.status).toBe(200);
    expect(byManager.body.data.type).toBe('Branch');
    expect(byManager.body.data.assignedTo).toHaveLength(2);
    expect((await request(app).patch(`/api/v1/field/sites/${id}`).set(auth(head.token)).send({ type: 'Nope' })).status).toBe(400);
  });
});

describe('POST /field/sites/import', () => {
  function workbook(rows: unknown[][]): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sites');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
  const HEADER = [
    'Name', 'Type', 'Address', 'City', 'State', 'Pincode', 'Latitude', 'Longitude', 'Radius',
    'Contact name', 'Contact phone', 'Assigned employee IDs',
  ];
  const upload = (who: Actor, buf: Buffer) =>
    request(app).post('/api/v1/field/sites/import').set(auth(who.token)).attach('file', buf, { filename: 'sites.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  it('creates the good rows and reports the bad one by its spreadsheet row', async () => {
    const buf = workbook([
      HEADER,
      ['Andheri Branch', 'Branch', '1 Link Rd', 'Mumbai', 'MH', '400053', 19.12, 72.84, 150, 'Asha', '9811111111', rep.employee.employeeId],
      ['Pune Plant', 'project site', '', 'Pune', 'MH', '', 18.52, 73.85, '', '', '', ''],
      ['No Pin Co', 'Vendor', '', '', '', '', '', '', '', '', '', ''],
    ]);
    const res = await upload(head, buf);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 2, updated: 0 });
    expect(res.body.data.errors).toEqual([{ row: 4, message: expect.stringMatching(/Latitude/) }]);

    const andheri = await FieldSite.findOne({ name: 'Andheri Branch' }).lean();
    expect(andheri).toMatchObject({
      type: 'Branch',
      radiusM: 150,
      contactName: 'Asha',
      address: { line1: '1 Link Rd', city: 'Mumbai', state: 'MH', pincode: '400053' },
      createdVia: 'web',
    });
    expect(andheri?.location?.coordinates).toEqual([72.84, 19.12]);
    expect(andheri?.assignedTo.map(String)).toEqual([String(rep.employee._id)]);
    const pune = await FieldSite.findOne({ name: 'Pune Plant' }).lean();
    expect(pune).toMatchObject({ type: 'Project site', radiusM: 200 });

    // Re-importing a name updates that site; an unknown type is a row error,
    // an unknown employee code only a note (the site still imports).
    const again = await upload(
      head,
      workbook([
        HEADER,
        ['andheri branch', 'Branch', '', '', '', '', 19.13, 72.85, 250, '', '', ''],
        ['Ghost', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', 'EMP999999'],
        ['Odd', 'Warehouse', '', '', '', '', 19.1, 72.8, '', '', '', ''],
        // Blank type and radius on an update keep the stored ones.
        ['Pune Plant', '', '', 'Pimpri', '', '', 18.53, 73.86, '', '', '', ''],
      ]),
    );
    expect(again.body.data).toMatchObject({ created: 1, updated: 2 });
    expect(again.body.data.errors.map((e: { row: number }) => e.row)).toEqual([4]);
    expect(again.body.data.warnings).toEqual([{ row: 3, message: expect.stringMatching(/EMP999999/) }]);
    expect((await FieldSite.findOne({ name: 'Ghost' }).lean())?.assignedTo).toEqual([]);
    expect((await FieldSite.findById(andheri?._id).lean())?.radiusM).toBe(250);
    expect(await FieldSite.findById(pune?._id).lean()).toMatchObject({
      type: 'Project site',
      radiusM: 200,
      address: { city: 'Pimpri' },
    });
    expect(await FieldSite.countDocuments()).toBe(3);
  });

  const assigneesOf = async (name: string) =>
    ((await FieldSite.findOne({ name }).lean())?.assignedTo ?? []).map(String);

  it('matches employee codes ignoring case, surrounding spaces, separators and zero-padding', async () => {
    const asha = await actor('field_employee', { employeeId: 'EMP000046' });
    const res = await upload(
      head,
      workbook([
        HEADER,
        ['Site A', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', 'Emp-46'],
        ['Site B', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', ' emp000046 '],
        ['Site C', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', `EMP_046 , ${rep.employee.employeeId.toLowerCase()}`],
      ]),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ created: 3, updated: 0, errors: [], warnings: [] });
    expect(await assigneesOf('Site A')).toEqual([String(asha.employee._id)]);
    expect(await assigneesOf('Site B')).toEqual([String(asha.employee._id)]);
    expect(await assigneesOf('Site C')).toEqual([String(asha.employee._id), String(rep.employee._id)]);
  });

  it('never guesses between two employees: an exact code wins, a loose one that fits both is left out', async () => {
    const short = await actor('field_employee', { employeeId: 'EMP46' });
    await actor('field_employee', { employeeId: 'EMP000046' });
    const res = await upload(
      head,
      workbook([
        HEADER,
        ['Site A', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', 'emp46'],
        ['Site B', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', 'EMP-046'],
      ]),
    );
    expect(res.body.data).toMatchObject({ created: 2, updated: 0, errors: [] });
    expect(await assigneesOf('Site A')).toEqual([String(short.employee._id)]);
    expect(await assigneesOf('Site B')).toEqual([]);
    expect(res.body.data.warnings).toEqual([{ row: 3, message: expect.stringMatching(/EMP-046.*more than one employee/) }]);
  });

  it('a row naming unknown or non-field employees still imports, assigned to the ones who can do field work', async () => {
    await actor('employee', { employeeId: 'EMP000050' }); // a login without Field Visits access
    await Employee.create({ firstName: 'Ravi', lastName: 'Kumar', email: 'ravi@test.local', joiningDate: new Date('2024-01-15'), employeeId: 'EMP000051' });
    const res = await upload(
      head,
      workbook([
        HEADER,
        ['Site A', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', `${rep.employee.employeeId}, EMP-999, EMP000050; EMP000051`],
        // Still skipped: no name, no latitude.
        ['', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', rep.employee.employeeId],
        ['Site C', 'Branch', '', '', '', '', '', 72.8, '', '', '', rep.employee.employeeId],
      ]),
    );
    expect(res.body.data).toMatchObject({ created: 1, updated: 0 });
    expect(res.body.data.errors).toEqual([
      { row: 3, message: expect.stringMatching(/Name/) },
      { row: 4, message: expect.stringMatching(/Latitude/) },
    ]);
    expect(res.body.data.warnings).toEqual([{ row: 2, message: expect.any(String) }]);
    const note = res.body.data.warnings[0].message as string;
    expect(note).toMatch(/EMP-999 — no employee has this ID/);
    expect(note).toMatch(/EMP000050 \(Test [^)]*\) — .*Field Employee role/);
    expect(note).toMatch(/EMP000051 \(Ravi Kumar\) — no login/);
    expect(note).not.toMatch(new RegExp(rep.employee.employeeId));
    expect(await assigneesOf('Site A')).toEqual([String(rep.employee._id)]);
  });

  it("on an update, a row whose IDs are all left out keeps the site's current assignees", async () => {
    await siteFor([rep.employee], { name: 'Stored site' });
    const res = await upload(head, workbook([HEADER, ['Stored site', '', '', '', '', '', 19.1, 72.8, '', '', '', 'EMP-999']]));
    expect(res.body.data).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect(res.body.data.warnings).toEqual([{ row: 2, message: expect.stringMatching(/current assignees were kept/) }]);
    expect(await assigneesOf('Stored site')).toEqual([String(rep.employee._id)]);
  });

  it('is for field managers only, and needs a spreadsheet', async () => {
    const buf = workbook([HEADER, ['A', 'Branch', '', '', '', '', 19.1, 72.8, '', '', '', '']]);
    expect((await upload(rep, buf)).status).toBe(403);
    const notSheet = await request(app)
      .post('/api/v1/field/sites/import')
      .set(auth(head.token))
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(notSheet.status).toBe(400);
    expect((await request(app).post('/api/v1/field/sites/import').set(auth(head.token))).status).toBe(400);
  });
});
