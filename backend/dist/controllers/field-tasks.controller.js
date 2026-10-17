import { z } from 'zod';
import { FieldTask } from '../models/field-task.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { assertOwnOrPermission, currentEmployeeId, hasPermission } from '../lib/access.js';
/** Field managers see and edit every task; reps only those assigned to them. */
const MANAGE = 'field-sales.manage';
export const createTaskSchema = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assignedTo: z.string().min(1),
    clientId: z.string().optional(),
    location: z
        .object({
        lat: z.coerce.number().optional(),
        lng: z.coerce.number().optional(),
        address: z.string().optional(),
    })
        .optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    status: z
        .enum(['new', 'accepted', 'in_progress', 'completed', 'cancelled'])
        .default('new'),
    dueDate: z.coerce.date().optional(),
});
export const updateTaskSchema = createTaskSchema.partial();
export const completeSchema = z.object({
    completionPhotos: z.array(z.string()).optional(),
    completionNotes: z.string().optional(),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(20),
    assignedTo: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    sort: z.string().optional(),
});
/** 404 if the task does not exist; 403 unless it is assigned to the caller or they manage. */
async function assertTaskAccess(req, id) {
    const task = await FieldTask.findById(id).select('assignedTo').lean().exec();
    if (!task)
        throw new NotFoundError('Task not found');
    await assertOwnOrPermission(req, task.assignedTo, MANAGE);
}
export async function listTasks(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.assignedTo)
        filter.assignedTo = q.assignedTo;
    // Reps only ever see their own (`null` — no employee record — matches nothing).
    if (!hasPermission(req.user, MANAGE))
        filter.assignedTo = await currentEmployeeId(req);
    if (q.status)
        filter.status = q.status;
    if (q.priority)
        filter.priority = q.priority;
    const result = await FieldTask.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'assignedTo', select: 'firstName lastName employeeCode' },
            { path: 'clientId', select: 'name' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myTasks(req, res) {
    const empId = await currentEmployeeId(req);
    if (!empId)
        throw new ValidationAppError('Employee profile not found');
    const docs = await FieldTask.find({ assignedTo: empId })
        .populate('clientId', 'name address')
        .sort({ dueDate: 1 })
        .exec();
    res.json({ success: true, data: docs });
}
export async function teamTasks(req, res) {
    const filter = {};
    if (!hasPermission(req.user, MANAGE))
        filter.assignedTo = await currentEmployeeId(req);
    const docs = await FieldTask.find(filter)
        .populate('assignedTo', 'firstName lastName')
        .populate('clientId', 'name')
        .sort({ createdAt: -1 })
        .exec();
    res.json({ success: true, data: docs });
}
export async function getTask(req, res) {
    const doc = await FieldTask.findById(String(req.params.id))
        .populate('assignedTo', 'firstName lastName employeeCode')
        .populate('clientId', 'name address')
        .exec();
    if (!doc)
        throw new NotFoundError('Task not found');
    await assertOwnOrPermission(req, doc.assignedTo, MANAGE);
    res.json({ success: true, data: doc });
}
export async function createTask(req, res) {
    const body = req.body;
    const doc = await FieldTask.create(body);
    void audit({ action: 'create', entity: 'FieldTask', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateTask(req, res) {
    await assertTaskAccess(req, String(req.params.id));
    const update = { ...req.body };
    // Only a manager may reassign a task.
    if (!hasPermission(req.user, MANAGE))
        delete update.assignedTo;
    const doc = await FieldTask.findByIdAndUpdate(String(req.params.id), update, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Task not found');
    res.json({ success: true, data: doc });
}
export async function deleteTask(req, res) {
    const doc = await FieldTask.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Task not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    res.json({ success: true, message: 'Task deleted' });
}
export async function acceptTask(req, res) {
    await assertTaskAccess(req, String(req.params.id));
    const doc = await FieldTask.findByIdAndUpdate(String(req.params.id), { status: 'accepted' }, { new: true }).exec();
    if (!doc)
        throw new NotFoundError('Task not found');
    res.json({ success: true, data: doc });
}
export async function completeTask(req, res) {
    const body = req.body;
    await assertTaskAccess(req, String(req.params.id));
    const doc = await FieldTask.findByIdAndUpdate(String(req.params.id), {
        status: 'completed',
        completedAt: new Date(),
        completionPhotos: body.completionPhotos ?? [],
        completionNotes: body.completionNotes,
    }, { new: true }).exec();
    if (!doc)
        throw new NotFoundError('Task not found');
    res.json({ success: true, data: doc });
}
//# sourceMappingURL=field-tasks.controller.js.map