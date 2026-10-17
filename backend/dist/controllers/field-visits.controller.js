import { z } from 'zod';
import { Visit } from '../models/visit.model.js';
import { Client } from '../models/client.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { assertOwnOrPermission, currentEmployeeId, hasPermission } from '../lib/access.js';
/** Field managers see and edit every rep's visits; reps only their own. */
const MANAGE = 'field-sales.manage';
const checkpointSchema = z.object({
    time: z.coerce.date().optional(),
    location: z
        .object({
        lat: z.coerce.number(),
        lng: z.coerce.number(),
        accuracy: z.coerce.number().optional(),
    })
        .optional(),
    photo: z.string().url().optional(),
    address: z.string().optional(),
});
export const createVisitSchema = z.object({
    employeeId: z.string().optional(),
    clientId: z.string().min(1),
    purpose: z
        .enum(['sales', 'service', 'collection', 'followup', 'other'])
        .default('sales'),
    isPlanned: z.boolean().default(false),
    notes: z.string().optional(),
    status: z
        .enum(['scheduled', 'in_progress', 'completed', 'cancelled'])
        .default('scheduled'),
    meetingWith: z.string().optional(),
});
export const updateVisitSchema = z.object({
    purpose: z
        .enum(['sales', 'service', 'collection', 'followup', 'other'])
        .optional(),
    notes: z.string().optional(),
    outcome: z.enum(['positive', 'negative', 'neutral', 'followup_required']).optional(),
    nextFollowUpDate: z.coerce.date().optional(),
    status: z
        .enum(['scheduled', 'in_progress', 'completed', 'cancelled'])
        .optional(),
    photos: z.array(z.string()).optional(),
    productsDiscussed: z.array(z.string()).optional(),
});
export const checkInSchema = z.object({
    clientId: z.string().min(1),
    purpose: z
        .enum(['sales', 'service', 'collection', 'followup', 'other'])
        .default('sales'),
    checkIn: checkpointSchema,
    isPlanned: z.boolean().default(false),
});
export const checkOutSchema = z.object({
    checkOut: checkpointSchema,
    notes: z.string().optional(),
    outcome: z.enum(['positive', 'negative', 'neutral', 'followup_required']).optional(),
    productsDiscussed: z.array(z.string()).optional(),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(20),
    employeeId: z.string().optional(),
    clientId: z.string().optional(),
    status: z.string().optional(),
    purpose: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.string().optional(),
});
/** 404 if the visit does not exist; 403 unless it is the caller's or they manage. */
async function assertVisitAccess(req, id) {
    const visit = await Visit.findById(id).select('employeeId').lean().exec();
    if (!visit)
        throw new NotFoundError('Visit not found');
    await assertOwnOrPermission(req, visit.employeeId, MANAGE);
}
export async function listVisits(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.employeeId)
        filter.employeeId = q.employeeId;
    // Reps only ever see their own (`null` — no employee record — matches nothing).
    if (!hasPermission(req.user, MANAGE))
        filter.employeeId = await currentEmployeeId(req);
    if (q.clientId)
        filter.clientId = q.clientId;
    if (q.status)
        filter.status = q.status;
    if (q.purpose)
        filter.purpose = q.purpose;
    if (q.from || q.to) {
        filter.createdAt = {};
        if (q.from)
            filter.createdAt.$gte = q.from;
        if (q.to)
            filter.createdAt.$lte = q.to;
    }
    const result = await Visit.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'clientId', select: 'name category company' },
            { path: 'employeeId', select: 'firstName lastName employeeCode' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function todayVisits(req, res) {
    const empId = await currentEmployeeId(req);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const filter = { createdAt: { $gte: start, $lte: end } };
    // A manager without an employee record still sees everyone's day; anyone
    // else is pinned to their own (or nothing, if they have no record).
    if (empId || !hasPermission(req.user, MANAGE))
        filter.employeeId = empId;
    const docs = await Visit.find(filter)
        .populate('clientId', 'name category address location')
        .sort({ createdAt: -1 })
        .exec();
    res.json({ success: true, data: docs });
}
export async function getVisit(req, res) {
    const doc = await Visit.findById(String(req.params.id))
        .populate('clientId', 'name category company phone')
        .populate('employeeId', 'firstName lastName employeeCode')
        .exec();
    if (!doc)
        throw new NotFoundError('Visit not found');
    await assertOwnOrPermission(req, doc.employeeId, MANAGE);
    res.json({ success: true, data: doc });
}
export async function createVisit(req, res) {
    const body = req.body;
    // Only a manager may log a visit against another rep.
    let employeeId = hasPermission(req.user, MANAGE) ? body.employeeId : undefined;
    if (!employeeId) {
        const own = await currentEmployeeId(req);
        if (!own)
            throw new ValidationAppError('employeeId required');
        employeeId = String(own);
    }
    const doc = await Visit.create({ ...body, employeeId });
    void audit({ action: 'create', entity: 'Visit', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateVisit(req, res) {
    await assertVisitAccess(req, String(req.params.id));
    const doc = await Visit.findByIdAndUpdate(String(req.params.id), req.body, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Visit not found');
    res.json({ success: true, data: doc });
}
export async function deleteVisit(req, res) {
    const doc = await Visit.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Visit not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    res.json({ success: true, message: 'Visit deleted' });
}
export async function checkIn(req, res) {
    const body = req.body;
    const empId = await currentEmployeeId(req);
    if (!empId)
        throw new ValidationAppError('Employee profile not found');
    const checkInPoint = {
        ...body.checkIn,
        time: body.checkIn.time ?? new Date(),
    };
    const doc = await Visit.create({
        employeeId: empId,
        clientId: body.clientId,
        purpose: body.purpose,
        isPlanned: body.isPlanned,
        checkIn: checkInPoint,
        status: 'in_progress',
    });
    // Update client lastVisitDate
    await Client.updateOne({ _id: body.clientId }, { $set: { lastVisitDate: checkInPoint.time } }).exec();
    res.status(201).json({ success: true, data: doc });
}
export async function checkOut(req, res) {
    const body = req.body;
    const visit = await Visit.findById(String(req.params.id)).exec();
    if (!visit)
        throw new NotFoundError('Visit not found');
    await assertOwnOrPermission(req, visit.employeeId, MANAGE);
    if (!visit.checkIn?.time) {
        throw new ValidationAppError('Visit has no check-in');
    }
    const checkOutPoint = {
        ...body.checkOut,
        time: body.checkOut.time ?? new Date(),
    };
    visit.checkOut = checkOutPoint;
    visit.duration = Math.round((checkOutPoint.time.getTime() - visit.checkIn.time.getTime()) / 60000);
    if (body.notes)
        visit.notes = body.notes;
    if (body.outcome)
        visit.outcome = body.outcome;
    if (body.productsDiscussed)
        visit.productsDiscussed = body.productsDiscussed;
    visit.status = 'completed';
    await visit.save();
    res.json({ success: true, data: visit });
}
export async function visitTimeline(req, res) {
    const employeeId = String(req.params.employeeId);
    await assertOwnOrPermission(req, employeeId, MANAGE);
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await Visit.find({
        employeeId,
        createdAt: { $gte: start, $lte: end },
    })
        .populate('clientId', 'name address location')
        .sort({ createdAt: 1 })
        .exec();
    res.json({ success: true, data: docs });
}
//# sourceMappingURL=field-visits.controller.js.map