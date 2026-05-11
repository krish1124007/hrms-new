import { Types } from 'mongoose';
import { z } from 'zod';
import { TimeEntry } from '../models/time-entry.model.js';
import { NotFoundError } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { audit } from '../services/audit.service.js';
export const createTimeEntrySchema = z.object({
    taskId: z.string().optional(),
    userId: z.string().optional(),
    date: z.coerce.date(),
    hours: z.coerce.number().positive(),
    description: z.string().optional(),
    isBillable: z.boolean().optional(),
});
export const updateTimeEntrySchema = createTimeEntrySchema.partial();
export async function listTimeEntries(req, res) {
    const projectId = String(req.params.projectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { projectId: new Types.ObjectId(projectId) };
    if (q.from || q.to) {
        filter.date = {};
        if (q.from)
            filter.date.$gte = new Date(q.from);
        if (q.to)
            filter.date.$lte = new Date(q.to);
    }
    if (q.userId)
        filter.userId = q.userId;
    const items = await TimeEntry.find(filter)
        .sort('-date')
        .populate('userId', 'firstName lastName email avatar')
        .populate('taskId', 'title')
        .exec();
    res.json({ success: true, data: items });
}
export async function createTimeEntry(req, res) {
    const body = req.body;
    const projectId = String(req.params.projectId);
    const me = getUserId();
    const doc = await TimeEntry.create({
        projectId: new Types.ObjectId(projectId),
        taskId: body.taskId ? new Types.ObjectId(body.taskId) : undefined,
        userId: new Types.ObjectId(body.userId ?? me ?? ''),
        date: body.date,
        hours: body.hours,
        description: body.description,
        isBillable: body.isBillable ?? true,
    });
    void audit({ action: 'create', entity: 'TimeEntry', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateTimeEntry(req, res) {
    const body = req.body;
    const doc = await TimeEntry.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!doc)
        throw new NotFoundError('Time entry not found');
    res.json({ success: true, data: doc });
}
export async function deleteTimeEntry(req, res) {
    const doc = await TimeEntry.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Time entry not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    res.json({ success: true, message: 'Time entry deleted' });
}
export async function getTimeEntrySummary(req, res) {
    const projectId = String(req.params.projectId);
    const byUser = await TimeEntry.aggregate([
        { $match: { projectId: new Types.ObjectId(projectId) } },
        { $group: { _id: '$userId', hours: { $sum: '$hours' } } },
    ]);
    const byTask = await TimeEntry.aggregate([
        { $match: { projectId: new Types.ObjectId(projectId) } },
        { $group: { _id: '$taskId', hours: { $sum: '$hours' } } },
    ]);
    res.json({ success: true, data: { byUser, byTask } });
}
/* My / weekly timesheets */
export async function myTimesheets(req, res) {
    const me = getUserId();
    if (!me) {
        res.json({ success: true, data: [] });
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { userId: new Types.ObjectId(me) };
    if (q.from || q.to) {
        filter.date = {};
        if (q.from)
            filter.date.$gte = new Date(q.from);
        if (q.to)
            filter.date.$lte = new Date(q.to);
    }
    const items = await TimeEntry.find(filter)
        .sort('-date')
        .populate('projectId', 'name code color')
        .populate('taskId', 'title')
        .exec();
    res.json({ success: true, data: items });
}
export async function weeklyTimesheet(req, res) {
    const me = getUserId();
    if (!me) {
        res.json({ success: true, data: { rows: [], days: [] } });
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const weekStart = q.weekStart ? new Date(q.weekStart) : startOfWeek(new Date());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const entries = await TimeEntry.find({
        userId: new Types.ObjectId(me),
        date: { $gte: weekStart, $lt: weekEnd },
    })
        .populate('projectId', 'name code color')
        .exec();
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        days.push(d.toISOString().slice(0, 10));
    }
    // group by project then by day
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byProject = new Map();
    for (const e of entries) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const proj = e.projectId;
        const k = String(proj?._id ?? proj);
        if (!byProject.has(k)) {
            byProject.set(k, { project: proj, perDay: {}, total: 0 });
        }
        const row = byProject.get(k);
        const day = e.date.toISOString().slice(0, 10);
        row.perDay[day] = (row.perDay[day] ?? 0) + e.hours;
        row.total += e.hours;
    }
    res.json({
        success: true,
        data: { weekStart, days, rows: Array.from(byProject.values()) },
    });
}
function startOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = (day + 6) % 7; // Monday = start
    date.setDate(date.getDate() - diff);
    date.setHours(0, 0, 0, 0);
    return date;
}
//# sourceMappingURL=time-entries.controller.js.map