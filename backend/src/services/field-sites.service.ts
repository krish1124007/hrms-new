/**
 * Sites: the shared pieces behind /field/sites and the visit engine's
 * "pin a new site at check-in" — the create input, the create itself
 * (idempotent by `clientRef`), who may see which site, the API shape, and
 * the visit counters a check-in bumps.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { FieldSite, type IFieldSite, type SiteCreatedVia } from '../models/field-site.model.js';
import { Employee } from '../models/employee.model.js';
import { AppError, ForbiddenError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { idOf } from '../lib/access.js';
import { fieldScope, scopeIncludes, type FieldScope } from '../lib/field-scope.js';
import { fieldFileRef } from '../lib/field-files.js';
import { acceptCapturedAt } from '../lib/offline-capture.js';
import { withClientRef } from '../lib/client-ref.js';
import { objectIdString } from '../lib/field-utils.js';
import { getFieldSettings, type FieldSettings } from './field-settings.service.js';
import { googleMaps } from './google-maps.service.js';

/* ── Input ── */

export const MIN_SITE_RADIUS_M = 10;
export const MAX_SITE_RADIUS_M = 5000;

export const latLngSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accuracy: z.coerce.number().min(0).optional(),
  })
  .refine((p) => !(p.lat === 0 && p.lng === 0), 'A location of 0,0 is a missing GPS fix');

const text = (max: number) => z.string().trim().max(max);

/** `{ line1, city, state, pincode }`, or a single line (line1). */
export const addressInputSchema = z.union([
  z.object({
    line1: text(300).optional(),
    city: text(100).optional(),
    state: text(100).optional(),
    pincode: text(20).optional(),
  }),
  text(300).transform((line1) => ({ line1 })),
]);

/** The fields of a new site — POST /sites without `clientRef`, and a check-in's `newSite`. */
export const newSiteSchema = z.object({
  capturedAt: z.string().trim().max(40).optional(),
  name: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(60),
  location: latLngSchema,
  radiusM: z.coerce.number().int().min(MIN_SITE_RADIUS_M).max(MAX_SITE_RADIUS_M).optional(),
  address: addressInputSchema.optional(),
  contactName: text(200).optional(),
  contactPhone: text(30).optional(),
  notes: text(5000).optional(),
  /** Upload key from POST /field/uploads/photo. */
  photo: z.string().trim().min(1).max(300).optional(),
  assignedTo: z.array(objectIdString).max(100).optional(),
});
export type NewSiteInput = z.infer<typeof newSiteSchema>;

/** POST /field/sites. `clientRef` (UUID) makes the create idempotent; the mobile app always sends it. */
export const createSiteSchema = newSiteSchema.extend({
  clientRef: z.string().trim().uuid().optional(),
});

/* ── Output ── */

interface PersonLike {
  _id: unknown;
  firstName?: string;
  lastName?: string;
  employeeId?: string;
}

const isPopulated = (p: unknown): p is PersonLike =>
  p !== null && typeof p === 'object' && !(p instanceof Types.ObjectId) && 'firstName' in p;

/** `[lng, lat]` → `{ lat, lng }`, or null. */
export function siteLatLng(location: unknown): { lat: number; lng: number } | null {
  const coords = (location as { coordinates?: unknown } | null | undefined)?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) return null;
  const [lng, lat] = coords.map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat!, lng: lng! } : null;
}

