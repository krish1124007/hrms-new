import type { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Visit, VISIT_STATUSES, type IVisit, type IVisitFlags, type VisitStatus } from '../models/visit.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { Attendance } from '../models/attendance.model.js';
import { AppError, ForbiddenError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { logger } from '../config/logger.js';
import { currentEmployeeId } from '../lib/access.js';
import {
  assertEmployeeExists,
  assertEmployeeHasFieldAccess,
  assertFieldRead,
  listScopeFilter,
  requireOwnEmployeeId,
} from '../lib/field-access.js';
import { canManageField, fieldScope, noEmployeeProfile, scopeIncludes } from '../lib/field-scope.js';
import { fieldFileRef } from '../lib/field-files.js';
import { acceptCapturedAt, captureTimes } from '../lib/offline-capture.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { dateBound, distanceMeters, objectIdString, pageParams, sortParam } from '../lib/field-utils.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import {
  assertSiteRead,
  createFieldSite,
  loadSite,
  newSiteSchema,
  recordSiteVisit,
  siteLatLng,
} from '../services/field-sites.service.js';
import {
  CAPTURED_OFFLINE_AFTER_MS,
  REPORT_EDIT_WINDOW_MS,
  VISIT_POPULATE,
  autoCloseInstant,
  autoCloseOpenVisits,
  canonicalPurpose,
  compactUpdate,
  dayWindow,
  emptyFlags,
  ensureFollowUpVisit,
  labelFromYmd,
  loadVisitJson,
  notifyReportSubmitted,
  notifyVisitPlanned,
  pushReportRef,
  reportFieldsSchema,
  reportUpdate,
  resolveReport,
  serializeVisit,
  ymdOf,
  ymdSchema,
  type ResolvedReport,
} from '../services/field-visits.service.js';
import { ensureDayCheckIn, extendFieldDayCheckOut } from '../services/attendance-field-link.service.js';

/*
 * Visits (contract "Visits" / "My day"). Lifecycle: `planned` → `in_progress`
 * (check-in) → `completed` (check-out, or the nightly auto-close);
 * `planned → missed` (nightly); `planned | in_progress → cancelled`.
 *
 * Offline-safe: check-in, check-out and report edits carry `clientRef` (a
 * replay answers 200 with the stored visit, nothing is written twice) and
 * `capturedAt` (the device time, honoured within lib/offline-capture's
 * limits). No transactions: each change is a conditional write on the status
 * it expects.
 */

/* ── Input ── */

const clientRef = z.string().trim().uuid();
const capturedAt = z.string().trim().max(40);
const notes = z.string().trim().max(5000);

/** A GPS fix. 0,0 is a phone's missing fix — treated as no location. */
const fix = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accuracy: z.coerce.number().min(0).max(100_000).optional(),
  })
  .transform((p) => (p.lat === 0 && p.lng === 0 ? undefined : p));

/** `POST /visits/check-in`: exactly one of `visitId` (a planned visit) / `siteId` / `newSite` (pin + check in). */
export const checkInSchema = z
  .object({
    clientRef: clientRef.optional(),
    capturedAt: capturedAt.optional(),
    visitId: objectIdString.optional(),
    siteId: objectIdString.optional(),
    newSite: newSiteSchema.optional(),
    /** Required unless starting a planned visit (which has one). */
    purpose: z.string().trim().min(1).max(60).optional(),
    location: fix.optional(),
    /** Upload key from POST /field/uploads/photo. */
    selfieKey: z.string().trim().min(1).max(300).optional(),
    notes: notes.optional(),
  })
  .superRefine((b, ctx) => {
    const given = [b.visitId, b.siteId, b.newSite].filter((t) => t !== undefined).length;
    if (given !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['siteId'], message: 'Send exactly one of visitId, siteId or newSite' });
    }
    if (!b.visitId && !b.purpose) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purpose'], message: 'purpose is required' });
    }
  });

/** `POST /visits/:id/check-out`. */
export const checkOutSchema = z.object({
  clientRef: clientRef.optional(),
  capturedAt: capturedAt.optional(),
  location: fix.optional(),
  /** The work report (photos/documents as upload keys). */
  report: reportFieldsSchema.optional(),
  /** Check-out notes (kept apart from the report's). */
  notes: notes.optional(),
});

/** `PATCH /visits/:id/report` — any report fields; the rest stay as they are. */
export const reportPatchSchema = reportFieldsSchema.extend({
  clientRef: clientRef.optional(),
  capturedAt: capturedAt.optional(),
});

