import { z } from 'zod';
import { Visit } from '../models/visit.model.js';
import { Client } from '../models/client.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { env } from '../config/env.js';
import { currentEmployeeId } from '../lib/access.js';
import { assertFieldRead, assertFieldWrite, canManageField, fieldScope, ownerForCreate, requireOwnEmployeeId, } from '../lib/field-access.js';
import { businessDayWindow, dateBound, distanceMeters, objectIdString, pageParams, pointOf, rangeFilter, sortParam, windowForDateParam, } from '../lib/field-utils.js';
/*
 * Lifecycle: `scheduled` (planned, POST /visits) → `in_progress` (check-in)
 * → `completed` (check-out); `scheduled | in_progress → cancelled`. One open
 * (`in_progress`) visit per rep; check-out happens once, after a check-in.
 * Times are the server's clock — a client-supplied check-in/out time is ignored.
 */
const PURPOSES = ['sales', 'service', 'collection', 'followup', 'delivery', 'other'];
/** Mobile app spellings → stored purpose. */
const PURPOSE_ALIASES = {
    support: 'service',
    follow_up: 'followup',
    'follow-up': 'followup',
};
const purposeSchema = z.preprocess((v) => (typeof v === 'string' ? (PURPOSE_ALIASES[v] ?? v) : v), z.enum(PURPOSES));
const OUTCOMES = ['positive', 'negative', 'neutral', 'followup_required'];
/** Mobile app outcomes → stored outcome. */
const OUTCOME_ALIASES = {
    successful: 'positive',
    order_taken: 'positive',
    payment_collected: 'positive',
    follow_up_needed: 'followup_required',
    not_available: 'negative',
    other: 'neutral',
};
const outcomeSchema = z.preprocess((v) => (typeof v === 'string' ? (OUTCOME_ALIASES[v] ?? v) : v), z.enum(OUTCOMES));
const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];
const latLng = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accuracy: z.coerce.number().min(0).optional(),
});
/** A photo reference — the `url` returned by POST /field/uploads/photo. */
const photoRef = z.string().trim().min(1).max(2048);
const address = z.string().trim().max(500);
const notes = z.string().trim().max(5000);
/** A check-in/out point. `time` is accepted for compatibility and ignored. */
const checkpointSchema = z.object({
    location: latLng.optional(),
    photo: photoRef.optional(),
    address: address.optional(),
});
export const createVisitSchema = z.object({
    /** Honoured only for a field manager (plan a visit for a rep). */
    employeeId: objectIdString.optional(),
    clientId: objectIdString,
    purpose: purposeSchema.default('sales'),
    isPlanned: z.boolean().default(true),
    notes: notes.optional(),
    /** A visit is planned here; check-in starts it. */
    status: z.literal('scheduled').default('scheduled'),
    meetingWith: z.string().trim().max(200).optional(),
});
export const updateVisitSchema = z.object({
    purpose: purposeSchema.optional(),
    notes: notes.optional(),
    outcome: outcomeSchema.optional(),
    nextFollowUpDate: z.coerce.date().optional(),
    followUpDate: z.coerce.date().optional(),
    status: z.enum(STATUSES).optional(),
    photos: z.array(photoRef).max(20).optional(),
    productsDiscussed: z.array(z.string().trim().max(200)).max(100).optional(),
    meetingWith: z.string().trim().max(200).optional(),
});
/**
 * Web shape `{ clientId, purpose, checkIn: { location, photo, address } }`; the
 * mobile app's flat `{ clientId, purpose, location, photo, notes }` is
 * accepted too. `visitId` starts a planned visit instead of creating one.
 */
export const checkInSchema = z.object({
    clientId: objectIdString,
    visitId: objectIdString.optional(),
    purpose: purposeSchema.default('sales'),
    isPlanned: z.boolean().optional(),
    checkIn: checkpointSchema.optional(),
    location: latLng.optional(),
    photo: photoRef.optional(),
    address: address.optional(),
    notes: notes.optional(),
});
/**
 * Web `{ checkOut: {...}, notes, outcome }`; mobile flat `{ location, photo,
 * outcome, followUpDate, ... }`. `notes` here are stored as `checkOut.notes`
 * (the visit's own `notes` stay the check-in notes).
 */
