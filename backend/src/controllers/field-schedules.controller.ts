import type { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { VisitSchedule, type IScheduleRule, type IVisitSchedule } from '../models/visit-schedule.model.js';
import { ForbiddenError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { assertEmployeeExists, assertEmployeeHasFieldAccess, listScopeFilter } from '../lib/field-access.js';
import { fieldScope, noEmployeeProfile, scopeIncludes, type FieldScope } from '../lib/field-scope.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { objectIdString, pageParams } from '../lib/field-utils.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { assertSiteRead, loadSite, serializeSite } from '../services/field-sites.service.js';
import {
  canonicalPurpose,
  horizonEnd,
  labelFromYmd,
  planScheduleVisits,
  replanSchedule,
  unplanSchedule,
  ymdOf,
  ymdSchema,
} from '../services/field-visits.service.js';

/*
 * Recurring visits (`/field/visit-schedules`). field.view: schedules for the
 * caller and their direct reports; field.manage: everyone's. Creating a
 * schedule plans its visits for the next 7 days at once; the nightly field
 * run keeps the window filled. Editing re-plans from tomorrow on; deleting
 * removes the planned visits from tomorrow on (today's stays).
 */

const ruleSchema = z
  .object({
    freq: z.enum(['weekly', 'monthly']),
    /** 1 = Monday … 7 = Sunday. */
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
    /** 1–28, so every month has the day. */
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    startDate: ymdSchema,
    endDate: ymdSchema.nullable().optional(),
  })
  .superRefine((r, ctx) => {
    if (r.freq === 'weekly' && (!r.weekdays || r.weekdays.length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weekdays'], message: 'Pick at least one weekday' });
    }
    if (r.freq === 'monthly' && r.dayOfMonth === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfMonth'], message: 'Pick the day of the month (1–28)' });
    }
    if (r.endDate && r.endDate < r.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'The end date is before the start date' });
    }
  });

export const createScheduleSchema = z.object({
  siteId: objectIdString,
  /** Omitted: the caller. */
  employeeId: objectIdString.optional(),
  purpose: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).optional(),
  rule: ruleSchema,
});

export const updateScheduleSchema = z.object({
  siteId: objectIdString.optional(),
  employeeId: objectIdString.optional(),
  purpose: z.string().trim().min(1).max(60).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  rule: ruleSchema.optional(),
});

export const listQuerySchema = z.object({
  ...pageParams,
  employeeId: objectIdString.optional(),
  siteId: objectIdString.optional(),
});

/** The stored rule from the input (day labels; the fields of the other frequency dropped). */
function toRule(r: z.infer<typeof ruleSchema>): IScheduleRule {
  return {
    freq: r.freq,
    ...(r.freq === 'weekly' ? { weekdays: [...new Set(r.weekdays ?? [])].sort((a, b) => a - b) } : {}),
    ...(r.freq === 'monthly' ? { dayOfMonth: r.dayOfMonth } : {}),
    startDate: labelFromYmd(r.startDate),
    ...(r.endDate ? { endDate: labelFromYmd(r.endDate) } : {}),
  };
}

const POPULATE = [
  { path: 'siteId', select: 'name type address location radiusM', options: { withDeleted: true } },
  { path: 'employeeId', select: 'firstName lastName employeeId', options: { withDeleted: true } },
];

type Obj = Record<string, unknown>;
const isPopulated = (v: unknown): v is Obj => v !== null && typeof v === 'object' && !(v instanceof Types.ObjectId) && '_id' in v;

/** The API shape: `site` / `employee` (and the same objects under `siteId` / `employeeId`), the rule with `YYYY-MM-DD` dates. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeSchedule(raw: any) {
  const s = typeof raw?.toObject === 'function' ? raw.toObject({ depopulate: false }) : raw;
  const site = isPopulated(s.siteId) && 'name' in s.siteId ? s.siteId : null;
  const emp = isPopulated(s.employeeId) && 'firstName' in s.employeeId ? s.employeeId : null;
  const siteJson = site
    ? (() => {
        const full = serializeSite({ ...site, assignedTo: [], createdBy: null });
        return { _id: full._id, name: full.name, type: full.type, location: full.location, radiusM: full.radiusM, address: full.address };
      })()
    : { _id: String(s.siteId), name: 'Site' };
  const empJson = emp
    ? { _id: String(emp._id), firstName: String(emp.firstName ?? ''), lastName: String(emp.lastName ?? ''), employeeId: String(emp.employeeId ?? '') }
    : { _id: String(s.employeeId), firstName: '', lastName: '', employeeId: '' };
  const rule = s.rule as IScheduleRule;
  return {
    _id: String(s._id),
    siteId: siteJson,
    employeeId: empJson,
    site: siteJson,
    employee: empJson,
    purpose: s.purpose as string,
    ...(s.notes ? { notes: s.notes as string } : {}),
    rule: {
      freq: rule.freq,
      ...(rule.freq === 'weekly' ? { weekdays: rule.weekdays ?? [] } : {}),
      ...(rule.freq === 'monthly' ? { dayOfMonth: rule.dayOfMonth } : {}),
      startDate: ymdOf(rule.startDate),
      ...(rule.endDate ? { endDate: ymdOf(rule.endDate) } : {}),
    },
    createdBy: s.createdBy ? String(s.createdBy) : null,
    createdAt: s.createdAt as Date,
    updatedAt: s.updatedAt as Date,
  };
}

async function sendSchedule(res: Response, id: unknown, status = 200): Promise<void> {
  const doc = await VisitSchedule.findById(id).populate(POPULATE).lean().exec();
  if (!doc) throw new NotFoundError('Schedule not found');
  res.status(status).json({ success: true, data: serializeSchedule(doc) });
}

async function loadSchedule(id: string): Promise<IVisitSchedule> {
  const doc = Types.ObjectId.isValid(id) ? await VisitSchedule.findById(id).exec() : null;
  if (!doc) throw new NotFoundError('Schedule not found');
  return doc;
}

/** 403 unless `employeeId` is the caller, one of their direct reports, or (field.manage) anyone. */
function assertMayPlanFor(scope: FieldScope, employeeId: unknown): void {
  if (!scopeIncludes(scope, employeeId)) {
    throw new ForbiddenError('You can schedule visits only for yourself and your direct reports');
  }
}

