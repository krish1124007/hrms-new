/**
 * The visit engine's shared pieces: the API shape of a visit (`serializeVisit`),
 * IST day helpers, purpose and work-report validation (upload keys, checklist
 * answers against the settings checklist), the report merge, follow-up
 * visits, notices, recurring schedules, and the nightly field run
 * (`runFieldNightly`: schedules → planned visits 7 days ahead, yesterday's
 * planned → missed, previous days' open visits → auto-closed).
 *
 * No transactions (Mongo standalone): every state change is a conditional
 * write on the status it expects, and replays are recognised by `clientRef`.
 */
import { Types } from 'mongoose';
import { z } from 'zod';
import { Visit, VISIT_REPORT_OUTCOMES, } from '../models/visit.model.js';
import { VisitSchedule } from '../models/visit-schedule.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { Employee } from '../models/employee.model.js';
import { AppError } from '../lib/errors.js';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
import { fieldFileRef, fieldFileRefs } from '../lib/field-files.js';
import { logger } from '../config/logger.js';
import { getFieldSettings } from './field-settings.service.js';
import { siteLatLng } from './field-sites.service.js';
import { createNotification, formatBusinessDate, reportingManagerUserId } from './notification.service.js';
/* ── Constants ── */
/** The owner may edit a report this long after check-out (`field.manage`: any time). */
export const REPORT_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Schedules are planned this many days ahead, today included. */
export const SCHEDULE_HORIZON_DAYS = 7;
/** A capture this much older than its arrival was made offline (not sent live). */
export const CAPTURED_OFFLINE_AFTER_MS = 2 * 60 * 1000;
/** How many applied report-edit clientRefs a visit remembers. */
const REPORT_REF_MEMORY = 20;
/* ── IST days ── */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** The IST business-day label (UTC midnight) of instant `at`. */
export const dayLabelOf = (at = new Date()) => startOfBusinessDay(at);
/** `YYYY-MM-DD` of a day label. */
export const ymdOf = (label) => label.toISOString().slice(0, 10);
/** The day label of a `YYYY-MM-DD` string. */
export function labelFromYmd(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}
/** ISO weekday of a day label: 1 = Monday … 7 = Sunday. */
export const isoWeekday = (label) => ((label.getUTCDay() + 6) % 7) + 1;
/** `[start, end)` instants of the IST day `label` names. */
export function dayWindow(label) {
    const start = atBusinessTime(label, '00:00');
    return { start, end: new Date(start.getTime() + DAY_MS) };
}
/** zod: a `YYYY-MM-DD` calendar date that exists. */
export const ymdSchema = z
    .string()
    .trim()
    .regex(YMD, 'Use YYYY-MM-DD')
    .refine((v) => ymdOf(labelFromYmd(v)) === v, 'Not a calendar date');