export const checkOutSchema = z.object({
    checkOut: checkpointSchema.optional(),
    location: latLng.optional(),
    photo: photoRef.optional(),
    address: address.optional(),
    notes: notes.optional(),
    outcome: outcomeSchema.optional(),
    nextFollowUpDate: z.coerce.date().optional(),
    followUpDate: z.coerce.date().optional(),
    productsDiscussed: z.array(z.string().trim().max(200)).max(100).optional(),
});
export const listQuerySchema = z.object({
    ...pageParams,
    employeeId: objectIdString.optional(),
    clientId: objectIdString.optional(),
    status: z.enum(STATUSES).optional(),
    purpose: purposeSchema.optional(),
    from: dateBound('from').optional(),
    to: dateBound('to').optional(),
    sort: sortParam(['createdAt', 'checkIn.time', 'checkOut.time']).optional(),
});
const LIST_POPULATE = [
    { path: 'clientId', select: 'name category company address location' },
    { path: 'employeeId', select: 'firstName lastName employeeId avatar' },
];
/** Visits that happened (checked in) or were logged within `[start, end)`. */
function inWindow(start, end) {
    const range = { $gte: start, $lt: end };
    return { $or: [{ 'checkIn.time': range }, { 'checkIn.time': null, createdAt: range }] };
}
async function loadVisit(id) {
    const visit = await Visit.findById(id).exec();
    if (!visit)
        throw new NotFoundError('Visit not found');
    return visit;
}
async function loadClient(id) {
    const client = await Client.findById(id).select('name location').lean().exec();
    if (!client)
        throw new NotFoundError('Client not found');
    return client;
}
const isDuplicateKey = (err) => typeof err === 'object' && err !== null && err.code === 11000;
function alreadyOpen(visitId) {
    return new AppError('You already have a visit in progress — check out of it first', 409, 'VISIT_ALREADY_OPEN', visitId ? { visitId: String(visitId) } : undefined);
}
export async function listVisits(req, res) {
    const q = req.query;
    const filter = await fieldScope(req, q.employeeId);
    if (q.clientId)
        filter.clientId = q.clientId;
    if (q.status)
        filter.status = q.status;
    if (q.purpose)
        filter.purpose = q.purpose;
    const range = rangeFilter(q.from, q.to);
    if (range)
        filter.createdAt = range;
    const result = await Visit.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: LIST_POPULATE,
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** The caller's visits today (IST); a field manager without an employee record sees everyone's. */
export async function todayVisits(req, res) {
    const { start, end } = businessDayWindow();
    const filter = inWindow(start, end);
    const empId = await currentEmployeeId(req);
    if (empId)
        filter.employeeId = empId;
    else if (!canManageField(req))
        await requireOwnEmployeeId(req);
    const docs = await Visit.find(filter)
        .populate('clientId', 'name category address location')
        .sort({ createdAt: -1 })
        .limit(200)
        .exec();
    res.json({ success: true, data: docs });
}
export async function getVisit(req, res) {
    const doc = await Visit.findById(String(req.params.id))
        .populate('clientId', 'name category company phone address location')
        .populate('employeeId', 'firstName lastName employeeId avatar')
        .exec();
    if (!doc)
        throw new NotFoundError('Visit not found');
    await assertFieldRead(req, doc.employeeId);
    res.json({ success: true, data: doc });
}
/** Plan a visit (status `scheduled`); the rep starts it with check-in. */
export async function createVisit(req, res) {
    const body = req.body;
    const employeeId = await ownerForCreate(req, body.employeeId);
    await loadClient(body.clientId);
    const doc = await Visit.create({
        employeeId,
        clientId: body.clientId,
        purpose: body.purpose,
        isPlanned: body.isPlanned,
        notes: body.notes,
        meetingWith: body.meetingWith,
        status: 'scheduled',
    });
    void audit({ action: 'create', entity: 'Visit', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateVisit(req, res) {
    const body = req.body;
    const visit = await loadVisit(String(req.params.id));
    await assertFieldWrite(req, visit.employeeId);
    const set = {};
    for (const key of ['purpose', 'notes', 'outcome', 'photos', 'productsDiscussed', 'meetingWith']) {
        if (body[key] !== undefined)
            set[key] = body[key];
    }
    const followUp = body.nextFollowUpDate ?? body.followUpDate;
    if (followUp)
        set.nextFollowUpDate = followUp;
    // Status changes follow the lifecycle; completion here closes an open visit
    // the same way a check-out does.
    const expected = {};
    if (body.status && body.status !== visit.status) {
        if (visit.status === 'completed' || visit.status === 'cancelled') {
            throw new AppError(`The visit is already ${visit.status}`, 409, 'VISIT_CLOSED');
        }
        if (body.status === 'in_progress') {
            throw new ValidationAppError('Start a visit with POST /field/visits/check-in');
        }
        if (body.status === 'scheduled') {
            throw new AppError('A started visit cannot go back to scheduled', 409, 'INVALID_STATUS_TRANSITION');
        }
        if (body.status === 'completed') {
            if (!visit.checkIn?.time) {
                throw new AppError('A visit can only be completed after a check-in', 409, 'VISIT_NOT_CHECKED_IN');
            }
            const now = new Date();
            set['checkOut.time'] = now;
            set.duration = Math.max(0, Math.round((now.getTime() - visit.checkIn.time.getTime()) / 60_000));
        }
        set.status = body.status;
        expected.status = visit.status; // nobody changed it in between
    }
    const doc = await Visit.findOneAndUpdate({ _id: visit._id, ...expected }, { $set: set }, { new: true }).exec();
    if (!doc)
        throw new AppError('The visit changed meanwhile — reload and try again', 409, 'VISIT_CHANGED');
    res.json({ success: true, data: doc });
}
export async function deleteVisit(req, res) {
    const doc = await loadVisit(String(req.params.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete({ by: req.user?._id });
    void audit({ action: 'delete', entity: 'Visit', entityId: String(doc._id) });
    res.json({ success: true, message: 'Visit deleted' });
}
/**
 * Start a visit at a client. Stores how far the check-in fix was from the
 * client's pin and flags it (`locationMismatch`) beyond FIELD_VISIT_RADIUS_M;
 * a check-in without a fix at a client that has a pin is flagged
 * `locationMissing` — flags for the manager, never a refusal.
 */
export async function checkIn(req, res) {
    const body = req.body;
    const empId = await requireOwnEmployeeId(req);
    const client = await loadClient(body.clientId);
    const location = body.checkIn?.location ?? body.location;
    const point = {
        time: new Date(),
        ...(location ? { location } : {}),
        ...((body.checkIn?.photo ?? body.photo) ? { photo: body.checkIn?.photo ?? body.photo } : {}),
        ...((body.checkIn?.address ?? body.address) ? { address: body.checkIn?.address ?? body.address } : {}),
    };
    const clientPoint = pointOf(client.location?.coordinates);
    const distanceFromClientM = location && clientPoint ? Math.round(distanceMeters(location, clientPoint)) : undefined;
    const locationMismatch = distanceFromClientM !== undefined && distanceFromClientM > env.FIELD_VISIT_RADIUS_M;
    // Nothing to compare: without a fix a check-in could be made from anywhere.
    const locationMissing = !location && clientPoint !== null;
    const open = await Visit.findOne({ employeeId: empId, status: 'in_progress' }).select('_id').lean().exec();
    if (open)
        throw alreadyOpen(open._id);
    const fields = {
        purpose: body.purpose,
        checkIn: point,
        status: 'in_progress',
        distanceFromClientM,
        locationMismatch,
        locationMissing,
        ...(body.notes ? { notes: body.notes } : {}),
    };
    let doc;
    try {
        if (body.visitId) {
            const planned = await loadVisit(body.visitId);
            await assertFieldWrite(req, planned.employeeId);
            if (String(planned.employeeId) !== String(empId)) {
                throw new AppError('Only the assigned rep can start this visit', 403, 'FORBIDDEN');
            }
            if (String(planned.clientId) !== String(client._id)) {
                throw new ValidationAppError('The planned visit is for a different client');
            }
            doc = await Visit.findOneAndUpdate({ _id: planned._id, status: 'scheduled' }, { $set: fields }, { new: true }).exec();
            if (!doc)
                throw new AppError('The planned visit has already been started or closed', 409, 'VISIT_CLOSED');
        }
        else {
            doc = await Visit.create({
                employeeId: empId,
                clientId: client._id,
                isPlanned: body.isPlanned ?? false,
                ...fields,
            });
        }
    }
    catch (err) {
        // The partial unique index catches a concurrent second check-in.
        if (isDuplicateKey(err))
            throw alreadyOpen();
        throw err;
    }
    await Client.updateOne({ _id: client._id }, { $set: { lastVisitDate: point.time } }).exec();
    res.status(201).json({ success: true, data: doc });
}
/** Close an open visit — once, and only after its check-in. */
export async function checkOut(req, res) {
    const body = req.body;
    const visit = await loadVisit(String(req.params.id));
    await assertFieldWrite(req, visit.employeeId);
    if (visit.checkOut?.time || visit.status === 'completed') {
        throw new AppError('This visit is already checked out', 409, 'VISIT_ALREADY_CHECKED_OUT');
    }
    if (visit.status === 'cancelled')
        throw new AppError('The visit was cancelled', 409, 'VISIT_CLOSED');
    if (!visit.checkIn?.time) {
        throw new AppError('Check in to the visit before checking out', 409, 'VISIT_NOT_CHECKED_IN');
    }
    const now = new Date();
    const location = body.checkOut?.location ?? body.location;
    const photo = body.checkOut?.photo ?? body.photo;
    const addr = body.checkOut?.address ?? body.address;
    // Check-out notes are kept apart from the check-in ones (`notes`) — the
    // mobile app sends notes at both steps and one must not erase the other.
    const set = {
        checkOut: {
            time: now,
            ...(location ? { location } : {}),
            ...(photo ? { photo } : {}),
            ...(addr ? { address: addr } : {}),
            ...(body.notes ? { notes: body.notes } : {}),
        },
        duration: Math.max(0, Math.round((now.getTime() - visit.checkIn.time.getTime()) / 60_000)),
        status: 'completed',
    };
    if (body.outcome)
        set.outcome = body.outcome;
    const followUp = body.nextFollowUpDate ?? body.followUpDate;
    if (followUp)
        set.nextFollowUpDate = followUp;
    if (body.productsDiscussed)
        set.productsDiscussed = body.productsDiscussed;
    // Conditional on still being open, so two concurrent check-outs cannot both win.
    const doc = await Visit.findOneAndUpdate({ _id: visit._id, status: 'in_progress', 'checkOut.time': null }, { $set: set }, { new: true }).exec();
    if (!doc)
        throw new AppError('This visit is already checked out', 409, 'VISIT_ALREADY_CHECKED_OUT');
    res.json({ success: true, data: doc });
}
/** A rep's visits on one IST day (`?date=YYYY-MM-DD`, default today). */
export async function visitTimeline(req, res) {
    const employeeId = String(req.params.employeeId);
    if (!objectIdString.safeParse(employeeId).success)
        throw new ValidationAppError('Invalid employee id');
    await assertFieldRead(req, employeeId);
    const { start, end } = windowForDateParam(req.query.date);
    const docs = await Visit.find({ employeeId, ...inWindow(start, end) })
        .populate('clientId', 'name address location')
        .sort({ 'checkIn.time': 1, createdAt: 1 })
        .limit(500)
        .exec();
    res.json({ success: true, data: docs });
}
//# sourceMappingURL=field-visits.controller.js.map