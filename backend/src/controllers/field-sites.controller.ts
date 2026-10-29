/**
 * /field/sites — the places field employees visit.
 *
 * Visibility (`services/field-sites.service.ts`): `field.manage` sees every
 * site; a `field.view` holder the sites assigned to them or their direct
 * reports and the ones they created. Anyone with `field.view` may pin a site
 * (it is assigned to them); the creator may correct it for 24 hours, a field
 * manager at any time. Only field managers delete and import.
 */
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import type { FileFilterCallback } from 'multer';
import { Types, type PipelineStage } from 'mongoose';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { serializeVisit, VISIT_POPULATE } from '../services/field-visits.service.js';
import { Employee } from '../models/employee.model.js';
import { AppError, ForbiddenError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { idOf } from '../lib/access.js';
import { canManageField, fieldScope, scopeFilter } from '../lib/field-scope.js';
import { fieldAccessFor, type NoFieldAccessReason } from '../lib/field-access.js';
import { fieldFileRef } from '../lib/field-files.js';
import { escapeRegex, objectIdString, pageParams } from '../lib/field-utils.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import {
  MAX_SITE_RADIUS_M,
  MIN_SITE_RADIUS_M,
  SITE_POPULATE,
  addressInputSchema,
  assertSiteRead,
  canonicalSiteType,
  checkAssignees,
  createFieldSite,
  createSiteSchema,
  latLngSchema,
  loadSite,
  serializeSite,
  siteScopeFilter,
} from '../services/field-sites.service.js';

export { createSiteSchema } from '../services/field-sites.service.js';

/** The creator may edit their site for this long after creating it. */
export const CREATOR_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Most pins one map request returns. */
export const SITES_MAP_LIMIT = 500;
/** Most data rows one import takes. */
export const IMPORT_MAX_ROWS = 2000;

/* ── Schemas ── */

/** `lat,lng`. */
const nearSchema = z.string().transform((s, ctx) => {
  const [lat, lng, ...rest] = s.split(',').map((p) => (p.trim() === '' ? Number.NaN : Number(p)));
  if (rest.length > 0 || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat!) > 90 || Math.abs(lng!) > 180) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'near must be lat,lng' });
    return z.NEVER;
  }
  return { lat: lat!, lng: lng! };
});

/** `minLng,minLat,maxLng,maxLat` (as Leaflet's `toBBoxString()` writes it). */
const bboxSchema = z.string().transform((s, ctx) => {
  const parts = s.split(',').map((p) => (p.trim() === '' ? Number.NaN : Number(p)));
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  const ok =
    parts.length === 4 &&
    parts.every(Number.isFinite) &&
    minLng >= -180 &&
    maxLng <= 180 &&
    minLat >= -90 &&
    maxLat <= 90 &&
    minLng <= maxLng &&
    minLat <= maxLat;
  if (!ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bbox must be minLng,minLat,maxLng,maxLat' });
    return z.NEVER;
  }
  return { minLng, minLat, maxLng, maxLat };
});

export const listQuerySchema = z.object({
  ...pageParams,
  search: z.string().trim().max(100).optional(),
  type: z.string().trim().max(60).optional(),
  assignedTo: objectIdString.optional(),
  near: nearSchema.optional(),
  radiusKm: z.coerce.number().positive().max(1000).optional(),
});

export const mapQuerySchema = z.object({ bbox: bboxSchema.optional() });

/** `null` clears an optional text field or the photo. `assignedTo` (replaces the list) is for field managers. */
export const updateSiteSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  type: z.string().trim().min(1).max(60).optional(),
  location: latLngSchema.optional(),
  radiusM: z.coerce.number().int().min(MIN_SITE_RADIUS_M).max(MAX_SITE_RADIUS_M).optional(),
  address: addressInputSchema.nullable().optional(),
  contactName: z.string().trim().max(200).nullable().optional(),
  contactPhone: z.string().trim().max(30).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  photo: z.string().trim().min(1).max(300).nullable().optional(),
  assignedTo: z.array(objectIdString).max(100).optional(),
});

/* ── Handlers ── */

/**
 * GET /field/sites — paginated, by name; with `near=lat,lng` nearest first,
 * each with `distanceM` (within `radiusKm` when given).
 */
