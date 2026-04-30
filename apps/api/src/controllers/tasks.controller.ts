import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Task } from '../models/task.model.js';
import { NotFoundError } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { audit } from '../services/audit.service.js';

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  milestoneId: z.string().optional(),
  assignee: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dueDate: z.coerce.date().optional(),
  estimatedHours: z.coerce.number().optional(),
  labels: z.array(z.string()).optional(),
  parentTask: z.string().optional(),
  order: z.coerce.number().optional(),
});

export const updateTaskSchema = createTaskSchema.partial();

export const updateStatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']),
  order: z.coerce.number().optional(),
});

export const reorderSchema = z.object({
  items: z.array(
    z.object({
      _id: z.string(),
      status: z.enum(['todo', 'in_progress', 'in_review', 'done']),
      order: z.coerce.number(),
    }),
  ),
});

export async function listTasks(req: Request, res: Response): Promise<void> {
  const projectId = String(req.params.projectId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { projectId: new Types.ObjectId(projectId) };
  if (q.status) filter.status = q.status;
  if (q.assignee) filter.assignee = q.assignee;
  if (q.milestoneId) filter.milestoneId = q.milestoneId;

  const tasks = await Task.find(filter)
    .sort('status order')
    .populate('assignee', 'firstName lastName email avatar')
    .exec();
  res.json({ success: true, data: tasks });
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createTaskSchema>;
  const projectId = String(req.params.projectId);
  const userId = getUserId();
  // determine next order in column
  const maxOrder = await Task.findOne({
    projectId: new Types.ObjectId(projectId),
    status: body.status ?? 'todo',
  })
    .sort('-order')
    .select('order')
    .lean()
    .exec();
  const doc = await Task.create({
    ...body,
    projectId: new Types.ObjectId(projectId),
    assignee: body.assignee ? new Types.ObjectId(body.assignee) : undefined,
    milestoneId: body.milestoneId ? new Types.ObjectId(body.milestoneId) : undefined,
    parentTask: body.parentTask ? new Types.ObjectId(body.parentTask) : undefined,
    order: body.order ?? (maxOrder ? maxOrder.order + 1 : 0),
    createdBy: userId ? new Types.ObjectId(userId) : undefined,
  });
  void audit({ action: 'create', entity: 'Task', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function getTask(req: Request, res: Response): Promise<void> {
  const doc = await Task.findById(String(req.params.id))
    .populate('assignee', 'firstName lastName email avatar')
    .exec();
  if (!doc) throw new NotFoundError('Task not found');
  res.json({ success: true, data: doc });
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateTaskSchema>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { ...body };
  if (body.assignee) update.assignee = new Types.ObjectId(body.assignee);
  const doc = await Task.findByIdAndUpdate(String(req.params.id), update, { new: true }).exec();
  if (!doc) throw new NotFoundError('Task not found');
  void audit({ action: 'update', entity: 'Task', entityId: String(doc._id) });
  res.json({ success: true, data: doc });
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  const doc = await Task.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Task not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  res.json({ success: true, message: 'Task deleted' });
}

export async function updateTaskStatus(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateStatusSchema>;
  const doc = await Task.findByIdAndUpdate(
    String(req.params.id),
    { status: body.status, ...(body.order !== undefined ? { order: body.order } : {}) },
    { new: true },
  ).exec();
  if (!doc) throw new NotFoundError('Task not found');
  res.json({ success: true, data: doc });
}

export async function reorderTasks(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof reorderSchema>;
  await Promise.all(
    body.items.map((it) =>
      Task.findByIdAndUpdate(it._id, { status: it.status, order: it.order }).exec(),
    ),
  );
  res.json({ success: true, message: 'Tasks reordered' });
}
