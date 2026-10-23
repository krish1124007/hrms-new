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
import { Types } from 'mongoose';
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
import { fieldFileRef } from '../lib/field-files.js';
import { escapeRegex, objectIdString, pageParams } from '../lib/field-utils.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { MAX_SITE_RADIUS_M, MIN_SITE_RADIUS_M, SITE_POPULATE, addressInputSchema, assertSiteRead, canonicalSiteType, checkAssignees, createFieldSite, latLngSchema, loadSite, serializeSite, siteScopeFilter, } from '../services/field-sites.service.js';
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
    if (rest.length > 0 || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'near must be lat,lng' });
        return z.NEVER;
    }
    return { lat: lat, lng: lng };
});
/** `minLng,minLat,maxLng,maxLat` (as Leaflet's `toBBoxString()` writes it). */
const bboxSchema = z.string().transform((s, ctx) => {
    const parts = s.split(',').map((p) => (p.trim() === '' ? Number.NaN : Number(p)));
    const [minLng, minLat, maxLng, maxLat] = parts;
    const ok = parts.length === 4 &&
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
export async function listSites(req, res) {
    const q = req.query;
    const scope = await fieldScope(req);
    const and = [siteScopeFilter(req, scope)];
    if (q.type)
        and.push({ type: q.type });
    if (q.assignedTo)
        and.push({ assignedTo: new Types.ObjectId(q.assignedTo) });
    if (q.search) {
        const pattern = { $regex: escapeRegex(q.search), $options: 'i' };
        and.push({ $or: [{ name: pattern }, { 'address.line1': pattern }, { 'address.city': pattern }, { contactName: pattern }] });
    }
    const filter = { $and: and };
    const skip = (q.page - 1) * q.limit;
    let rows;
    let total;
    if (q.near) {
        const pipeline = [
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
        const [result] = await FieldSite.aggregate(pipeline);
        rows = await FieldSite.populate(result?.data ?? [], SITE_POPULATE);
        total = result?.total[0]?.n ?? 0;
    }
    else {
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
export async function sitesMap(req, res) {
    const { bbox } = req.query;
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
export async function getSite(req, res) {
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
export async function createSite(req, res) {
    const { clientRef, ...input } = req.body;
    const { site, created } = await createFieldSite(req, input, {
        clientRef,
        createdVia: clientRef ? 'mobile_pin' : 'web',
    });
    if (created)
        void audit({ action: 'create', entity: 'FieldSite', entityId: String(site._id) });
    await site.populate(SITE_POPULATE);
    res.status(created ? 201 : 200).json({ success: true, data: serializeSite(site) });
}
/** PATCH /field/sites/:id — the creator within 24 h, or a field manager. */
export async function updateSite(req, res) {
    const body = req.body;
    const site = await loadSite(String(req.params.id));
    const manager = canManageField(req);
    if (!manager) {
        const mine = site.createdBy !== undefined && idOf(site.createdBy) === String(req.user?._id);
        if (!mine)
            throw new ForbiddenError('Only the person who pinned this site, or a field manager, can edit it');
        if (Date.now() - site.createdAt.getTime() > CREATOR_EDIT_WINDOW_MS) {
            throw new AppError('A site can be corrected by its creator for 24 hours — ask a field manager', 403, 'EDIT_WINDOW_CLOSED');
        }
        if (body.assignedTo !== undefined)
            throw new ForbiddenError('Only a field manager can assign sites');
    }
    const set = {};
    const unset = {};
    if (body.name !== undefined)
        set.name = body.name;
    if (body.type !== undefined)
        set.type = canonicalSiteType(body.type, await getFieldSettings());
    if (body.location)
        set.location = { type: 'Point', coordinates: [body.location.lng, body.location.lat] };
    if (body.radiusM !== undefined)
        set.radiusM = body.radiusM;
    if (body.address === null)
        set.address = {};
    else if (body.address)
        for (const [k, v] of Object.entries(body.address))
            set[`address.${k}`] = v;
    for (const key of ['contactName', 'contactPhone', 'notes']) {
        if (body[key] === null)
            unset[key] = '';
        else if (body[key] !== undefined)
            set[key] = body[key];
    }
    if (body.photo === null)
        unset.photo = '';
    else if (body.photo)
        set.photo = await fieldFileRef(body.photo, 'photo', { userId: req.user?._id, keep: [site.photo] });
    if (body.assignedTo !== undefined)
        set.assignedTo = await checkAssignees(await fieldScope(req), body.assignedTo);
    const update = {};
    if (Object.keys(set).length > 0)
        update.$set = set;
    if (Object.keys(unset).length > 0)
        update.$unset = unset;
    const doc = Object.keys(update).length > 0
        ? await FieldSite.findByIdAndUpdate(site._id, update, { new: true, runValidators: true }).populate(SITE_POPULATE).exec()
        : await site.populate(SITE_POPULATE);
    if (!doc)
        throw new AppError('The site was deleted meanwhile', 404, 'NOT_FOUND');
    void audit({ action: 'update', entity: 'FieldSite', entityId: String(site._id) });
    res.json({ success: true, data: serializeSite(doc) });
}
/** DELETE /field/sites/:id (field managers) — soft delete; visits keep pointing at it. */
export async function deleteSite(req, res) {
    const site = await loadSite(String(req.params.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await site.softDelete({ by: req.user?._id });
    void audit({ action: 'delete', entity: 'FieldSite', entityId: String(site._id) });
    res.json({ success: true, message: 'Site deleted' });
}
/* ── Excel import ── */
const SHEET_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
/** multer filter: spreadsheets only. */
export function sheetFileFilter(_req, file, cb) {
    if (SHEET_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
        cb(null, true);
        return;
    }
    cb(new AppError('Upload an Excel (.xlsx, .xls) or CSV file', 400, 'UNSUPPORTED_FILE_TYPE'));
}
/** Maps multer's own errors onto 400s. */
export function importUploadErrors(err, _req, _res, next) {
    if (err && typeof err === 'object' && err.name === 'MulterError') {
        const code = err.code;
        next(code === 'LIMIT_FILE_SIZE'
            ? new AppError('The file can be at most 10 MB', 400, 'FILE_TOO_LARGE')
            : new ValidationAppError('Send the spreadsheet as a multipart "file" field'));
        return;
    }
    next(err);
}
/** Column header (any case, spaces or punctuation) → field. */
const COLUMNS = {
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
const cell = (v) => (v === null || v === undefined ? '' : String(v).trim());
/**
 * POST /field/sites/import (multipart `file`: .xlsx/.xls/.csv) — columns Name,
 * Type, Address, City, State, Pincode, Latitude, Longitude, Radius, Contact
 * name, Contact phone, Assigned employee IDs (employee codes, comma
 * separated). A row whose name matches one existing site (any case) updates
 * it; otherwise a site is created. Bad rows are skipped and reported by their
 * spreadsheet row number → `{ created, updated, errors: [{ row, message }] }`.
 */
export async function importSites(req, res) {
    if (!req.file)
        throw new ValidationAppError('No file uploaded — send the spreadsheet as a multipart "file" field');
    let sheet;
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    }
    catch {
        throw new AppError('The file could not be read as a spreadsheet', 400, 'UNREADABLE_FILE');
    }
    if (!sheet || !sheet['!ref'])
        throw new ValidationAppError('The spreadsheet is empty');
    const firstRow = XLSX.utils.decode_range(sheet['!ref']).s.r + 1; // 1-based
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true, raw: true });
    const header = (grid[0] ?? []).map((h) => COLUMNS[cell(h).toLowerCase().replace(/[^a-z]/g, '')] ?? null);
    if (!header.includes('name'))
        throw new ValidationAppError('The first row must be the column headers (Name, Type, …)');
    const body = grid.slice(1);
    if (body.length > IMPORT_MAX_ROWS)
        throw new ValidationAppError(`At most ${IMPORT_MAX_ROWS} rows per import`);
    const rows = body.map((values, i) => {
        const row = {};
        header.forEach((field, col) => {
            if (field)
                row[field] = cell(values[col]);
        });
        return { rowNumber: firstRow + 1 + i, row };
    });
    const settings = await getFieldSettings();
    const codes = new Set();
    for (const { row } of rows)
        for (const code of (row.assigned ?? '').split(/[,;\s]+/).filter(Boolean))
            codes.add(code);
    const codeList = [...codes];
    const employees = codeList.length
        ? await Employee.find({
            $or: [
                { employeeId: { $in: codeList } },
                { _id: { $in: codeList.filter((c) => /^[a-f\d]{24}$/i.test(c)) } },
            ],
        })
            .select('_id employeeId')
            .lean()
            .exec()
        : [];
    const byCode = new Map();
    for (const e of employees) {
        if (e.employeeId)
            byCode.set(e.employeeId.toLowerCase(), e._id);
        byCode.set(String(e._id).toLowerCase(), e._id);
    }
    const createdBy = req.user?._id ? new Types.ObjectId(String(req.user._id)) : undefined;
    let created = 0;
    let updated = 0;
    const errors = [];
    for (const { rowNumber, row } of rows) {
        if (Object.values(row).every((v) => v === ''))
            continue;
        const fail = (message) => errors.push({ row: rowNumber, message });
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
        let type;
        try {
            type = canonicalSiteType(wantedType, settings);
        }
        catch (err) {
            fail(err.message);
            continue;
        }
        const lat = Number(row.lat);
        const lng = Number(row.lng);
        if (row.lat === '' ||
            row.lng === '' ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180 ||
            (lat === 0 && lng === 0)) {
            fail('Latitude and Longitude must be valid coordinates');
            continue;
        }
        const radius = row.radius === '' || row.radius === undefined ? settings.defaultSiteRadiusM : Number(row.radius);
        if (!Number.isInteger(radius) || radius < MIN_SITE_RADIUS_M || radius > MAX_SITE_RADIUS_M) {
            fail(`Radius must be a whole number of metres from ${MIN_SITE_RADIUS_M} to ${MAX_SITE_RADIUS_M}`);
            continue;
        }
        const wantedCodes = (row.assigned ?? '').split(/[,;\s]+/).filter(Boolean);
        const unknown = wantedCodes.filter((c) => !byCode.has(c.toLowerCase()));
        if (unknown.length > 0) {
            fail(`Unknown employee ID(s): ${unknown.join(', ')}`);
            continue;
        }
        const assignedTo = [...new Map(wantedCodes.map((c) => [String(byCode.get(c.toLowerCase())), byCode.get(c.toLowerCase())])).values()];
        const fields = {
            name: row.name.slice(0, 200),
            type,
            location: { type: 'Point', coordinates: [lng, lat] },
            radiusM: radius,
        };
        const address = { line1: row.address, city: row.city, state: row.state, pincode: row.pincode };
        for (const [k, v] of Object.entries(address))
            if (v)
                fields[`address.${k}`] = v.slice(0, k === 'line1' ? 300 : 100);
        if (row.contactName)
            fields.contactName = row.contactName.slice(0, 200);
        if (row.contactPhone)
            fields.contactPhone = row.contactPhone.slice(0, 30);
        if (wantedCodes.length > 0)
            fields.assignedTo = assignedTo;
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
                if (!row.type)
                    delete fields.type;
                if (row.radius === '' || row.radius === undefined)
                    delete fields.radiusM;
                // eslint-disable-next-line no-await-in-loop
                await FieldSite.updateOne({ _id: matches[0]._id }, { $set: fields }, { runValidators: true }).exec();
                updated += 1;
            }
            else {
                const doc = { createdBy, createdVia: 'web', assignedTo: [], address: {} };
                for (const [k, v] of Object.entries(fields)) {
                    if (k.startsWith('address.'))
                        doc.address[k.slice(8)] = v;
                    else
                        doc[k] = v;
                }
                // eslint-disable-next-line no-await-in-loop
                await FieldSite.create(doc);
                created += 1;
            }
        }
        catch (err) {
            fail(err.message);
        }
    }
    void audit({ action: 'create', entity: 'FieldSite', metadata: { import: true, created, updated, errors: errors.length } });
    res.json({ success: true, data: { created, updated, errors } });
}
//# sourceMappingURL=field-sites.controller.js.map