/** `POST /visits/plan`. */
export const planSchema = z.object({
  siteId: objectIdString,
  /** Omitted: the caller. */
  employeeId: objectIdString.optional(),
  plannedDate: ymdSchema,
  purpose: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().min(1).max(500) });

const statusList = z
  .string()
  .trim()
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.enum(VISIT_STATUSES as [VisitStatus, ...VisitStatus[]])).min(1));

export const listQuerySchema = z.object({
  ...pageParams,
  employeeId: objectIdString.optional(),
  siteId: objectIdString.optional(),
  /** One status, or several comma-separated. */
  status: statusList.optional(),
  purpose: z.string().trim().max(60).optional(),
  /** IST days (`YYYY-MM-DD`), inclusive; the visit's day (check-in, else planned). */
  from: dateBound('from').optional(),
  to: dateBound('to').optional(),
  sort: sortParam(['day', 'createdAt', 'checkIn.time', 'plannedDate']).optional(),
});

export const myDayQuerySchema = z.object({ date: ymdSchema.optional() });

/* ── Helpers ── */

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/** True when a duplicate-key error came from the unique index over `field`. */
function duplicateOn(err: unknown, field: string): boolean {
  if (!isDuplicateKey(err)) return false;
  const e = err as { keyPattern?: Record<string, unknown>; message?: unknown };
  if (e.keyPattern) return field in e.keyPattern;
  return typeof e.message === 'string' && e.message.includes(field);
}

function alreadyOpen(visitId?: unknown): AppError {
  return new AppError(
    'You already have a visit in progress — check out of it first',
    409,
    'VISIT_ALREADY_OPEN',
    visitId ? { visitId: String(visitId) } : undefined,
  );
}

function selfieUsed(): AppError {
  return new AppError('This selfie was already used for another check-in — take a new one', 409, 'SELFIE_ALREADY_USED');
}

/**
 * A capture made offline: `capturedAt` was sent and is more than 2 min older
 * than its arrival (the `capturedOffline` flag). Such a capture is checked
 * against what the settings and plans were when it was made: where they
 * changed since, it degrades instead of being refused (the mobile queue
 * gives up on a 4xx, and the visit would be lost).
 */
function wasCapturedOffline(sent: string | undefined, at: Date, receivedAt: Date): boolean {
  return sent !== undefined && receivedAt.getTime() - at.getTime() > CAPTURED_OFFLINE_AFTER_MS;
}

async function sendVisit(res: Response, id: unknown, status = 200): Promise<void> {
  const data = await loadVisitJson(id);
  if (!data) throw new NotFoundError('Visit not found');
  res.status(status).json({ success: true, data });
}

async function loadVisit(id: string) {
  const visit = Types.ObjectId.isValid(id) ? await Visit.findById(id).lean().exec() : null;
  if (!visit) throw new NotFoundError('Visit not found');
  return visit;
}

/** The visit this employee stored under `ref` (replays), or null. */
async function visitByRef(employeeId: Types.ObjectId, ref: string | undefined) {
  if (!ref) return null;
  return Visit.findOne({ employeeId, clientRef: ref }).setOptions({ withDeleted: true }).select('_id checkIn').lean().exec();
}

/** The first check-in of a day counts as attendance (setting). Never fails the visit. */
async function linkAttendance(
  employeeId: Types.ObjectId,
  visitId: unknown,
  point: { time?: Date; location?: { lat: number; lng: number; accuracy?: number } | null; photo?: string | null },
) {
  if (!point.time) return;
  try {
    await ensureDayCheckIn(employeeId, point.time, point.location ?? undefined, {
      method: 'field_visit',
      visitId: String(visitId),
      ...(point.photo ? { photo: point.photo } : {}),
    });
  } catch (err) {
    logger.error({ err, visitId: String(visitId) }, 'field visit: attendance check-in failed');
  }
}

/** A visit checked in at `inAt` was checked out at `out`: an auto-closed field attendance day may end later. Never fails. */
async function extendAttendance(employeeId: Types.ObjectId, visitId: unknown, inAt: Date, out: Date) {
  try {
    await extendFieldDayCheckOut(employeeId, inAt, out);
  } catch (err) {
    logger.error({ err, visitId: String(visitId) }, 'field visit: extending the attendance check-out failed');
  }
}

/** Notice + follow-up after a report was stored. */
async function afterReport(visitId: unknown, firstSubmission: boolean, plannedBy: unknown): Promise<void> {
  const visit = await Visit.findById(visitId).lean().exec();
  if (!visit?.report) return;
  if (firstSubmission) await notifyReportSubmitted(visit);
  try {
    await ensureFollowUpVisit(visit, plannedBy);
  } catch (err) {
    logger.error({ err, visitId: String(visitId) }, 'field visit: planning the follow-up failed');
  }
}