/** GET /field/visit-schedules */
export async function listSchedules(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Obj = await listScopeFilter(req, q.employeeId);
  if (q.siteId) filter.siteId = new Types.ObjectId(q.siteId);
  const [rows, total] = await Promise.all([
    VisitSchedule.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate(POPULATE)
      .lean()
      .exec(),
    VisitSchedule.countDocuments(filter).exec(),
  ]);
  res.json({
    success: true,
    data: rows.map(serializeSchedule),
    pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) || 1 },
  });
}

/** GET /field/visit-schedules/:id */
export async function getSchedule(req: Request, res: Response): Promise<void> {
  const doc = await loadSchedule(String(req.params.id));
  assertMayPlanFor(await fieldScope(req), doc.employeeId);
  await sendSchedule(res, doc._id);
}

/** POST /field/visit-schedules — and plan its visits for the next 7 days. */
export async function createSchedule(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createScheduleSchema>;
  const scope = await fieldScope(req);
  const employeeId = body.employeeId ?? (scope.self ? String(scope.self) : null);
  if (!employeeId) throw noEmployeeProfile();
  assertMayPlanFor(scope, employeeId);
  await assertEmployeeExists(employeeId);
  await assertEmployeeHasFieldAccess(employeeId);
  const site = await loadSite(body.siteId);
  if (!scope.manage) await assertSiteRead(req, site);
  const purpose = canonicalPurpose(body.purpose, await getFieldSettings());

  const doc = await VisitSchedule.create({
    employeeId,
    siteId: site._id,
    purpose,
    ...(body.notes ? { notes: body.notes } : {}),
    rule: toRule(body.rule),
    ...(req.user?._id ? { createdBy: req.user._id } : {}),
  });
  const today = startOfBusinessDay();
  await planScheduleVisits(doc, today, horizonEnd(today));
  void audit({ action: 'create', entity: 'VisitSchedule', entityId: String(doc._id) });
  await sendSchedule(res, doc._id, 201);
}

/** PATCH /field/visit-schedules/:id — then re-plan from tomorrow on. */
export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateScheduleSchema>;
  const doc = await loadSchedule(String(req.params.id));
  const scope = await fieldScope(req);
  assertMayPlanFor(scope, doc.employeeId);

  if (body.employeeId && body.employeeId !== String(doc.employeeId)) {
    assertMayPlanFor(scope, body.employeeId);
    await assertEmployeeExists(body.employeeId);
    await assertEmployeeHasFieldAccess(body.employeeId);
    doc.employeeId = new Types.ObjectId(body.employeeId);
  }
  if (body.siteId && body.siteId !== String(doc.siteId)) {
    const site = await loadSite(body.siteId);
    if (!scope.manage) await assertSiteRead(req, site);
    doc.siteId = site._id as Types.ObjectId;
  }
  if (body.purpose) doc.purpose = canonicalPurpose(body.purpose, await getFieldSettings());
  if (body.notes !== undefined) doc.notes = body.notes ?? undefined;
  if (body.rule) doc.rule = toRule(body.rule);
  if (doc.rule.endDate && doc.rule.endDate < doc.rule.startDate) {
    throw new ValidationAppError('The end date is before the start date');
  }
  await doc.save();
  await replanSchedule(doc);
  void audit({ action: 'update', entity: 'VisitSchedule', entityId: String(doc._id) });
  await sendSchedule(res, doc._id);
}

/** DELETE /field/visit-schedules/:id — soft delete; planned visits from tomorrow on go. */
export async function deleteSchedule(req: Request, res: Response): Promise<void> {
  const doc = await loadSchedule(String(req.params.id));
  assertMayPlanFor(await fieldScope(req), doc.employeeId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete({ by: req.user?._id });
  const removed = await unplanSchedule(doc._id);
  void audit({ action: 'delete', entity: 'VisitSchedule', entityId: String(doc._id), after: { plannedVisitsRemoved: removed } });
  res.json({ success: true, message: 'Schedule deleted', data: { plannedVisitsRemoved: removed } });
}