export async function listSites(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const scope = await fieldScope(req);
  const and: Record<string, unknown>[] = [siteScopeFilter(req, scope)];
  if (q.type) and.push({ type: q.type });
  if (q.assignedTo) and.push({ assignedTo: new Types.ObjectId(q.assignedTo) });
  if (q.search) {
    const pattern = { $regex: escapeRegex(q.search), $options: 'i' };
    and.push({ $or: [{ name: pattern }, { 'address.line1': pattern }, { 'address.city': pattern }, { contactName: pattern }] });
  }
  const filter = { $and: and };
  const skip = (q.page - 1) * q.limit;

  let rows: unknown[];
  let total: number;
  if (q.near) {
    const pipeline: PipelineStage[] = [
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [q.near.lng, q.near.lat] },
          distanceField: 'distanceM',
          spherical: true,
          key: 'location',
          // Aggregations skip the soft-delete hook.
          query: { ...filter, isDeleted: { $ne: true } },
          ...(q.radiusKm ? { maxDistance: q.radiusKm * 1000 } : {}),
        },
      },
      { $facet: { data: [{ $skip: skip }, { $limit: q.limit }], total: [{ $count: 'n' }] } },
    ];
    const [result] = await FieldSite.aggregate<{ data: unknown[]; total: Array<{ n: number }> }>(pipeline);
    rows = await FieldSite.populate(result?.data ?? [], SITE_POPULATE);
    total = result?.total[0]?.n ?? 0;
  } else {
    [rows, total] = await Promise.all([
      FieldSite.find(filter).sort({ name: 1, _id: 1 }).skip(skip).limit(q.limit).populate(SITE_POPULATE).lean().exec(),
      FieldSite.countDocuments(filter).exec(),
    ]);
  }
  res.json({
    success: true,
    data: rows.map(serializeSite),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 },
  });
}

/**
 * GET /field/sites/map?bbox= — located sites inside the box (all without
 * `bbox`), by name, at most 500: `{ _id, name, type, location, radiusM,
 * lastVisitAt }`; `truncated` says whether more exist.
 */
export async function sitesMap(req: Request, res: Response): Promise<void> {
  const { bbox } = req.query as unknown as z.infer<typeof mapQuerySchema>;
  const scope = await fieldScope(req);
  const where = bbox
    ? {
        'location.coordinates.0': { $gte: bbox.minLng, $lte: bbox.maxLng },
        'location.coordinates.1': { $gte: bbox.minLat, $lte: bbox.maxLat },
      }
    : { 'location.coordinates.1': { $exists: true } };
  const docs = await FieldSite.find({ $and: [siteScopeFilter(req, scope), where] })
    .sort({ name: 1, _id: 1 })
    .limit(SITES_MAP_LIMIT + 1)
    .select('name type location radiusM lastVisitAt')
    .lean()
    .exec();
  const pins = docs.slice(0, SITES_MAP_LIMIT).map((s) => {
    const full = serializeSite(s);
    return { _id: full._id, name: full.name, type: full.type, location: full.location, radiusM: full.radiusM, lastVisitAt: full.lastVisitAt };
  });
  res.json({ success: true, data: pins, truncated: docs.length > SITES_MAP_LIMIT });
}

const RECENT_VISITS = 10;

/** GET /field/sites/:id — the site and its latest visits the caller may see. */
export async function getSite(req: Request, res: Response): Promise<void> {
  const site = await loadSite(String(req.params.id));
  await assertSiteRead(req, site);
  const scope = await fieldScope(req);
  await site.populate(SITE_POPULATE);
  // History: visits that happened (or were missed); not plans or cancellations.
  const visits = await Visit.find({ siteId: site._id, status: { $nin: ['planned', 'cancelled'] }, ...scopeFilter(scope) })
    .sort({ day: -1, 'checkIn.time': -1, createdAt: -1 })
    .limit(RECENT_VISITS)
    .populate(VISIT_POPULATE)
    .lean()
    .exec();
  // The same shape as GET /field/visits.
  const recentVisits = visits.map(serializeVisit);
  res.json({ success: true, data: { ...serializeSite(site), recentVisits } });
}

/**
 * POST /field/sites — pin a site (any field employee). Idempotent by
 * `clientRef`: a replay answers 200 with the stored site. `createdVia` is
 * `mobile_pin` when the request carries a `clientRef` (the app always does),
 * `web` otherwise.
 */
export async function createSite(req: Request, res: Response): Promise<void> {
  const { clientRef, ...input } = req.body as z.infer<typeof createSiteSchema>;
  const { site, created } = await createFieldSite(req, input, {
    clientRef,
    createdVia: clientRef ? 'mobile_pin' : 'web',
  });
  if (created) void audit({ action: 'create', entity: 'FieldSite', entityId: String(site._id) });
  await site.populate(SITE_POPULATE);
  res.status(created ? 201 : 200).json({ success: true, data: serializeSite(site) });
}

