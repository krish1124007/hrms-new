import { Types } from 'mongoose';
import { z } from 'zod';
import { Project } from '../models/project.model.js';
import { Task } from '../models/task.model.js';
import { Milestone } from '../models/milestone.model.js';
import { TimeEntry } from '../models/time-entry.model.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
export const memberSchema = z.object({
    userId: z.string().min(1),
    role: z.enum(['manager', 'member', 'viewer']).default('member'),
});
export const createProjectSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().optional(),
    client: z.string().optional(),
    category: z.string().optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    estimatedHours: z.coerce.number().optional(),
    budget: z.coerce.number().optional(),
    status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    members: z.array(memberSchema).optional(),
    progress: z.coerce.number().min(0).max(100).optional(),
    color: z.string().optional(),
    tags: z.array(z.string()).optional(),
});
export const updateProjectSchema = createProjectSchema.partial();
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
    client: z.string().optional(),
    member: z.string().optional(),
    search: z.string().optional(),
    sort: z.string().optional(),
});
export async function listProjects(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.status)
        filter.status = q.status;
    if (q.client)
        filter.client = q.client;
    if (q.member)
        filter['members.userId'] = q.member;
    if (q.search) {
        filter.$or = [
            { name: { $regex: q.search, $options: 'i' } },
            { code: { $regex: q.search, $options: 'i' } },
        ];
    }
    const result = await Project.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'client', select: 'name' },
            { path: 'members.userId', select: 'firstName lastName email avatar' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createProject(req, res) {
    const body = req.body;
    const exists = await Project.findOne({ code: body.code.toUpperCase() }).exec();
    if (exists)
        throw new ConflictError('Project code already exists');
    const project = await Project.create({
        ...body,
        members: (body.members ?? []).map((m) => ({
            userId: new Types.ObjectId(m.userId),
            role: m.role,
            joinedAt: new Date(),
        })),
    });
    void audit({ action: 'create', entity: 'Project', entityId: String(project._id) });
    res.status(201).json({ success: true, data: project });
}
export async function getProject(req, res) {
    const project = await Project.findById(String(req.params.id))
        .populate('client', 'name email')
        .populate('members.userId', 'firstName lastName email avatar')
        .exec();
    if (!project)
        throw new NotFoundError('Project not found');
    res.json({ success: true, data: project });
}
export async function updateProject(req, res) {
    const body = req.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = { ...body };
    if (body.members) {
        update.members = body.members.map((m) => ({
            userId: new Types.ObjectId(m.userId),
            role: m.role,
            joinedAt: new Date(),
        }));
    }
    const project = await Project.findByIdAndUpdate(String(req.params.id), update, {
        new: true,
    }).exec();
    if (!project)
        throw new NotFoundError('Project not found');
    void audit({ action: 'update', entity: 'Project', entityId: String(project._id) });
    res.json({ success: true, data: project });
}
export async function deleteProject(req, res) {
    const project = await Project.findById(String(req.params.id)).exec();
    if (!project)
        throw new NotFoundError('Project not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await project.softDelete();
    void audit({ action: 'delete', entity: 'Project', entityId: String(project._id) });
    res.json({ success: true, message: 'Project deleted' });
}
export async function getProjectDashboard(req, res) {
    const id = String(req.params.id);
    const project = await Project.findById(id).exec();
    if (!project)
        throw new NotFoundError('Project not found');
    const [taskStats, milestoneStats, hoursAgg] = await Promise.all([
        Task.aggregate([
            { $match: { projectId: new Types.ObjectId(id) } },
            { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        Milestone.aggregate([
            { $match: { projectId: new Types.ObjectId(id) } },
            { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        TimeEntry.aggregate([
            { $match: { projectId: new Types.ObjectId(id) } },
            { $group: { _id: null, hours: { $sum: '$hours' } } },
        ]),
    ]);
    res.json({
        success: true,
        data: {
            project,
            taskStats,
            milestoneStats,
            totalHours: hoursAgg[0]?.hours ?? 0,
        },
    });
}
/* ── Project members ── */
export async function addMember(req, res) {
    const body = req.body;
    const project = await Project.findById(String(req.params.id)).exec();
    if (!project)
        throw new NotFoundError('Project not found');
    if (project.members.find((m) => String(m.userId) === body.userId)) {
        throw new ConflictError('User already in project');
    }
    project.members.push({
        userId: new Types.ObjectId(body.userId),
        role: body.role,
        joinedAt: new Date(),
    });
    await project.save();
    res.json({ success: true, data: project.members });
}
export async function removeMember(req, res) {
    const project = await Project.findById(String(req.params.id)).exec();
    if (!project)
        throw new NotFoundError('Project not found');
    project.members = project.members.filter((m) => String(m.userId) !== String(req.params.userId));
    await project.save();
    res.json({ success: true, data: project.members });
}
//# sourceMappingURL=projects.controller.js.map