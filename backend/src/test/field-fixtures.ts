/**
 * Shared set-up for the field visit engine tests (field.visits, field.offline,
 * field.schedules): actors with field permissions, sites with a pin, upload
 * keys made through the real upload endpoints, IST instants and settings.
 */
import request from 'supertest';
import type { Express } from 'express';
import { createUser, createEmployeeFor } from './factories.js';
import { User, type IUser } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
import { updateFieldSettings, type FieldSettingsUpdate } from '../services/field-settings.service.js';

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface FieldActor {
  user: IUser;
  token: string;
  employee: IEmployee;
  userId: string;
}

/** A user holding `permissions` (custom), with an employee record. */
export async function fieldActor(
  permissions: string[],
  overrides: Partial<Record<keyof IEmployee, unknown>> = {},
): Promise<FieldActor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: permissions } });
  const employee = await createEmployeeFor(user, overrides);
  return { user, token, employee, userId: String(user._id) };
}

/** `field.view` only (own records + direct reports'). */
export const viewer = (overrides: Partial<Record<keyof IEmployee, unknown>> = {}) =>
  fieldActor(['field.view'], overrides);

/** `field.view` + `field.manage` (everybody). */
export const fieldManager = () => fieldActor(['field.view', 'field.manage']);

/** A `field.manage` holder with no employee record (an admin). */
export async function managerWithoutEmployee(): Promise<{ token: string; userId: string }> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field.view', 'field.manage'] } });
  return { token, userId: String(user._id) };
}

/** Mumbai. */
export const MUMBAI = { lat: 19.076, lng: 72.8777 };
/** Metres per degree of latitude. */
const M_PER_DEG_LAT = 111_195;
/** A point `metres` north of `p`. */
export const north = (p: { lat: number; lng: number }, metres: number) => ({ lat: p.lat + metres / M_PER_DEG_LAT, lng: p.lng });

/** A live site pinned at `at` (Mumbai by default), radius 200 m, assigned to `assignees`. */
export function pinnedSite(
  assignees: IEmployee[] = [],
  extra: Record<string, unknown> = {},
  at: { lat: number; lng: number } = MUMBAI,
) {
  return FieldSite.create({
    name: 'Acme Plant',
    type: 'Project site',
    radiusM: 200,
    location: { type: 'Point', coordinates: [at.lng, at.lat] },
    assignedTo: assignees.map((e) => e._id),
    ...extra,
  });
}

/** Today's IST day label, `n` days from today. */
export const dayLabel = (n = 0, now: Date = new Date()) => new Date(startOfBusinessDay(now).getTime() + n * DAY_MS);
/** `YYYY-MM-DD` of `dayLabel(n)`. */
export const ymd = (n = 0, now: Date = new Date()) => dayLabel(n, now).toISOString().slice(0, 10);
/** The instant the IST wall clock reads `hhmm` on `dayLabel(n)`. */
export const istAt = (n: number, hhmm: string, now: Date = new Date()) => atBusinessTime(dayLabel(n, now), hhmm);

/** 1×1 transparent PNG. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Upload a photo as `actor`; the storage key. */
export async function photoKey(app: Express, actor: { token: string }): Promise<string> {
  const res = await request(app)
    .post('/api/v1/field/uploads/photo')
    .set(auth(actor.token))
    .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' });
  if (res.status !== 201) throw new Error(`photo upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.key as string;
}

/** Upload a PDF as `actor` (multipart field `document`); the storage key. */
export async function documentKey(app: Express, actor: { token: string }): Promise<string> {
  const res = await request(app)
    .post('/api/v1/field/uploads/document')
    .set(auth(actor.token))
    .attach('document', Buffer.from('%PDF-1.4 test document'), { filename: 'minutes.pdf', contentType: 'application/pdf' });
  if (res.status !== 201) throw new Error(`document upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.key as string;
}

/** Save field settings (merged into the defaults). */
export async function setFieldSettings(patch: FieldSettingsUpdate): Promise<void> {
  const { problems } = await updateFieldSettings(patch);
  if (problems.length > 0) throw new Error(`settings: ${problems.join('; ')}`);
}
