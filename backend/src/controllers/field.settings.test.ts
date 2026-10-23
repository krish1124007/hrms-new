/**
 * /field/settings (defaults, validated partial update, field.manage only),
 * the cached `getFieldSettings()`, and POST /field/uploads/document.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { FieldSettingsModel } from '../models/field-settings.model.js';
import {
  defaultFieldSettings,
  getFieldSettings,
  setFieldSettingsCacheTtl,
} from '../services/field-settings.service.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let app: Express;
let repToken: string;
let headToken: string;

beforeEach(async () => {
  app = createApp();
  const rep = await createUser({ roleSlug: 'field_employee' });
  await createEmployeeFor(rep.user);
  repToken = rep.token;
  // field.manage: HR (a field manager's field.view is team-scoped and has no settings).
  const head = await createUser({ roleSlug: 'hr_executive' });
  await createEmployeeFor(head.user);
  headToken = head.token;
});

afterEach(() => setFieldSettingsCacheTtl(0));

const put = (token: string, body: unknown) =>
  request(app).put('/api/v1/field/settings').set(auth(token)).send(body as object);

describe('GET /field/settings', () => {
  it('answers the defaults before anything is saved', async () => {
    const res = await request(app).get('/api/v1/field/settings').set(auth(repToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      selfieRequired: true,
      defaultSiteRadiusM: 200,
      siteTypes: ['Client office', 'Project site', 'Branch', 'Vendor', 'Government office', 'Other'],
      visitPurposes: ['Meeting', 'Inspection', 'Audit', 'Survey', 'Installation', 'Maintenance', 'Training', 'Other'],
      shortVisitMinutes: 5,
      autoCloseTime: '23:30',
      offlineMaxAgeDays: 7,
      visitCountsAsAttendance: true,
      vehicles: [
        { type: 'bike', label: 'Two-wheeler', ratePerKm: 0 },
        { type: 'car', label: 'Car', ratePerKm: 0 },
      ],
      checklists: [],
    });
    expect(await FieldSettingsModel.countDocuments()).toBe(0);
  });

  it('needs field.view', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    expect((await request(app).get('/api/v1/field/settings').set(auth(token))).status).toBe(403);
  });
});

describe('PUT /field/settings', () => {
  it('field.manage saves a subset; the rest keeps its value; checklists get ids', async () => {
    const res = await put(headToken, {
      selfieRequired: false,
      vehicles: [
        { type: 'bike', label: 'Bike', ratePerKm: 3.5 },
        { type: 'car', label: 'Car', ratePerKm: 9 },
      ],
      checklists: [
        {
          name: 'Site inspection',
          purpose: 'Inspection',
          items: [
            { label: 'Fire exits clear?', kind: 'yes_no', required: true },
            { label: 'Condition', kind: 'select', options: ['Good', 'Poor'] },
            { label: 'Meter reading', kind: 'number' },
            { label: 'Remarks', kind: 'text' },
            { label: 'Photo of the panel', kind: 'photo', required: true },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      selfieRequired: false,
      defaultSiteRadiusM: 200,
      vehicles: [{ type: 'bike', label: 'Bike', ratePerKm: 3.5 }, { type: 'car', label: 'Car', ratePerKm: 9 }],
    });
    const [checklist] = res.body.data.checklists;
    expect(checklist._id).toMatch(/^[a-f\d]{24}$/);
    expect(checklist.items).toHaveLength(5);
    expect(checklist.items[0]).toMatchObject({ label: 'Fire exits clear?', kind: 'yes_no', required: true });
    expect(checklist.items[1]).toMatchObject({ kind: 'select', options: ['Good', 'Poor'], required: false });
    expect(checklist.items[2]).not.toHaveProperty('options');

    // Saved, and editing keeps the ids the client sends back.
    const read = await request(app).get('/api/v1/field/settings').set(auth(repToken));
    expect(read.body.data.checklists[0]._id).toBe(checklist._id);
    const renamed = await put(headToken, {
      checklists: [{ ...checklist, name: 'Inspection checklist' }],
      shortVisitMinutes: 10,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.checklists[0]).toMatchObject({ _id: checklist._id, name: 'Inspection checklist' });
    expect(renamed.body.data.checklists[0].items[0]._id).toBe(checklist.items[0]._id);
    expect(renamed.body.data.selfieRequired).toBe(false);
    expect(await FieldSettingsModel.countDocuments()).toBe(1);
  });

  it('validates every field', async () => {
    const bad: Array<Record<string, unknown>> = [
      { selfieRequired: 'yes' },
      { defaultSiteRadiusM: 5 },
      { defaultSiteRadiusM: 200.5 },
      { siteTypes: [] },
      { siteTypes: ['Branch', 'branch'] },
      { visitPurposes: [''] },
      { shortVisitMinutes: -1 },
      { autoCloseTime: '24:00' },
      { autoCloseTime: '9:30' },
      { offlineMaxAgeDays: 0 },
      { offlineMaxAgeDays: 31 },
      { vehicles: [] },
      { vehicles: [{ type: 'truck', label: 'Truck', ratePerKm: 1 }] },
      { vehicles: [{ type: 'bike', label: 'A', ratePerKm: 1 }, { type: 'bike', label: 'B', ratePerKm: 2 }] },
      { vehicles: [{ type: 'car', label: 'Car', ratePerKm: -1 }] },
      { checklists: [{ name: 'X', purpose: 'Meeting', items: [] }] },
      { checklists: [{ name: 'X', purpose: 'Meeting', items: [{ label: 'Pick', kind: 'select' }] }] },
      { checklists: [{ name: 'X', purpose: 'Meeting', items: [{ label: 'Q', kind: 'essay' }] }] },
      // A checklist must belong to a visit purpose.
      { checklists: [{ name: 'X', purpose: 'Dance', items: [{ label: 'Q', kind: 'text' }] }] },
      { visitPurposes: ['Audit'], checklists: [{ name: 'X', purpose: 'Meeting', items: [{ label: 'Q', kind: 'text' }] }] },
    ];
    for (const body of bad) {
      // eslint-disable-next-line no-await-in-loop
      const res = await put(headToken, body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
    expect(await FieldSettingsModel.countDocuments()).toBe(0);

    const ok = await put(headToken, { autoCloseTime: '21:45', offlineMaxAgeDays: 3, siteTypes: ['Clinic', 'Other'] });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ autoCloseTime: '21:45', offlineMaxAgeDays: 3, siteTypes: ['Clinic', 'Other'] });
  });

  it('is for field.manage only — not a field employee, not a (team-scoped) field manager', async () => {
    expect((await put(repToken, { selfieRequired: false })).status).toBe(403);
    const lead = await createUser({ roleSlug: 'field_manager' });
    expect((await put(lead.token, { selfieRequired: false })).status).toBe(403);
    const { token } = await createUser({ roleSlug: 'hr_executive' });
    expect((await put(token, { selfieRequired: false })).status).toBe(200);
  });
});

describe('getFieldSettings()', () => {
  it('returns a fresh copy of the defaults (callers cannot change them for others)', async () => {
    const a = await getFieldSettings();
    a.siteTypes.push('Mutated');
    expect((await getFieldSettings()).siteTypes).toEqual(defaultFieldSettings().siteTypes);
  });

  it('caches for its TTL; an update through PUT refreshes it at once', async () => {
    setFieldSettingsCacheTtl(30_000);
    expect((await getFieldSettings()).shortVisitMinutes).toBe(5);
    // Written behind the service's back: not seen while cached.
    await FieldSettingsModel.create({ ...defaultFieldSettings(), shortVisitMinutes: 42 });
    expect((await getFieldSettings()).shortVisitMinutes).toBe(5);

    const res = await put(headToken, { shortVisitMinutes: 15 });
    expect(res.body.data.shortVisitMinutes).toBe(15);
    expect((await getFieldSettings()).shortVisitMinutes).toBe(15);
  });
});

describe('POST /field/uploads/document', () => {
  const upload = (name: string, body: Buffer, contentType: string, field = 'document') =>
    request(app).post('/api/v1/field/uploads/document').set(auth(repToken)).attach(field, body, { filename: name, contentType });

  it('stores a PDF, Word or Excel file privately → { url, key, name }', async () => {
    const pdf = await upload('Minutes of meeting.pdf', Buffer.from('%PDF-1.4\n%fake'), 'application/pdf');
    expect(pdf.status).toBe(201);
    expect(pdf.body.data.key).toMatch(/^field-documents\/\d{4}\/\d{2}\/\d+-[a-f0-9]{12}\.pdf$/);
    expect(pdf.body.data.url).toContain('/api/v1/files/field-documents/');
    expect(pdf.body.data.url).toContain('sig=');
    expect(pdf.body.data.name).toBe('Minutes of meeting.pdf');

    const docx = await upload(
      'report.docx',
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'file',
    );
    expect(docx.status).toBe(201);
    expect(docx.body.data.key).toMatch(/\.docx$/);
    const xls = await upload('sheet.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]), 'application/vnd.ms-excel');
    expect(xls.status).toBe(201);
  });

  it('refuses other types, contents that do not match the name, and a missing file', async () => {
    expect((await upload('run.exe', Buffer.from('MZ'), 'application/octet-stream')).status).toBe(400);
    expect((await upload('fake.pdf', Buffer.from('not a pdf'), 'application/pdf')).status).toBe(400);
    expect((await upload('fake.docx', Buffer.from('%PDF-1.4'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).status).toBe(400);
    expect((await request(app).post('/api/v1/field/uploads/document').set(auth(repToken))).status).toBe(400);
    const { token } = await createUser({ roleSlug: 'employee' });
    const denied = await request(app)
      .post('/api/v1/field/uploads/document')
      .set(auth(token))
      .attach('document', Buffer.from('%PDF-1.4'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(denied.status).toBe(403);
  });
});