export interface SiteJson {
  _id: string;
  clientRef: string | null;
  name: string;
  type: string;
  address: { line1: string; city: string; state: string; pincode: string };
  location: { lat: number; lng: number } | null;
  radiusM: number;
  contactName: string;
  contactPhone: string;
  notes: string;
  photoUrl?: string;
  assignedTo: Array<{ _id: string; firstName: string; lastName: string; employeeId: string }>;
  createdBy: { _id: string; firstName: string; lastName: string } | null;
  createdVia: SiteCreatedVia;
  lastVisitAt: Date | null;
  visitCount: number;
  distanceM?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * The API shape of a site (a lean object or a document) with `assignedTo`
 * (`firstName lastName employeeId`) and `createdBy` (`firstName lastName`)
 * populated; unpopulated references are left out.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeSite(raw: any): SiteJson {
  const s = typeof raw?.toObject === 'function' ? raw.toObject({ depopulate: false }) : raw;
  const creator = isPopulated(s.createdBy) ? s.createdBy : null;
  return {
    _id: String(s._id),
    clientRef: s.clientRef ?? null,
    name: s.name,
    type: s.type,
    address: {
      line1: s.address?.line1 ?? '',
      city: s.address?.city ?? '',
      state: s.address?.state ?? '',
      pincode: s.address?.pincode ?? '',
    },
    location: siteLatLng(s.location),
    radiusM: s.radiusM,
    contactName: s.contactName ?? '',
    contactPhone: s.contactPhone ?? '',
    notes: s.notes ?? '',
    ...(s.photo ? { photoUrl: s.photo as string } : {}),
    assignedTo: ((s.assignedTo ?? []) as unknown[]).filter(isPopulated).map((e) => ({
      _id: String(e._id),
      firstName: e.firstName ?? '',
      lastName: e.lastName ?? '',
      employeeId: e.employeeId ?? '',
    })),
    createdBy: creator
      ? { _id: String(creator._id), firstName: creator.firstName ?? '', lastName: creator.lastName ?? '' }
      : null,
    createdVia: s.createdVia ?? 'web',
    lastVisitAt: s.lastVisitAt ?? null,
    visitCount: s.visitCount ?? 0,
    ...(typeof s.distanceM === 'number' ? { distanceM: Math.round(s.distanceM) } : {}),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export const SITE_POPULATE = [
  { path: 'assignedTo', select: 'firstName lastName employeeId' },
  { path: 'createdBy', select: 'firstName lastName' },
];

/* ── Visibility ── */

/**
 * Sites the caller may see: a field manager every site; anyone else the
 * sites assigned to them or their direct reports, and the ones they created.
 */
export function siteScopeFilter(req: Request, scope: FieldScope): Record<string, unknown> {
  if (scope.employeeIds === 'all') return {};
  const or: Record<string, unknown>[] = [{ assignedTo: { $in: scope.employeeIds } }];
  if (req.user?._id) or.push({ createdBy: new Types.ObjectId(String(req.user._id)) });
  return { $or: or };
}

/** True when the caller may see `site` (by `siteScopeFilter`'s rule). */
export function canSeeSite(req: Request, scope: FieldScope, site: Pick<IFieldSite, 'assignedTo' | 'createdBy'>): boolean {
  if (scope.employeeIds === 'all') return true;
  if (site.createdBy && req.user?._id && idOf(site.createdBy) === String(req.user._id)) return true;
  return (site.assignedTo ?? []).some((e) => scopeIncludes(scope, e));
}

/** A live site by id, or 404. */
export async function loadSite(id: string) {
  const site = Types.ObjectId.isValid(id) ? await FieldSite.findById(id).exec() : null;
  if (!site) throw new NotFoundError('Site not found');
  return site;
}

/** 403 unless the caller may see `site`. */
export async function assertSiteRead(req: Request, site: Pick<IFieldSite, 'assignedTo' | 'createdBy'>): Promise<void> {
  if (!canSeeSite(req, await fieldScope(req), site)) {
    throw new ForbiddenError('This site is not assigned to you or your team');
  }
}

/* ── Create ── */

/** The settings' spelling of `type`, or 400 `INVALID_SITE_TYPE`. */
export function canonicalSiteType(type: string, settings: FieldSettings): string {
  const match = settings.siteTypes.find((t) => t.toLowerCase() === type.trim().toLowerCase());
  if (!match) {
    throw new AppError(
      `"${type}" is not a site type. Use one of: ${settings.siteTypes.join(', ')}`,
      400,
      'INVALID_SITE_TYPE',
    );
  }
  return match;
}

/**
 * The employees a site may be assigned to by this caller: existing employees,
 * and — unless the caller manages the field — only themselves or their direct
 * reports (403 otherwise).
 */
export async function checkAssignees(scope: FieldScope, ids: readonly string[]): Promise<Types.ObjectId[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const found = await Employee.find({ _id: { $in: unique } }).select('_id').lean().exec();
  if (found.length !== unique.length) throw new ValidationAppError('assignedTo names an unknown employee');
  if (!unique.every((id) => scopeIncludes(scope, id))) {
    throw new ForbiddenError('You can only assign sites to yourself or your direct reports');
  }
  return unique.map((id) => new Types.ObjectId(id));
}

const blankAddress = (a?: { line1?: string; city?: string; state?: string; pincode?: string }): boolean =>
  !a || ![a.line1, a.city, a.state, a.pincode].some((v) => v && v.trim() !== '');

/**
 * Create a site for the caller (idempotent by `clientRef`, per creator).
 * The creator, when they have an employee record, is always assigned.
 * Without an address, the pin is reverse-geocoded (when Google is set up).
 * A replay returns the stored site with `created: false`.
 */
export async function createFieldSite(
  req: Request,
  input: NewSiteInput,
  opts: { clientRef?: string; createdVia: SiteCreatedVia },
): Promise<{ site: IFieldSite; created: boolean }> {
  const settings = await getFieldSettings();
  const scope = await fieldScope(req);
  const createdBy = req.user?._id ? new Types.ObjectId(String(req.user._id)) : undefined;

  const run = async () => {
    const capturedAt = input.capturedAt !== undefined ? acceptCapturedAt(input.capturedAt, settings) : undefined;
    const type = canonicalSiteType(input.type, settings);
    const assignees = await checkAssignees(scope, input.assignedTo ?? []);
    if (scope.self && !assignees.some((id) => id.equals(scope.self!))) assignees.unshift(scope.self);
    const photo = input.photo ? await fieldFileRef(input.photo, 'photo') : undefined;
    let address = input.address && !blankAddress(input.address) ? input.address : undefined;
    if (!address && googleMaps.isConfigured()) {
      address = (await googleMaps.reverseGeocode(input.location.lat, input.location.lng)) ?? undefined;
    }
    return FieldSite.create({
      ...(opts.clientRef ? { clientRef: opts.clientRef } : {}),
      name: input.name,
      type,
      address: address ?? {},
      location: { type: 'Point', coordinates: [input.location.lng, input.location.lat] },
      radiusM: input.radiusM ?? settings.defaultSiteRadiusM,
      contactName: input.contactName || undefined,
      contactPhone: input.contactPhone || undefined,
      notes: input.notes || undefined,
      photo,
      assignedTo: assignees,
      createdBy,
      createdVia: opts.createdVia,
      capturedAt,
    });
  };

  const { doc, created } = await withClientRef(FieldSite, opts.clientRef, run, createdBy ? { createdBy } : {});
  return { site: doc, created };
}

/* ── Visit counters ── */

/** A check-in at `siteId` happened at `at`: one more visit, and `lastVisitAt` moves forward (never back). */
export async function recordSiteVisit(siteId: unknown, at: Date): Promise<void> {
  await FieldSite.updateOne(
    { _id: idOf(siteId) },
    { $inc: { visitCount: 1 }, $max: { lastVisitAt: at } },
  ).exec();
}