/** PATCH /field/sites/:id — the creator within 24 h, or a field manager. */
export async function updateSite(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateSiteSchema>;
  const site = await loadSite(String(req.params.id));
  const manager = canManageField(req);
  if (!manager) {
    const mine = site.createdBy !== undefined && idOf(site.createdBy) === String(req.user?._id);
    if (!mine) throw new ForbiddenError('Only the person who pinned this site, or a field manager, can edit it');
    if (Date.now() - site.createdAt.getTime() > CREATOR_EDIT_WINDOW_MS) {
      throw new AppError('A site can be corrected by its creator for 24 hours — ask a field manager', 403, 'EDIT_WINDOW_CLOSED');
    }
    if (body.assignedTo !== undefined) throw new ForbiddenError('Only a field manager can assign sites');
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.type !== undefined) set.type = canonicalSiteType(body.type, await getFieldSettings());
  if (body.location) set.location = { type: 'Point', coordinates: [body.location.lng, body.location.lat] };
  if (body.radiusM !== undefined) set.radiusM = body.radiusM;
  if (body.address === null) set.address = {};
  else if (body.address) for (const [k, v] of Object.entries(body.address)) set[`address.${k}`] = v;
  for (const key of ['contactName', 'contactPhone', 'notes'] as const) {
    if (body[key] === null) unset[key] = '';
    else if (body[key] !== undefined) set[key] = body[key];
  }
  if (body.photo === null) unset.photo = '';
  else if (body.photo) set.photo = await fieldFileRef(body.photo, 'photo', { userId: req.user?._id, keep: [site.photo] });
  if (body.assignedTo !== undefined) set.assignedTo = await checkAssignees(await fieldScope(req), body.assignedTo);

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;
  const doc =
    Object.keys(update).length > 0
      ? await FieldSite.findByIdAndUpdate(site._id, update, { new: true, runValidators: true }).populate(SITE_POPULATE).exec()
      : await site.populate(SITE_POPULATE);
  if (!doc) throw new AppError('The site was deleted meanwhile', 404, 'NOT_FOUND');
  void audit({ action: 'update', entity: 'FieldSite', entityId: String(site._id) });
  res.json({ success: true, data: serializeSite(doc) });
}

/** DELETE /field/sites/:id (field managers) — soft delete; visits keep pointing at it. */
export async function deleteSite(req: Request, res: Response): Promise<void> {
  const site = await loadSite(String(req.params.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (site as any).softDelete({ by: req.user?._id });
  void audit({ action: 'delete', entity: 'FieldSite', entityId: String(site._id) });
  res.json({ success: true, message: 'Site deleted' });
}

/* ── Excel import ── */

const SHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);

/** multer filter: spreadsheets only. */
export function sheetFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  if (SHEET_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
    cb(null, true);
    return;
  }
  cb(new AppError('Upload an Excel (.xlsx, .xls) or CSV file', 400, 'UNSUPPORTED_FILE_TYPE'));
}

/** Maps multer's own errors onto 400s. */
export function importUploadErrors(err: unknown, _req: Request, _res: Response, next: NextFunction): void {
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
    const code = (err as { code?: string }).code;
    next(
      code === 'LIMIT_FILE_SIZE'
        ? new AppError('The file can be at most 10 MB', 400, 'FILE_TOO_LARGE')
        : new ValidationAppError('Send the spreadsheet as a multipart "file" field'),
    );
    return;
  }
  next(err);
}

/** Column header (any case, spaces or punctuation) → field. */
const COLUMNS: Record<string, string> = {
  name: 'name',
  sitename: 'name',
  type: 'type',
  sitetype: 'type',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  pin: 'pincode',
  latitude: 'lat',
  lat: 'lat',
  longitude: 'lng',
  lng: 'lng',
  long: 'lng',
  radius: 'radius',
  radiusm: 'radius',
  contactname: 'contactName',
  contactphone: 'contactPhone',
  assignedemployeeids: 'assigned',
  assignedemployeeid: 'assigned',
  assignedto: 'assigned',
};

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** The codes in an "Assigned employee IDs" cell (comma, semicolon or space separated). */
const splitCodes = (s: string | undefined): string[] => (s ?? '').split(/[,;\s]+/).filter(Boolean);

/** `EMP-046`, `emp_46`, `EMP000046` → `EMP#46`: the letters, then the number without separators or leading zeros. */
const looseCode = (code: string): string | null => {
  const m = /^([A-Z]*)[._/-]*0*(\d+)$/.exec(code.toUpperCase());
  return m ? `${m[1]}#${m[2]}` : null;
};