/** zod: a day given as `YYYY-MM-DD` or a timestamp → its IST day label. */
export const dayInputSchema = z
    .string()
    .trim()
    .max(40)
    .transform((v, ctx) => {
    if (YMD.test(v)) {
        const label = labelFromYmd(v);
        if (ymdOf(label) === v)
            return label;
    }
    else {
        const at = new Date(v);
        if (!Number.isNaN(at.getTime()))
            return startOfBusinessDay(at);
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use YYYY-MM-DD' });
    return z.NEVER;
});
/* ── Purposes ── */
/**
 * The settings' spelling of `purpose`, or 400 `INVALID_PURPOSE`. `lenient`
 * (an offline capture: HR may have renamed the purpose since) keeps an
 * unknown purpose as it was sent instead.
 */
export function canonicalPurpose(purpose, settings, lenient = false) {
    const match = settings.visitPurposes.find((p) => p.toLowerCase() === purpose.trim().toLowerCase());
    if (!match) {
        if (lenient)
            return purpose.trim();
        throw new AppError(`"${purpose}" is not a visit purpose. Use one of: ${settings.visitPurposes.join(', ')}`, 400, 'INVALID_PURPOSE');
    }
    return match;
}
/* ── The API shape ── */
/** Populate for visit responses (soft-deleted sites and employees still show). */
export const VISIT_POPULATE = [
    { path: 'siteId', select: 'name type location radiusM address', options: { withDeleted: true } },
    { path: 'employeeId', select: 'firstName lastName employeeId', options: { withDeleted: true } },
];
const isObj = (v) => v !== null && typeof v === 'object' && !(v instanceof Types.ObjectId);
const idString = (v) => (isObj(v) && '_id' in v ? String(v._id) : String(v ?? ''));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
/** `{ lat, lng }` from either a GeoJSON point or `{ lat, lng }`. */
function latLngOf(v) {
    if (!isObj(v))
        return null;
    if (Array.isArray(v.coordinates))
        return siteLatLng(v);
    const lat = num(v.lat);
    const lng = num(v.lng);
    return lat !== undefined && lng !== undefined ? { lat, lng } : null;
}
const FLAG_KEYS = [
    'awayFromSite',
    'noGps',
    'noSelfie',
    'shortVisit',
    'autoClosed',
    'syncedLate',
    'capturedOffline',
];
export function emptyFlags() {
    return { awayFromSite: false, noGps: false, noSelfie: false, shortVisit: false, autoClosed: false, syncedLate: false, capturedOffline: false };
}
function pointJson(raw, selfie) {
    if (!isObj(raw) || !(raw.time instanceof Date))
        return undefined;
    const location = latLngOf(raw.location);
    const accuracy = isObj(raw.location) ? num(raw.location.accuracy) : undefined;
    return {
        at: raw.time,
        ...(location ? { location } : {}),
        ...(accuracy !== undefined ? { accuracy } : {}),
        ...(selfie && typeof raw.photo === 'string' ? { selfieUrl: raw.photo } : {}),
        ...(num(raw.distanceM) !== undefined ? { distanceM: num(raw.distanceM) } : {}),
        ...(typeof raw.notes === 'string' && raw.notes ? { notes: raw.notes } : {}),
        ...(typeof raw.address === 'string' && raw.address ? { address: raw.address } : {}),
        ...(raw.capturedAt instanceof Date ? { capturedAt: raw.capturedAt } : {}),
        ...(raw.receivedAt instanceof Date ? { receivedAt: raw.receivedAt } : {}),
    };
}
function reportJson(raw) {
    if (!isObj(raw))
        return undefined;
    const checklist = isObj(raw.checklist) && typeof raw.checklist.checklistId === 'string' ? raw.checklist : null;
    return {
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        photos: Array.isArray(raw.photos) ? raw.photos.filter((p) => typeof p === 'string') : [],
        documents: (Array.isArray(raw.documents) ? raw.documents : []).flatMap((d) => isObj(d) && typeof d.key === 'string' ? [{ url: d.key, name: typeof d.name === 'string' && d.name ? d.name : 'Document' }] : []),
        peopleMet: (Array.isArray(raw.peopleMet) ? raw.peopleMet : []).flatMap((p) => isObj(p) && typeof p.name === 'string'
            ? [
                {
                    name: p.name,
                    ...(typeof p.designation === 'string' && p.designation ? { designation: p.designation } : {}),
                    ...(typeof p.phone === 'string' && p.phone ? { phone: p.phone } : {}),
                },
            ]
            : []),
        outcome: VISIT_REPORT_OUTCOMES.includes(String(raw.outcome)) ? raw.outcome : null,
        ...(typeof raw.nextAction === 'string' && raw.nextAction ? { nextAction: raw.nextAction } : {}),
        ...(raw.followUpDate instanceof Date ? { followUpDate: ymdOf(raw.followUpDate) } : {}),
        ...(checklist
            ? {
                checklist: {
                    checklistId: checklist.checklistId,
                    answers: (Array.isArray(checklist.answers) ? checklist.answers : []).flatMap((a) => isObj(a) && typeof a.itemId === 'string' ? [{ itemId: a.itemId, value: a.value ?? null }] : []),
                },
            }
            : {}),
        submittedAt: raw.submittedAt instanceof Date ? raw.submittedAt : null,
        ...(raw.updatedAt instanceof Date ? { updatedAt: raw.updatedAt } : {}),
    };
}
/**
 * The contract's `Visit` from a stored visit (lean or hydrated; `siteId` and
 * `employeeId` populated with VISIT_POPULATE, or bare ids). Files stay in
 * their stored `/uploads/<key>` form — the response middleware signs them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeVisit(raw) {
    const v = typeof raw?.toObject === 'function' ? raw.toObject({ depopulate: false, transform: false }) : raw;
    const emp = isObj(v.employeeId) && 'firstName' in v.employeeId ? v.employeeId : null;
    const site = isObj(v.siteId) && 'name' in v.siteId ? v.siteId : null;
    const flags = emptyFlags();
    const storedFlags = isObj(v.flags) ? v.flags : {};
    for (const k of FLAG_KEYS)
        flags[k] = storedFlags[k] === true;
    const checkIn = pointJson(v.checkIn, true);
    const checkOut = pointJson(v.checkOut, false);
    const report = reportJson(v.report);
    return {
        _id: String(v._id),
        clientRef: typeof v.clientRef === 'string' ? v.clientRef : null,
        employeeId: idString(v.employeeId),
        employee: {
            _id: idString(v.employeeId),
            firstName: typeof emp?.firstName === 'string' ? emp.firstName : '',
            lastName: typeof emp?.lastName === 'string' ? emp.lastName : '',
            employeeId: typeof emp?.employeeId === 'string' ? emp.employeeId : '',
        },
        siteId: idString(v.siteId),
        site: {
            _id: idString(v.siteId),
            name: typeof site?.name === 'string' ? site.name : 'Site',
            type: typeof site?.type === 'string' ? site.type : '',
            location: latLngOf(site?.location),
            radiusM: num(site?.radiusM) ?? null,
        },
        purpose: typeof v.purpose === 'string' ? v.purpose : 'Other',
        status: v.status,
        day: v.day instanceof Date ? ymdOf(v.day) : null,
        ...(v.plannedDate instanceof Date ? { plannedDate: ymdOf(v.plannedDate) } : {}),
        ...(v.scheduleId ? { scheduleId: String(v.scheduleId) } : {}),
        ...(v.plannedBy ? { plannedBy: String(v.plannedBy) } : {}),
        ...(v.followUpOf ? { followUpOf: String(v.followUpOf) } : {}),
        ...(typeof v.notes === 'string' && v.notes ? { notes: v.notes } : {}),
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        ...(num(v.durationMinutes) !== undefined ? { durationMinutes: num(v.durationMinutes) } : {}),
        flags,
        ...(report ? { report } : {}),
        ...(typeof v.cancelReason === 'string' && v.cancelReason ? { cancelReason: v.cancelReason } : {}),
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
    };
}
/** One visit in the API shape (soft-deleted ones too — a replay may name one), or null. */
export async function loadVisitJson(id) {
    const doc = await Visit.findById(id).setOptions({ withDeleted: true }).populate(VISIT_POPULATE).lean().exec();
    return doc ? serializeVisit(doc) : null;
}
/* ── Work report ── */
const fileKey = z.string().trim().min(1).max(300);
/** The report fields a check-out (`report`) or PATCH /report carries; photos/documents as upload keys. */
export const reportFieldsSchema = z.object({
    notes: z.string().trim().max(5000).optional(),
    photos: z.array(fileKey).max(30).optional(),
    documents: z
        .array(z.object({ key: fileKey, name: z.string().trim().max(200).optional() }))
        .max(20)
        .optional(),
    peopleMet: z
        .array(z.object({
        name: z.string().trim().min(1).max(200),
        designation: z.string().trim().max(200).optional(),
        phone: z.string().trim().max(30).optional(),
    }))
        .max(50)
        .optional(),
    outcome: z.enum(VISIT_REPORT_OUTCOMES).optional(),
    nextAction: z.string().trim().max(2000).optional(),
    /** `null` clears it. */
    followUpDate: dayInputSchema.nullable().optional(),
    /** `null` clears it. */
    checklist: z
        .object({
        checklistId: z.string().trim().min(1).max(64),
        answers: z
            .array(z.object({
            itemId: z.string().trim().min(1).max(64),
            value: z.union([z.boolean(), z.number(), z.string().max(5000), z.null()]).optional(),
        }))
            .max(200)
            .default([]),
    })
        .nullable()
        .optional(),
});
class BadAnswer extends AppError {
    constructor(label, why) {
        super(`Checklist item "${label}": ${why}`, 400, 'INVALID_CHECKLIST_ANSWER');
    }
}
function badAnswer(label, why) {
    return new BadAnswer(label, why);
}
const isBlank = (raw) => raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
/**
 * Checklist answers checked against the settings checklist: unknown items are
 * dropped (the checklist may have changed since an offline capture), values
 * are typed by the item kind (yes/no → boolean, number → number, select → one
 * of the options, photo → an uploaded photo key). Answers are merged by item
 * into `opts.stored` (an item sent with an empty value clears its answer), and
 * every required item must be answered in the merged set (400
 * `CHECKLIST_INCOMPLETE`, `details.missing`). 400 `INVALID_CHECKLIST` for a
 * checklist that does not exist — null instead when `opts.lenient`.
 */
export async function resolveChecklist(input, settings, opts) {
    const checklist = settings.checklists.find((c) => c._id === input.checklistId);
    if (!checklist) {
        if (opts.lenient)
            return null;
        throw new AppError('This checklist does not exist (any more)', 400, 'INVALID_CHECKLIST');
    }
    const sent = new Map(input.answers.map((a) => [a.itemId, a.value]));
    const answers = [];
    for (const item of checklist.items) {
        if (!sent.has(item._id)) {
            // Not sent: the stored answer stays.
            const kept = opts.stored?.find((a) => a.itemId === item._id);
            if (kept && !isBlank(kept.value))
                answers.push({ itemId: item._id, value: kept.value });
            continue;
        }
        const raw = sent.get(item._id);
        if (isBlank(raw))
            continue;
        let value;
        try {
            switch (item.kind) {
                case 'yes_no': {
                    const s = typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
                    if (s === true || s === 'yes' || s === 'true')
                        value = true;
                    else if (s === false || s === 'no' || s === 'false')
                        value = false;
                    else
                        throw badAnswer(item.label, 'answer yes or no');
                    break;
                }
                case 'number': {
                    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : Number.NaN;
                    if (!Number.isFinite(n))
                        throw badAnswer(item.label, 'a number is needed');
                    value = n;
                    break;
                }
                case 'select': {
                    const option = (item.options ?? []).find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
                    if (!option)
                        throw badAnswer(item.label, `choose one of: ${(item.options ?? []).join(', ')}`);
                    value = option;
                    break;
                }
                case 'photo':
                    if (typeof raw !== 'string')
                        throw badAnswer(item.label, 'a photo is needed');
                    // Sequential on purpose: a checklist has a handful of photo items.
                    // eslint-disable-next-line no-await-in-loop
                    value = await fieldFileRef(raw, 'photo', opts.owner);
                    break;
                default:
                    value = String(raw).trim();
            }
        }
        catch (err) {
            // Offline: the item changed since the answer was given — leave the answer out.
            if (opts.lenient && err instanceof BadAnswer)
                continue;
            throw err;
        }
        answers.push({ itemId: item._id, value });
    }
    const missing = checklist.items.filter((i) => i.required && !answers.some((a) => a.itemId === i._id));
    if (missing.length > 0 && !opts.lenient) {
        throw new AppError(`Answer the required checklist items: ${missing.map((i) => i.label).join(', ')}`, 400, 'CHECKLIST_INCOMPLETE', { missing: missing.map((i) => ({ itemId: i._id, label: i.label })) });
    }
    return { checklistId: checklist._id, answers };
}
/** The stored file references of `report` (photos, documents, photo answers). */
function storedFiles(report) {
    if (!report)
        return [];
    const answers = (report.checklist?.answers ?? []).map((a) => a.value).filter((v) => typeof v === 'string');
    return [...(report.photos ?? []), ...(report.documents ?? []).map((d) => d.key), ...answers.filter((v) => v.startsWith('/uploads/'))];
}
/**
 * Validate a report change: upload keys → stored references (the caller's
 * own uploads, or files the report already has), checklist answers checked
 * and merged into the stored ones for the same checklist.
 */
export async function resolveReport(input, settings, opts) {
    const owner = { userId: opts.userId, keep: storedFiles(opts.existing) };
    const out = {};
    if (input.notes !== undefined)
        out.notes = input.notes;
    if (input.photos !== undefined)
        out.photos = [...new Set(await fieldFileRefs(input.photos, 'photo', owner))];
    if (input.documents !== undefined) {
        const refs = await fieldFileRefs(input.documents.map((d) => d.key), 'any', owner);
        out.documents = input.documents.map((d, i) => ({ key: refs[i], name: d.name || 'Document' }));
    }
    if (input.peopleMet !== undefined) {
        out.peopleMet = input.peopleMet.map((p) => ({
            name: p.name,
            ...(p.designation ? { designation: p.designation } : {}),
            ...(p.phone ? { phone: p.phone } : {}),
        }));
    }
    if (input.outcome !== undefined)
        out.outcome = input.outcome;
    if (input.nextAction !== undefined)
        out.nextAction = input.nextAction;
    if (input.followUpDate !== undefined)
        out.followUpDate = input.followUpDate;
    if (input.checklist === null)
        out.checklist = null;
    else if (input.checklist !== undefined) {
        const stored = opts.existing?.checklist;
        const resolved = await resolveChecklist(input.checklist, settings, {
            owner,
            lenient: opts.lenient,
            ...(stored && stored.checklistId === input.checklist.checklistId ? { stored: stored.answers ?? [] } : {}),
        });
        // null: an offline report's checklist that no longer exists — the rest of the report stands.
        if (resolved)
            out.checklist = resolved;
    }
    return out;
}
/**
 * The Mongo update that merges `report` into a visit's stored report: sent
 * fields replace theirs; photos and documents are ADDED (deduplicated — the
 * apps send only new files on an edit); `submittedAt` is set once.
 */
export function reportUpdate(report, existing, now) {
    const $set = { 'report.updatedAt': now };
    const $unset = {};
    const $addToSet = {};
    const $push = {};
    for (const key of ['notes', 'peopleMet', 'outcome', 'nextAction']) {
        if (report[key] !== undefined)
            $set[`report.${key}`] = report[key];
    }
    for (const key of ['followUpDate', 'checklist']) {
        if (report[key] === null)
            $unset[`report.${key}`] = '';
        else if (report[key] !== undefined)
            $set[`report.${key}`] = report[key];
    }
    if (report.photos?.length)
        $addToSet['report.photos'] = { $each: report.photos };
    if (report.documents?.length) {
        const have = new Set((existing?.documents ?? []).map((d) => d.key));
        const fresh = report.documents.filter((d) => !have.has(d.key) && have.add(d.key));
        if (fresh.length)
            $push['report.documents'] = { $each: fresh };
    }
    return { $set, $unset, $addToSet, $push, $min: { 'report.submittedAt': now } };
}
/** Drop empty operators (an empty `$unset` is an error on older servers). */
export function compactUpdate(update) {
    return Object.fromEntries(Object.entries(update).filter(([, v]) => Object.keys(v).length > 0));
}
/** Remember a report edit's clientRef (latest REPORT_REF_MEMORY). */
export const pushReportRef = (clientRef) => ({
    reportClientRefs: { $each: [clientRef], $slice: -REPORT_REF_MEMORY },
});
/* ── Notices ── */
async function employeeNameAndManager(employeeId) {
    const emp = await Employee.findById(employeeId)
        .setOptions({ withDeleted: true })
        .select('firstName lastName reportingManager userId')
        .lean()
        .exec();
    if (!emp)
        return null;
    return {
        name: `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || 'An employee',
        userId: emp.userId ? String(emp.userId) : null,
        managerUserId: await reportingManagerUserId(emp),
    };
}
async function siteName(siteId) {
    const site = await FieldSite.findById(siteId).setOptions({ withDeleted: true }).select('name').lean().exec();
    return site?.name ?? 'a site';
}
const OUTCOME_LABEL = {
    completed: 'work done',
    follow_up: 'follow-up needed',
    not_available: 'person not available',
    other: 'other',
};
/** Tell the employee's reporting manager a visit report was filed. Never throws. */
export async function notifyReportSubmitted(visit) {
    try {
        const who = await employeeNameAndManager(visit.employeeId);
        if (!who?.managerUserId)
            return;
        const outcome = visit.report?.outcome ? ` (${OUTCOME_LABEL[visit.report.outcome]})` : '';
        await createNotification({
            userId: who.managerUserId,
            type: 'field_update',
            title: 'Visit report filed',
            message: `${who.name} filed the report for the visit to ${await siteName(visit.siteId)}${outcome}.`,
            link: `/field/visits/${String(visit._id)}`,
            metadata: { module: 'field', visitId: String(visit._id) },
        });
    }
    catch (err) {
        logger.warn({ err, visitId: String(visit._id) }, 'field: report notice failed');
    }
}
/** Tell an employee someone else planned a visit for them. Never throws. */
export async function notifyVisitPlanned(visit, plannerUserId) {
    try {
        const who = await employeeNameAndManager(visit.employeeId);
        if (!who?.userId || who.userId === plannerUserId)
            return;
        const when = visit.plannedDate ? ` on ${formatBusinessDate(visit.plannedDate)}` : '';
        await createNotification({
            userId: who.userId,
            type: 'field_update',
            title: 'Visit planned for you',
            message: `A visit to ${await siteName(visit.siteId)} has been planned for you${when}.`,
            link: '/field/my-day',
            metadata: { module: 'field', visitId: String(visit._id) },
        });
    }
    catch (err) {
        logger.warn({ err, visitId: String(visit._id) }, 'field: planned-visit notice failed');
    }
}
/**
 * A field task was completed: tell the assignee's reporting manager and the
 * task's creator (not the person who completed it). Never throws.
 */
export async function notifyTaskCompleted(task, completedByUserId) {
    try {
        const who = await employeeNameAndManager(task.assignedTo);
        const recipients = new Set();
        if (who?.managerUserId)
            recipients.add(who.managerUserId);
        if (task.createdBy)
            recipients.add(String(task.createdBy));
        if (completedByUserId)
            recipients.delete(completedByUserId);
        const photos = task.completionPhotos?.length ?? 0;
        const proof = photos ? ` with ${photos} photo${photos === 1 ? '' : 's'}` : '';
        for (const userId of recipients) {
            // eslint-disable-next-line no-await-in-loop
            await createNotification({
                userId,
                type: 'field_update',
                title: 'Field task completed',
                message: `${who?.name ?? 'An employee'} completed "${task.title}"${proof}.`,
                link: `/field/tasks/${String(task._id)}`,
                metadata: { module: 'field', taskId: String(task._id) },
            });
        }
    }
    catch (err) {
        logger.warn({ err, taskId: String(task._id) }, 'field: task-completed notice failed');
    }
}
/* ── Follow-up ── */
const isDuplicateKey = (err) => typeof err === 'object' && err !== null && err.code === 11000;
/**
 * A report with outcome `follow_up` and a follow-up date plans a visit to the
 * same site for the same employee on that date — once per visit (a later
 * edit of the date moves the still-planned follow-up).
 */
export async function ensureFollowUpVisit(visit, plannedBy) {
    const date = visit.report?.followUpDate;
    if (visit.report?.outcome !== 'follow_up' || !date)
        return;
    const label = startOfBusinessDay(date);
    const existing = await Visit.findOne({ followUpOf: visit._id }).setOptions({ withDeleted: true }).lean().exec();
    if (existing) {
        if (existing.status === 'planned' && existing.plannedDate?.getTime() !== label.getTime()) {
            await Visit.updateOne({ _id: existing._id, status: 'planned' }, { $set: { plannedDate: label, day: label } }).exec();
        }
        return;
    }
    try {
        await Visit.create({
            employeeId: visit.employeeId,
            siteId: visit.siteId,
            purpose: visit.purpose,
            status: 'planned',
            plannedDate: label,
            day: label,
            followUpOf: visit._id,
            ...(plannedBy ? { plannedBy } : {}),
            notes: visit.report?.nextAction || 'Follow-up visit',
        });
    }
    catch (err) {
        if (!isDuplicateKey(err))
            throw err; // a parallel edit planned it
    }
}
/* ── Recurring schedules ── */
/** True when `rule` plans a visit on day `label`. */
export function scheduleOccursOn(rule, label) {
    const t = label.getTime();
    if (t < startOfBusinessDay(rule.startDate).getTime())
        return false;
    if (rule.endDate && t > startOfBusinessDay(rule.endDate).getTime())
        return false;
    if (rule.freq === 'weekly')
        return (rule.weekdays ?? []).includes(isoWeekday(label));
    return rule.dayOfMonth === label.getUTCDate();
}
const ACTIVE_EMPLOYEE = { status: { $in: ['active', 'onNotice'] } };
/** Day labels from `from` through `to` (inclusive). */
function labelsBetween(from, to) {
    const out = [];
    for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS)
        out.push(new Date(t));
    return out;
}
/**
 * Planned visits for `schedule` on each day in `[from, to]` the rule names —
 * exactly once per schedule and date (an occurrence cancelled or deleted is
 * not planned again). Skipped for a deleted site or an employee who is no
 * longer active. Returns how many visits were created.
 */
export async function planScheduleVisits(schedule, from, to, checked) {
    const ok = checked ??
        {
            siteLive: (await FieldSite.exists({ _id: schedule.siteId }).exec()) !== null,
            employeeActive: (await Employee.exists({ _id: schedule.employeeId, ...ACTIVE_EMPLOYEE }).exec()) !== null,
        };
    if (!ok.siteLive || !ok.employeeActive)
        return 0;
    let created = 0;
    for (const label of labelsBetween(from, to)) {
        if (!scheduleOccursOn(schedule.rule, label))
            continue;
        try {
            // eslint-disable-next-line no-await-in-loop
            const res = await Visit.updateOne({ scheduleId: schedule._id, plannedDate: label }, {
                $setOnInsert: {
                    employeeId: schedule.employeeId,
                    siteId: schedule.siteId,
                    purpose: schedule.purpose,
                    status: 'planned',
                    day: label,
                    ...(schedule.createdBy ? { plannedBy: schedule.createdBy } : {}),
                    ...(schedule.notes ? { notes: schedule.notes } : {}),
                },
            }, { upsert: true })
                .setOptions({ withDeleted: true })
                .exec();
            created += res.upsertedCount ?? 0;
        }
        catch (err) {
            if (!isDuplicateKey(err))
                throw err; // planned by a parallel run
        }
    }
    return created;
}
/** The planning window that starts on `today`. */
export const horizonEnd = (today) => new Date(today.getTime() + (SCHEDULE_HORIZON_DAYS - 1) * DAY_MS);
/**
 * After a schedule changed: from tomorrow on, its planned visits the rule no
 * longer names are removed and the rest take the new site / employee /
 * purpose / notes; then the window is planned again. Today's visit stays as
 * it is (it may be under way).
 */
export async function replanSchedule(schedule, now = new Date()) {
    const today = startOfBusinessDay(now);
    const future = await Visit.find({ scheduleId: schedule._id, status: 'planned', plannedDate: { $gt: today } })
        .select('_id plannedDate')
        .lean()
        .exec();
    const stale = future.filter((v) => !v.plannedDate || !scheduleOccursOn(schedule.rule, v.plannedDate)).map((v) => v._id);
    if (stale.length > 0)
        await Visit.deleteMany({ _id: { $in: stale }, status: 'planned' }).exec();
    const $set = { employeeId: schedule.employeeId, siteId: schedule.siteId, purpose: schedule.purpose };
    if (schedule.notes)
        $set.notes = schedule.notes;
    await Visit.updateMany({ scheduleId: schedule._id, status: 'planned', plannedDate: { $gt: today } }, schedule.notes ? { $set } : { $set, $unset: { notes: '' } }).exec();
    await planScheduleVisits(schedule, today, horizonEnd(today));
}
/** A schedule was deleted: its planned visits from tomorrow on go (today's stays). */
export async function unplanSchedule(scheduleId, now = new Date()) {
    const today = startOfBusinessDay(now);
    const res = await Visit.deleteMany({ scheduleId, status: 'planned', plannedDate: { $gt: today } }).exec();
    return res.deletedCount ?? 0;
}
/** Every live schedule's visits for the window starting on `today`. */
async function planAllSchedules(today) {
    const end = horizonEnd(today);
    const schedules = await VisitSchedule.find({
        'rule.startDate': { $lte: end },
        $or: [{ 'rule.endDate': null }, { 'rule.endDate': { $gte: today } }],
    })
        .lean()
        .exec();
    if (schedules.length === 0)
        return 0;
    const [sites, employees] = await Promise.all([
        FieldSite.find({ _id: { $in: schedules.map((s) => s.siteId) } }).select('_id').lean().exec(),
        Employee.find({ _id: { $in: schedules.map((s) => s.employeeId) }, ...ACTIVE_EMPLOYEE }).select('_id').lean().exec(),
    ]);
    const liveSites = new Set(sites.map((s) => String(s._id)));
    const activeEmployees = new Set(employees.map((e) => String(e._id)));
    let created = 0;
    for (const s of schedules) {
        try {
            // eslint-disable-next-line no-await-in-loop
            created += await planScheduleVisits(s, today, end, {
                siteLive: liveSites.has(String(s.siteId)),
                employeeActive: activeEmployees.has(String(s.employeeId)),
            });
        }
        catch (err) {
            logger.error({ err, scheduleId: String(s._id) }, 'field nightly: planning a schedule failed');
        }
    }
    return created;
}
/* ── Nightly ── */
/** Planned visits of days before `today` that nobody started become `missed`. */
export async function markMissedVisits(today) {
    const res = await Visit.updateMany({ status: 'planned', plannedDate: { $lt: today } }, { $set: { status: 'missed' } }).exec();
    return res.modifiedCount ?? 0;
}
/** Where the auto-close ends a visit of `day` checked in at `inAt`: the day's `autoCloseTime`, never before the check-in. */
export function autoCloseInstant(day, inAt, settings) {
    return new Date(Math.max(atBusinessTime(day, settings.autoCloseTime).getTime(), inAt?.getTime() ?? 0));
}
/**
 * Visits still in progress from a day before `today` are closed at that day's
 * `autoCloseTime` (never before their check-in) and flagged `autoClosed`,
 * with `checkOut.receivedAt` = `now` (when the auto-close ran). A real
 * check-out captured before then replaces it later (see the check-out).
 * Nightly for everyone; on demand for one employee (`filter.employeeId`)
 * before their check-in, so a visit of an earlier day that synced after the
 * nightly run does not stay open.
 */
export async function autoCloseOpenVisits(today, settings, now = new Date(), filter = {}) {
    const startOfToday = atBusinessTime(today, '00:00');
    const open = await Visit.find({
        ...(filter.employeeId ? { employeeId: new Types.ObjectId(String(filter.employeeId)) } : {}),
        status: 'in_progress',
        $or: [{ day: { $lt: today } }, { day: null, 'checkIn.time': { $lt: startOfToday } }],
    })
        .select('_id day checkIn')
        .lean()
        .exec();
    let closed = 0;
    for (const v of open) {
        const inAt = v.checkIn?.time ?? null;
        const day = v.day ?? (inAt ? startOfBusinessDay(inAt) : startOfBusinessDay(new Date(today.getTime() - DAY_MS)));
        const closeAt = autoCloseInstant(day, inAt, settings);
        const minutes = inAt ? Math.max(0, Math.round((closeAt.getTime() - inAt.getTime()) / 60_000)) : 0;
        // eslint-disable-next-line no-await-in-loop
        const res = await Visit.updateOne({ _id: v._id, status: 'in_progress' }, {
            $set: {
                status: 'completed',
                day,
                checkOut: { time: closeAt, receivedAt: now },
                durationMinutes: minutes,
                'flags.autoClosed': true,
                'flags.shortVisit': settings.shortVisitMinutes > 0 && minutes < settings.shortVisitMinutes,
            },
        }).exec();
        closed += res.modifiedCount ?? 0;
    }
    return closed;
}
/**
 * The nightly field run for the business day `now` falls on (00:15 IST by
 * jobs/field.jobs.ts): previous days' open visits auto-closed, past planned
 * visits marked missed, schedules planned 7 days ahead. Idempotent — a retry
 * or a second run changes nothing more.
 */
export async function runFieldNightly(now = new Date()) {
    const settings = await getFieldSettings();
    const today = startOfBusinessDay(now);
    const autoClosed = await autoCloseOpenVisits(today, settings, now);
    const missed = await markMissedVisits(today);
    const planned = await planAllSchedules(today);
    return { planned, missed, autoClosed };
}
//# sourceMappingURL=field-visits.service.js.map