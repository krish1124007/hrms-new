import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Milestone } from '../models/milestone.model.js';
import { NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';

export const createMilestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  status: z.enum(['pending', 'completed']).optional(),
  order: z.coerce.number().int().optional(),
});

export const updateMilestoneSchema = createMilestoneSchema.partial();

export async function listMilestones(req: Request, res: Response): Promise<void> {
  const projectId = String(req.params.projectId);
  const items = await Milestone.find({ projectId: new Types.ObjectId(projectId) })
    .sort('order dueDate')
    .exec();
  res.json({ success: true, data: items });
}

export async function createMilestone(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createMilestoneSchema>;
  const projectId = String(req.params.projectId);
  const doc = await Milestone.create({ ...body, projectId: new Types.ObjectId(projectId) });
  void audit({ action: 'create', entity: 'Milestone', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function updateMilestone(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateMilestoneSchema>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { ...body };
  if (body.status === 'completed') update.completedAt = new Date();
  const doc = await Milestone.findByIdAndUpdate(String(req.params.id), update, { new: true }).exec();
  if (!doc) throw new NotFoundError('Milestone not found');
  void audit({ action: 'update', entity: 'Milestone', entityId: String(doc._id) });
  res.json({ success: true, data: doc });
}

export async function deleteMilestone(req: Request, res: Response): Promise<void> {
  const doc = await Milestone.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Milestone not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  res.json({ success: true, message: 'Milestone deleted' });
}