type ImportEmployee = { _id: Types.ObjectId; employeeId?: string; firstName?: string; lastName?: string };

/**
 * Employee code (or `_id`) → the employee it names. An exact code in any case
 * wins; otherwise one that differs only in separators or zero-padding
 * (`Emp-46` for `EMP000046`). A code that fits two employees is never guessed.
 */
function employeeCodeResolver(
  employees: readonly ImportEmployee[],
): (code: string) => { employee: ImportEmployee } | { problem: string } {
  const exact = new Map<string, ImportEmployee[]>();
  const loose = new Map<string, ImportEmployee[]>();
  const add = (map: Map<string, ImportEmployee[]>, key: string, e: ImportEmployee) => map.set(key, [...(map.get(key) ?? []), e]);
  for (const e of employees) {
    add(exact, String(e._id).toUpperCase(), e);
    const code = e.employeeId?.trim();
    if (!code) continue;
    add(exact, code.toUpperCase(), e);
    const key = looseCode(code);
    if (key) add(loose, key, e);
  }
  return (code) => {
    const key = looseCode(code);
    for (const hits of [exact.get(code.toUpperCase()), key ? loose.get(key) : undefined]) {
      if (hits?.length === 1) return { employee: hits[0]! };
      if (hits && hits.length > 1) return { problem: 'matches more than one employee — use the exact code' };
    }
    return { problem: 'no employee has this ID' };
  };
}

const NO_FIELD_ACCESS_NOTE: Record<NoFieldAccessReason, string> = {
  no_login: 'no login account, so they cannot use Field Visits',
  no_permission: 'no Field Visits access — give them the Field Employee role',
};

/**
 * POST /field/sites/import (multipart `file`: .xlsx/.xls/.csv) — columns Name,
 * Type, Address, City, State, Pincode, Latitude, Longitude, Radius, Contact
 * name, Contact phone, Assigned employee IDs (employee codes, comma
 * separated). A row whose name matches one existing site (any case) updates
 * it; otherwise a site is created. Bad rows are skipped and reported by their
 * spreadsheet row number. An employee ID that names nobody, or someone who
 * cannot use Field Visits, is left out and noted, but the site still imports
 * (an update that leaves out every ID keeps the site's current assignees)
 * → `{ created, updated, errors: [{ row, message }], warnings: [{ row, message }] }`.
 */