/* ── Reads ── */

/** GET /field/visits — scoped (self + direct reports; field.manage: all), newest day first. */
export async function listVisits(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = await listScopeFilter(req, q.employeeId);
  if (q.siteId) filter.siteId = new Types.ObjectId(q.siteId);
  if (q.status) filter.status = { $in: q.status };
  if (q.purpose) filter.purpose = q.purpose;
  if (q.from || q.to) {
    const day: Record<string, Date> = {};
    if (q.from) day.$gte = startOfBusinessDay(q.from);
    if (q.to) day.$lte = startOfBusinessDay(new Date(q.to.getTime() - 1));
    filter.day = day;
  }
  const plannedOnly = q.status?.length === 1 && q.status[0] === 'planned';
  const sort: Record<string, 1 | -1> = q.sort
    ? { [q.sort.replace(/^-/, '')]: q.sort.startsWith('-') ? -1 : 1, _id: -1 }
    : plannedOnly
      ? { day: 1, createdAt: 1 }
      : { day: -1, 'checkIn.time': -1, createdAt: -1 };
  const [rows, total] = await Promise.all([
    Visit.find(filter)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate(VISIT_POPULATE)
      .lean()
      .exec(),
    Visit.countDocuments(filter).exec(),
  ]);
  res.json({
    success: true,
    data: rows.map(serializeVisit),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 },
  });
}

/** GET /field/visits/:id */
export async function getVisit(req: Request, res: Response): Promise<void> {
  const visit = await loadVisit(String(req.params.id));
  await assertFieldRead(req, visit.employeeId);
  await sendVisit(res, visit._id);
}

/** GET /field/my-day?date= — the caller's day (default today, IST). */
export async function myDay(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof myDayQuerySchema>;
  const self = await requireOwnEmployeeId(req);
  const today = startOfBusinessDay();
  const label = q.date ? labelFromYmd(q.date) : today;
  const { start, end } = dayWindow(label);

  const [visits, tasks, attendance] = await Promise.all([
    Visit.find({ employeeId: self, day: label, status: { $ne: 'cancelled' } })
      .sort({ 'checkIn.time': 1, createdAt: 1 })
      .populate(VISIT_POPULATE)
      .lean()
      .exec(),
    FieldTask.find({
      assignedTo: self,
      $or: [
        { status: { $nin: ['completed', 'cancelled'] }, $or: [{ dueDate: null }, { dueDate: { $lt: end } }] },
        { status: 'completed', completedAt: { $gte: start, $lt: end } },
      ],
    })
      .sort({ dueDate: 1, createdAt: 1 })
      .limit(100)
      .populate({ path: 'siteId', select: 'name type address location radiusM' })
      .exec(),
    Attendance.findOne({ employeeId: self, date: label }).select('checkIn checkOut').lean().exec(),
  ]);

  const json = visits.map(serializeVisit);
  let inProgress = json.find((v) => v.status === 'in_progress') ?? null;
  if (!inProgress && label.getTime() === today.getTime()) {
    // Today also shows a visit still open from an earlier day (until it is closed).
    const open = await Visit.findOne({ employeeId: self, status: 'in_progress' })
      .sort({ 'checkIn.time': -1 })
      .populate(VISIT_POPULATE)
      .lean()
      .exec();
    inProgress = open ? serializeVisit(open) : null;
  }
  res.json({
    success: true,
    data: {
      date: ymdOf(label),
      inProgress,
      planned: json.filter((v) => v.status === 'planned'),
      completed: json.filter((v) => v.status === 'completed'),
      missed: json.filter((v) => v.status === 'missed'),
      tasks,
      attendance: {
        checkedInAt: attendance?.checkIn?.time ?? null,
        checkedOutAt: attendance?.checkOut?.time ?? null,
      },
    },
  });
}

/* ── Planning ── */

/**
 * POST /field/visits/plan — for the caller, or (field.view) one of their
 * direct reports, or (field.manage) anyone. The employee is told when someone
 * else planned it.
 */
