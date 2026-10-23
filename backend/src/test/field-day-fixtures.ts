/**
 * Fixtures for the team / route / travel / reports tests: actors, sites, a
 * day's attendance check-in/out and visits, all written straight through the
 * models (no visit engine involved).
 */
import { createUser, createEmployeeFor, type RoleSlug } from './factories.js';
import type { IUser } from '../models/user.model.js';
import type { IEmployee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { FieldSite, type IFieldSite } from '../models/field-site.model.js';
import { Visit, type IVisit, type IVisitFlags, type IVisitReport } from '../models/visit.model.js';
import { atBusinessTime } from '../lib/business-day.js';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The instant the IST wall clock reads `hhmm` on calendar day `day` (YYYY-MM-DD). */
export const ist = (day: string, hhmm: string): Date => atBusinessTime(new Date(`${day}T00:00:00Z`), hhmm);

/** The attendance day label (UTC midnight) of `day`. */
export const dayLabel = (day: string): Date => new Date(`${day}T00:00:00Z`);

/** Places around Mumbai, a few km apart. */
export const PLACES = {
  home: { lat: 19.076, lng: 72.8777 },
  siteA: { lat: 19.1197, lng: 72.8468 },
  siteB: { lat: 19.2183, lng: 72.9781 },
  siteC: { lat: 19.0330, lng: 73.0297 },
} as const;

/** `p` moved about `metres` north. */
export const north = (p: LatLng, metres: number): LatLng => ({ lat: p.lat + metres / 111_320, lng: p.lng });

export async function actor(roleSlug: RoleSlug, fields: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user, { lastName: 'Test', ...fields });
  return { user, token, employee };
}

export async function makeSite(name: string, at: LatLng, extra: Partial<Record<keyof IFieldSite, unknown>> = {}): Promise<IFieldSite> {
  return FieldSite.create({
    name,
    type: 'Client office',
    location: { type: 'Point', coordinates: [at.lng, at.lat] },
    radiusM: 200,
    createdVia: 'web',
    ...extra,
  });
}

/** The day's attendance check-in (`at` null: no GPS fix). */
export async function dayIn(who: Actor, day: string, hhmm: string, at: LatLng | null): Promise<void> {
  await Attendance.create({
    employeeId: who.employee._id,
    date: dayLabel(day),
    status: 'present',
    checkIn: { time: ist(day, hhmm), method: 'manual', ...(at ? { location: { ...at, accuracy: 10 } } : {}) },
  });
}

/** The day's attendance check-out on the row `dayIn` made. */
export async function dayOut(who: Actor, day: string, hhmm: string, at: LatLng | null): Promise<void> {
  await Attendance.updateOne(
    { employeeId: who.employee._id, date: dayLabel(day) },
    { $set: { checkOut: { time: ist(day, hhmm), method: 'manual', ...(at ? { location: { ...at, accuracy: 10 } } : {}) } } },
  );
}

export interface VisitOpts {
  /** Check-in time `HH:mm` (absent: a planned / missed visit). */
  in?: string;
  /** Check-out time `HH:mm` (absent: still in progress). */
  out?: string;
  /** Where the check-in was made; default the site's pin; null = no GPS. */
  inAt?: LatLng | null;
  /** Where the check-out was made; default the check-in point; null = no GPS. */
  outAt?: LatLng | null;
  status?: IVisit['status'];
  purpose?: string;
  flags?: Partial<IVisitFlags>;
  report?: Partial<IVisitReport>;
  plannedDate?: string;
  checkInDistanceM?: number;
}

export async function visitAt(who: Actor, site: IFieldSite, day: string, opts: VisitOpts = {}): Promise<IVisit> {
  const pin = site.location ? { lat: site.location.coordinates[1], lng: site.location.coordinates[0] } : null;
  const inAt = opts.inAt === undefined ? pin : opts.inAt;
  const outAt = opts.outAt === undefined ? inAt : opts.outAt;
  const checkInTime = opts.in ? ist(day, opts.in) : undefined;
  const checkOutTime = opts.out ? ist(day, opts.out) : undefined;
  const status = opts.status ?? (!opts.in ? 'planned' : opts.out ? 'completed' : 'in_progress');
  return Visit.create({
    employeeId: who.employee._id,
    siteId: site._id,
    purpose: opts.purpose ?? 'other',
    status,
    ...(opts.plannedDate ? { plannedDate: dayLabel(opts.plannedDate) } : {}),
    ...(checkInTime
      ? {
          checkIn: {
            time: checkInTime,
            ...(inAt ? { location: { ...inAt, accuracy: 10 } } : {}),
            ...(opts.checkInDistanceM !== undefined ? { distanceM: opts.checkInDistanceM } : {}),
          },
        }
      : {}),
    ...(checkOutTime
      ? { checkOut: { time: checkOutTime, ...(outAt ? { location: { ...outAt, accuracy: 10 } } : {}) } }
      : {}),
    ...(checkInTime && checkOutTime
      ? { durationMinutes: Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60_000) }
      : {}),
    flags: { ...(opts.flags ?? {}) },
    ...(opts.report ? { report: opts.report } : {}),
  });
}

/** supertest parser that keeps a binary body (xlsx / pdf) as a Buffer. */
export function binaryParser(res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