export async function importSites(req: Request, res: Response): Promise<void> {
  if (!req.file) throw new ValidationAppError('No file uploaded — send the spreadsheet as a multipart "file" field');
  let sheet: XLSX.WorkSheet | undefined;
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  } catch {
    throw new AppError('The file could not be read as a spreadsheet', 400, 'UNREADABLE_FILE');
  }
  if (!sheet || !sheet['!ref']) throw new ValidationAppError('The spreadsheet is empty');
  const firstRow = XLSX.utils.decode_range(sheet['!ref']).s.r + 1; // 1-based
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  const header = (grid[0] ?? []).map((h) => COLUMNS[cell(h).toLowerCase().replace(/[^a-z]/g, '')] ?? null);
  if (!header.includes('name')) throw new ValidationAppError('The first row must be the column headers (Name, Type, …)');
  const body = grid.slice(1);
  if (body.length > IMPORT_MAX_ROWS) throw new ValidationAppError(`At most ${IMPORT_MAX_ROWS} rows per import`);

  const rows = body.map((values, i) => {
    const row: Record<string, string> = {};
    header.forEach((field, col) => {
      if (field) row[field] = cell(values[col]);
    });
    return { rowNumber: firstRow + 1 + i, row };
  });

  const settings = await getFieldSettings();
  // Codes are matched in memory (any case, loose padding), so every current
  // employee's code is read once — only when some row names one.
  const anyCodes = rows.some(({ row }) => splitCodes(row.assigned).length > 0);
  const employees: ImportEmployee[] = anyCodes
    ? await Employee.find({}).select('_id employeeId firstName lastName').lean<ImportEmployee[]>().exec()
    : [];
  const resolve = employeeCodeResolver(employees);
  const named = rows.flatMap(({ row }) =>
    splitCodes(row.assigned).flatMap((code) => {
      const hit = resolve(code);
      return 'employee' in hit ? [hit.employee._id] : [];
    }),
  );
  const access = await fieldAccessFor(named);
  const createdBy = req.user?._id ? new Types.ObjectId(String(req.user._id)) : undefined;

  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];

  for (const { rowNumber, row } of rows) {
    if (Object.values(row).every((v) => v === '')) continue;
    const fail = (message: string) => errors.push({ row: rowNumber, message });

    if (!row.name) {
      fail('Name is required');
      continue;
    }
    // A blank type is "Other" while that type exists.
    const wantedType = row.type || (settings.siteTypes.some((t) => t.toLowerCase() === 'other') ? 'Other' : '');
    if (!wantedType) {
      fail(`Type is required — one of: ${settings.siteTypes.join(', ')}`);
      continue;
    }
    let type: string;
    try {
      type = canonicalSiteType(wantedType, settings);
    } catch (err) {
      fail((err as Error).message);
      continue;
    }
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    if (
      row.lat === '' ||
      row.lng === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180 ||
      (lat === 0 && lng === 0)
    ) {
      fail('Latitude and Longitude must be valid coordinates');
      continue;
    }
    const radius = row.radius === '' || row.radius === undefined ? settings.defaultSiteRadiusM : Number(row.radius);
    if (!Number.isInteger(radius) || radius < MIN_SITE_RADIUS_M || radius > MAX_SITE_RADIUS_M) {
      fail(`Radius must be a whole number of metres from ${MIN_SITE_RADIUS_M} to ${MAX_SITE_RADIUS_M}`);
      continue;
    }
    // Each code: assigned, or left out with why. A bad code never costs the site.
    const assigned = new Map<string, Types.ObjectId>();
    const leftOut = new Map<string, string>();
    for (const code of splitCodes(row.assigned)) {
      const hit = resolve(code);
      if ('problem' in hit) {
        leftOut.set(code.toUpperCase(), `${code} — ${hit.problem}`);
        continue;
      }
      const { _id, firstName, lastName } = hit.employee;
      const noAccess = access.get(String(_id));
      if (noAccess) {
        const name = `${firstName ?? ''} ${lastName ?? ''}`.trim();
        leftOut.set(String(_id), `${code}${name ? ` (${name})` : ''} — ${NO_FIELD_ACCESS_NOTE[noAccess]}`);
      } else {
        assigned.set(String(_id), _id);
      }
    }
    const assignedTo = [...assigned.values()];

    const fields: Record<string, unknown> = {
      name: row.name.slice(0, 200),
      type,
      location: { type: 'Point', coordinates: [lng, lat] },
      radiusM: radius,
    };
    const address = { line1: row.address, city: row.city, state: row.state, pincode: row.pincode };
    for (const [k, v] of Object.entries(address)) if (v) fields[`address.${k}`] = v.slice(0, k === 'line1' ? 300 : 100);
    if (row.contactName) fields.contactName = row.contactName.slice(0, 200);
    if (row.contactPhone) fields.contactPhone = row.contactPhone.slice(0, 30);
    // The column replaces the assignees — unless every ID in it was left out.
    if (assignedTo.length > 0) fields.assignedTo = assignedTo;

    // eslint-disable-next-line no-await-in-loop
    const matches = await FieldSite.find({ name: { $regex: `^${escapeRegex(row.name)}$`, $options: 'i' } })
      .select('_id')
      .limit(2)
      .lean()
      .exec();
    if (matches.length > 1) {
      fail(`More than one site is named "${row.name}" — update it on the website`);
      continue;
    }
    try {
      if (matches.length === 1) {
        // An update keeps the stored type and radius unless the row gives them.
        if (!row.type) delete fields.type;
        if (row.radius === '' || row.radius === undefined) delete fields.radiusM;
        // eslint-disable-next-line no-await-in-loop
        await FieldSite.updateOne({ _id: matches[0]!._id }, { $set: fields }, { runValidators: true }).exec();
        updated += 1;
      } else {
        const doc: Record<string, unknown> = { createdBy, createdVia: 'web', assignedTo: [], address: {} };
        for (const [k, v] of Object.entries(fields)) {
          if (k.startsWith('address.')) (doc.address as Record<string, unknown>)[k.slice(8)] = v;
          else doc[k] = v;
        }
        // eslint-disable-next-line no-await-in-loop
        await FieldSite.create(doc);
        created += 1;
      }
    } catch (err) {
      fail((err as Error).message);
      continue;
    }
    if (leftOut.size > 0) {
      const kept = matches.length === 1 && assignedTo.length === 0 ? ". The site's current assignees were kept" : '';
      warnings.push({ row: rowNumber, message: `Not assigned: ${[...leftOut.values()].join('; ')}${kept}` });
    }
  }

  void audit({ action: 'create', entity: 'FieldSite', metadata: { import: true, created, updated, errors: errors.length, warnings: warnings.length } });
  res.json({ success: true, data: { created, updated, errors, warnings } });
}