export async function planVisit(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof planSchema>;
  const scope = await fieldScope(req);
  const employeeId = body.employeeId ?? (scope.self ? String(scope.self) : null);
  if (!employeeId) throw noEmployeeProfile();
  if (!scopeIncludes(scope, employeeId)) {
    throw new ForbiddenError('You can plan visits only for yourself and your direct reports');
  }
  await assertEmployeeExists(employeeId);
  await assertEmployeeHasFieldAccess(employeeId);
  const site = await loadSite(body.siteId);
  if (!scope.manage) await assertSiteRead(req, site);
  const label = labelFromYmd(body.plannedDate);
  if (label.getTime() < startOfBusinessDay().getTime()) {
    throw new AppError('A visit cannot be planned for a past day', 400, 'PLANNED_DATE_PAST');
  }
  const purpose = canonicalPurpose(body.purpose, await getFieldSettings());
  const plannerUserId = req.user?._id ? String(req.user._id) : null;
  const doc = await Visit.create({
    employeeId,
    siteId: site._id,
    purpose,
    status: 'planned',
    plannedDate: label,
    day: label,
    ...(plannerUserId ? { plannedBy: plannerUserId } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  });
  void audit({ action: 'create', entity: 'Visit', entityId: String(doc._id), after: { status: 'planned' } });
  await notifyVisitPlanned(doc, plannerUserId);
  await sendVisit(res, doc._id, 201);
}

/**
 * POST /field/visits/:id/cancel — the employee (planned / in progress), the
 * planner, their direct manager, or a field manager.
 */
export async function cancelVisit(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as z.infer<typeof cancelSchema>;
  const visit = await loadVisit(String(req.params.id));
  const scope = await fieldScope(req);
  const planner = visit.plannedBy && req.user?._id && String(visit.plannedBy) === String(req.user._id);
  if (!scope.manage && !planner && !scopeIncludes(scope, visit.employeeId)) {
    throw new ForbiddenError('You cannot cancel this visit');
  }
  const doc = await Visit.findOneAndUpdate(
    { _id: visit._id, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', cancelReason: reason, ...(req.user?._id ? { cancelledBy: req.user._id } : {}) } },
    { new: true },
  ).exec();
  if (!doc) throw new AppError(`A ${visit.status.replace('_', ' ')} visit cannot be cancelled`, 409, 'VISIT_CLOSED');
  void audit({ action: 'update', entity: 'Visit', entityId: String(doc._id), after: { status: 'cancelled', reason } });
  await sendVisit(res, doc._id);
}

/** DELETE /field/visits/:id (field.manage) — soft delete. */
export async function deleteVisit(req: Request, res: Response): Promise<void> {
  const doc = await Visit.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Visit not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete({ by: req.user?._id });
  void audit({ action: 'delete', entity: 'Visit', entityId: String(doc._id) });
  res.json({ success: true, message: 'Visit deleted' });
}

/* ── Check-in ── */

type LeanVisit = IVisit & { _id: Types.ObjectId };

/**
 * POST /field/visits/check-in — the caller starts a visit: a planned one
 * (`visitId`), at a site (`siteId`), or at a new site pinned in the same step
 * (`newSite`). Flags (never refusals): `awayFromSite` beyond the site radius,
 * `noGps`, `noSelfie` (when the selfie is optional), `syncedLate` /
 * `capturedOffline` for offline captures. A selfie is required unless the
 * settings say otherwise (400 SELFIE_REQUIRED); it must be the caller's own
 * upload and proves one check-in only (409 SELFIE_ALREADY_USED — the visit
 * write marks it used, so a refused check-in leaves it unused). Visits of
 * earlier days still open are auto-closed first; then 409 VISIT_ALREADY_OPEN
 * while another visit that began before `capturedAt` is still open. The first
 * check-in of a day counts as the day's attendance check-in (setting).
 *
 * Captured offline (see `wasCapturedOffline`), what changed since degrades
 * instead of being refused: an unknown purpose is kept as sent, an unknown
 * type of a pinned site becomes "Other", a missing selfie is accepted (with
 * `noSelfie`), a planned visit cancelled meanwhile is started anyway (back to
 * in progress, its `cancelReason` kept), a deleted planned visit becomes an
 * unplanned visit at its site, and a deleted site still takes the visit.
 */
export async function checkIn(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkInSchema>;
  const self = await requireOwnEmployeeId(req);
  const settings = await getFieldSettings();

  // A replay answers with what the first attempt stored.
  const replay = await visitByRef(self, body.clientRef);
  if (replay) {
    if (settings.visitCountsAsAttendance && replay.checkIn?.time) await linkAttendance(self, replay._id, replay.checkIn);
    await sendVisit(res, replay._id);
    return;
  }

  const times = captureTimes(body.capturedAt, settings);
  const at = times.capturedAt;
  const offline = wasCapturedOffline(body.capturedAt, at, times.receivedAt);

  // What is being started.
  let planned: LeanVisit | null = null;
  let site: Awaited<ReturnType<typeof loadSite>> | null = null;
  let plannedPurpose = 'Other';
  if (body.visitId) {
    const found = Types.ObjectId.isValid(body.visitId)
      ? ((await Visit.findById(body.visitId).setOptions({ withDeleted: true }).lean().exec()) as LeanVisit | null)
      : null;
    if (!found || (found.isDeleted && !offline)) throw new NotFoundError('Visit not found');
    if (String(found.employeeId) !== String(self)) {
      throw new ForbiddenError('Only the employee it is planned for can start this visit');
    }
    plannedPurpose = found.purpose || 'Other';
    const startable =
      found.status === 'planned' ||
      found.status === 'missed' ||
      // Cancelled after the employee had started it offline.
      (offline && found.status === 'cancelled' && !found.checkIn?.time);
    // Deleted after it was started offline: an unplanned visit at its site (planned stays null).
    if (!found.isDeleted) {
      if (!startable) throw new AppError('This visit has already been started or closed', 409, 'VISIT_NOT_PLANNED');
      planned = found;
    }
    site = await loadSite(String(found.siteId), { withDeleted: offline });
  } else if (body.siteId) {
    site = await loadSite(body.siteId, { withDeleted: offline });
  }
  const purpose = body.purpose ? canonicalPurpose(body.purpose, settings, offline) : plannedPurpose;

  if (settings.selfieRequired && !body.selfieKey && !offline) {
    throw new AppError('A selfie is required to check in', 400, 'SELFIE_REQUIRED');
  }
  const selfie = body.selfieKey ? await fieldFileRef(body.selfieKey, 'photo', { userId: req.user?._id }) : undefined;
  // One check-in per selfie (the unique index enforces it again in the write below).
  if (selfie && (await Visit.exists({ 'checkIn.photo': selfie }).setOptions({ withDeleted: true }).exec())) {
    throw selfieUsed();
  }

  // Visits of earlier days still open (synced after that night's run) end at their day's auto-close.
  await autoCloseOpenVisits(startOfBusinessDay(times.receivedAt), settings, times.receivedAt, { employeeId: self });

  // One open visit at a time (at the moment of this capture).
  const open = await Visit.findOne({
    employeeId: self,
    status: 'in_progress',
    'checkIn.time': { $lte: at },
    ...(planned ? { _id: { $ne: planned._id } } : {}),
  })
    .select('_id')
    .lean()
    .exec();
  if (open) throw alreadyOpen(open._id);

  if (body.newSite) {
    const created = await createFieldSite(
      req,
      { ...body.newSite, capturedAt: body.newSite.capturedAt ?? body.capturedAt },
      { clientRef: body.clientRef, createdVia: 'mobile_pin', lenientType: offline },
    );
    site = await loadSite(String(created.site._id), { withDeleted: offline });
  }
  if (!site) throw new ValidationAppError('Send exactly one of visitId, siteId or newSite');

  const location = body.location ?? undefined;
  const pin = siteLatLng(site.location);
  const distanceM = location && pin ? Math.round(distanceMeters(location, pin)) : undefined;
  const radiusM = site.radiusM ?? settings.defaultSiteRadiusM;
  const flags: IVisitFlags = {
    ...emptyFlags(),
    awayFromSite: distanceM !== undefined && distanceM > radiusM,
    noGps: !location,
    noSelfie: !selfie,
    syncedLate: times.syncedLate,
    capturedOffline: offline,
  };
  const point = {
    time: at,
    ...(location ? { location } : {}),
    ...(selfie ? { photo: selfie } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
    ...(distanceM !== undefined ? { distanceM } : {}),
    ...(body.capturedAt ? { capturedAt: new Date(body.capturedAt) } : {}),
    receivedAt: times.receivedAt,
    ...(body.clientRef ? { clientRef: body.clientRef } : {}),
  };
  const day = startOfBusinessDay(at);

  let visitId: Types.ObjectId;
  try {
    if (planned) {
      const doc = await Visit.findOneAndUpdate(
        {
          _id: planned._id,
          status: { $in: offline ? ['planned', 'missed', 'cancelled'] : ['planned', 'missed'] },
          'checkIn.time': null,
        },
        { $set: { status: 'in_progress', day, purpose, checkIn: point, flags, ...(body.clientRef ? { clientRef: body.clientRef } : {}) } },
        { new: true },
      ).exec();
      if (!doc) {
        const winner = await visitByRef(self, body.clientRef);
        if (winner) return sendVisit(res, winner._id);
        throw new AppError('This visit has already been started or closed', 409, 'VISIT_NOT_PLANNED');
      }
      visitId = doc._id as Types.ObjectId;
    } else {
      const doc = await Visit.create({
        employeeId: self,
        siteId: site._id,
        purpose,
        status: 'in_progress',
        day,
        ...(body.clientRef ? { clientRef: body.clientRef } : {}),
        ...(body.notes ? { notes: body.notes } : {}),
        checkIn: point,
        flags,
      });
      visitId = doc._id as Types.ObjectId;
    }
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    // The same check-in raced itself (its record wins), the selfie went to a
    // parallel check-in, or a second open visit that day.
    const winner = await visitByRef(self, body.clientRef);
    if (winner) return sendVisit(res, winner._id);
    if (duplicateOn(err, 'checkIn.photo')) throw selfieUsed();
    throw alreadyOpen();
  }

  await recordSiteVisit(site._id, at);
  if (settings.visitCountsAsAttendance) await linkAttendance(self, visitId, point);
  void audit({
    action: 'create',
    entity: 'Visit',
    entityId: String(visitId),
    after: { status: 'in_progress', clientRef: body.clientRef, ...(planned?.status === 'cancelled' ? { restartedCancelled: true } : {}) },
  });
  await sendVisit(res, visitId, 201);
}

/* ── Check-out ── */

/**
 * How a check-out lands:
 *  - `close`: an open visit ends at the captured time;
 *  - `autoClose`: an open visit of an earlier day than the capture ends at
 *    its own day's auto-close time (`autoClosed`), not across days;
 *  - `replace`: an auto-closed visit, captured before the auto-close ran on
 *    its own day — the real check-out replaces the automatic one;
 *  - `keep`: an auto-closed visit, captured after the auto-close ran (or on
 *    a later day) — the auto-close stands; only the work report (and notes)
 *    sent with it is added.
 */
type CheckOutMode = 'close' | 'autoClose' | 'replace' | 'keep';

interface CheckOutInput {
  body: z.infer<typeof checkOutSchema>;
  settings: Awaited<ReturnType<typeof getFieldSettings>>;
  times: ReturnType<typeof captureTimes>;
  offline: boolean;
  report: ResolvedReport | undefined;
}

/** The conditional write for `mode` on `visit` (as last read); null when the visit no longer matches. */
async function writeCheckOut(mode: CheckOutMode, visit: LeanVisit, input: CheckOutInput) {
  const { body, settings, times, offline, report } = input;
  const at = times.capturedAt;
  const now = times.receivedAt;
  const inAt = visit.checkIn!.time!;
  const ref = body.clientRef;
  // A duplicate of this same check-out (same clientRef) must not apply twice.
  const notThisRef = ref ? { 'checkOut.clientRef': { $ne: ref } } : {};
  const autoClosed = { _id: visit._id, status: 'completed', 'flags.autoClosed': true, ...notThisRef };
  const withReport = ($set: Record<string, unknown>): Record<string, Record<string, unknown>> => {
    if (!report) return { $set };
    const r = reportUpdate(report, visit.report, now, at);
    return compactUpdate({ ...r, $set: { ...$set, ...r.$set } });
  };

  if (mode === 'keep') {
    const $set: Record<string, unknown> = {};
    if (ref) $set['checkOut.clientRef'] = ref;
    if (body.notes && !visit.checkOut?.notes) $set['checkOut.notes'] = body.notes;
    if (!report && Object.keys($set).length === 0) return Visit.findOne(autoClosed).exec();
    return Visit.findOneAndUpdate(autoClosed, withReport($set), { new: true }).exec();
  }

  const lateFlags: Record<string, unknown> = {};
  if (times.syncedLate) lateFlags['flags.syncedLate'] = true;
  if (offline) lateFlags['flags.capturedOffline'] = true;
  const capture = {
    ...(body.notes ? { notes: body.notes } : {}),
    ...(body.capturedAt ? { capturedAt: new Date(body.capturedAt) } : {}),
    receivedAt: now,
    ...(ref ? { clientRef: ref } : {}),
  };

  if (mode === 'autoClose') {
    // The location was taken on a later day: it is no part of this visit (nor of its day's route).
    const day = visit.day ?? startOfBusinessDay(inAt);
    const closeAt = autoCloseInstant(day, inAt, settings);
    const minutes = Math.max(0, Math.round((closeAt.getTime() - inAt.getTime()) / 60_000));
    const $set = {
      status: 'completed',
      day,
      checkOut: { time: closeAt, ...capture },
      durationMinutes: minutes,
      'flags.autoClosed': true,
      'flags.shortVisit': settings.shortVisitMinutes > 0 && minutes < settings.shortVisitMinutes,
      ...lateFlags,
    };
    return Visit.findOneAndUpdate({ _id: visit._id, status: 'in_progress' }, withReport($set), { new: true }).exec();
  }

  const site = await loadSite(String(visit.siteId), { withDeleted: true }).catch(() => null);
  const location = body.location ?? undefined;
  const pin = site ? siteLatLng(site.location) : null;
  const distanceM = location && pin ? Math.round(distanceMeters(location, pin)) : undefined;
  const minutes = Math.max(0, Math.round((at.getTime() - inAt.getTime()) / 60_000));
  const $set = {
    status: 'completed',
    checkOut: {
      time: at,
      ...(location ? { location } : {}),
      ...(distanceM !== undefined ? { distanceM } : {}),
      ...capture,
    },
    durationMinutes: minutes,
    'flags.shortVisit': settings.shortVisitMinutes > 0 && minutes < settings.shortVisitMinutes,
    'flags.autoClosed': false,
    ...lateFlags,
  };
  return Visit.findOneAndUpdate(
    mode === 'replace' ? autoClosed : { _id: visit._id, status: 'in_progress' },
    withReport($set),
    { new: true },
  ).exec();
}

/**
 * POST /field/visits/:id/check-out — the visit's employee closes it, with the
 * work report. `durationMinutes` from check-in to `capturedAt`; `shortVisit`
 * below the settings minimum.
 *
 * A check-out captured on a later day than the visit's day stores that day's
 * auto-close instead (`autoClosed`, at the `autoCloseTime` — never a
 * cross-day duration). For a visit already auto-closed: a check-out captured
 * on its day before the auto-close ran replaces it; any later one leaves it
 * as it is and only adds the work report (and notes) it carries — 200 with
 * the visit either way. A replay (same `clientRef`) answers 200 unchanged.
 * Captured offline, a checklist that changed meanwhile is degraded (see
 * `resolveReport`) instead of refusing the check-out.
 */
export async function checkOut(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkOutSchema>;
  const visit = (await loadVisit(String(req.params.id))) as unknown as LeanVisit;
  const self = await currentEmployeeId(req);
  if (!self || String(visit.employeeId) !== String(self)) {
    throw new ForbiddenError('Only the employee on the visit can check out of it');
  }
  if (body.clientRef && visit.checkOut?.clientRef === body.clientRef) return sendVisit(res, visit._id); // replay

  if (visit.status === 'cancelled') throw new AppError('The visit was cancelled', 409, 'VISIT_CLOSED');
  if (visit.status === 'planned' || visit.status === 'missed' || !visit.checkIn?.time) {
    throw new AppError('Check in to the visit before checking out', 409, 'VISIT_NOT_CHECKED_IN');
  }
  if (visit.status === 'completed' && !visit.flags?.autoClosed) {
    throw new AppError('This visit is already checked out', 409, 'VISIT_ALREADY_CHECKED_OUT');
  }

  const settings = await getFieldSettings();
  const times = captureTimes(body.capturedAt, settings);
  const at = times.capturedAt;
  const inAt = visit.checkIn.time;
  if (at.getTime() < inAt.getTime()) {
    throw new AppError('The check-out time is before the check-in', 400, 'CHECKOUT_BEFORE_CHECKIN');
  }
  const offline = wasCapturedOffline(body.capturedAt, at, times.receivedAt);
  const report: ResolvedReport | undefined = body.report
    ? await resolveReport(body.report, settings, { userId: req.user?._id, existing: visit.report, lenient: offline })
    : undefined;
  const input: CheckOutInput = { body, settings, times, offline, report };

  const day = visit.day ?? startOfBusinessDay(inAt);
  // Captured on a later day than the visit's: it ends at its own day's auto-close.
  const laterDay = startOfBusinessDay(at).getTime() > day.getTime();
  /** An auto-closed visit is replaced only by a check-out of its day captured before the auto-close ran. */
  const replaces = (v: LeanVisit): boolean => {
    const ranAt = v.checkOut?.receivedAt;
    return !laterDay && ranAt instanceof Date && at.getTime() <= ranAt.getTime();
  };

  let base = visit;
  let mode: CheckOutMode = visit.status === 'completed' ? (replaces(visit) ? 'replace' : 'keep') : laterDay ? 'autoClose' : 'close';
  let doc = await writeCheckOut(mode, base, input);
  if (!doc) {
    // Changed meanwhile: this same check-out (a duplicate), the nightly auto-close, or another check-out.
    const current = (await Visit.findById(visit._id).lean().exec()) as LeanVisit | null;
    if (body.clientRef && current?.checkOut?.clientRef === body.clientRef) return sendVisit(res, visit._id);
    if (current?.status === 'completed' && current.flags?.autoClosed) {
      base = current;
      mode = replaces(current) ? 'replace' : 'keep';
      doc = await writeCheckOut(mode, base, input);
    }
    if (!doc) {
      if (current?.status === 'cancelled') throw new AppError('The visit was cancelled', 409, 'VISIT_CLOSED');
      throw new AppError('This visit is already checked out', 409, 'VISIT_ALREADY_CHECKED_OUT');
    }
  }
  void audit({
    action: 'update',
    entity: 'Visit',
    entityId: String(doc._id),
    after: { status: 'completed', durationMinutes: doc.durationMinutes, checkOut: mode, replacedAutoClose: mode === 'replace' },
  });
  if (report) await afterReport(doc._id, !base.report?.submittedAt, req.user?._id);
  if (settings.visitCountsAsAttendance && (mode === 'close' || mode === 'replace')) {
    await extendAttendance(self, doc._id, inAt, at);
  }
  await sendVisit(res, doc._id);
}

/* ── Report edits ── */

/**
 * PATCH /field/visits/:id/report — merge report fields into a checked-out
 * visit (sent fields replace theirs; photos and documents are added;
 * checklist answers merge by item into those stored for the same checklist,
 * the required items checked on the merged set). The employee may edit
 * within 48 h of the check-out (measured to the edit's `capturedAt`, so an
 * edit made offline in time still lands); a field manager any time. The
 * first report filed notifies the reporting manager. A replay (same
 * `clientRef`, also when two copies race) answers 200 and applies nothing.
 */
export async function updateReport(req: Request, res: Response): Promise<void> {
  const { clientRef: ref, capturedAt: editedAt, ...fields } = req.body as z.infer<typeof reportPatchSchema>;
  const visit = await loadVisit(String(req.params.id));
  const manage = canManageField(req);
  const self = await currentEmployeeId(req);
  const owner = self !== null && String(visit.employeeId) === String(self);
  if (!owner && !manage) throw new ForbiddenError('Only the employee on the visit or a field manager can edit its report');
  if (ref && (visit.reportClientRefs ?? []).includes(ref)) return sendVisit(res, visit._id); // replay

  if (visit.status !== 'completed' || !visit.checkOut?.time) {
    throw new AppError('File the report after checking out of the visit', 409, 'VISIT_NOT_CHECKED_OUT');
  }
  const settings = await getFieldSettings();
  const now = new Date();
  let edited = now;
  if (!manage) {
    edited = acceptCapturedAt(editedAt, settings, now);
    const out = Math.max(visit.checkOut.time.getTime(), visit.checkOut.receivedAt?.getTime() ?? 0);
    if (edited.getTime() > out + REPORT_EDIT_WINDOW_MS) {
      throw new AppError('The report can be edited only within 48 hours of the check-out', 403, 'EDIT_WINDOW_CLOSED');
    }
  } else if (editedAt) {
    const sent = new Date(editedAt);
    if (!Number.isNaN(sent.getTime()) && sent.getTime() < now.getTime()) edited = sent;
  }
  const report = await resolveReport(fields, settings, {
    userId: req.user?._id,
    existing: visit.report,
    lenient: wasCapturedOffline(editedAt, edited, now),
  });
  const r = reportUpdate(report, visit.report, now, edited);
  const update = compactUpdate({ ...r, $push: { ...r.$push, ...(ref ? pushReportRef(ref) : {}) } });
  const doc = await Visit.findOneAndUpdate(
    { _id: visit._id, status: 'completed', ...(ref ? { reportClientRefs: { $ne: ref } } : {}) },
    update,
    { new: true },
  ).exec();
  if (!doc) {
    // A copy of this same edit (same clientRef) was applied meanwhile: a replay.
    const current = await Visit.findById(visit._id).select('reportClientRefs').lean().exec();
    if (ref && (current?.reportClientRefs ?? []).includes(ref)) return sendVisit(res, visit._id);
    throw new AppError('The visit changed meanwhile — reload and try again', 409, 'VISIT_CHANGED');
  }
  void audit({ action: 'update', entity: 'Visit', entityId: String(doc._id), after: { report: Object.keys(fields) } });
  await afterReport(doc._id, !visit.report?.submittedAt, req.user?._id);
  await sendVisit(res, doc._id);
}
