import type { Request, Response } from 'express';
import { z } from 'zod';
import { Visit } from '../models/visit.model.js';
import { Client } from '../models/client.model.js';
import { Employee } from '../models/employee.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';

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

async function resolveEmployeeIdFromContext(): Promise<string | null> {
  const userId = getUserId();
  if (!userId) return null;
  const emp = await Employee.findOne({ userId }).select('_id').exec();
  return emp ? String(emp._id) : null;
}

export async function listVisits(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.employeeId) filter.employeeId = q.employeeId;
  if (q.clientId) filter.clientId = q.clientId;
  if (q.status) filter.status = q.status;
  if (q.purpose) filter.purpose = q.purpose;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = q.from;
    if (q.to) filter.createdAt.$lte = q.to;
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

export async function todayVisits(_req: Request, res: Response): Promise<void> {
  const empId = await resolveEmployeeIdFromContext();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const filter: Record<string, unknown> = { createdAt: { $gte: start, $lte: end } };
  if (empId) filter.employeeId = empId;
  const docs = await Visit.find(filter)
    .populate('clientId', 'name category address location')
    .sort({ createdAt: -1 })
    .exec();
  res.json({ success: true, data: docs });
}

export async function getVisit(req: Request, res: Response): Promise<void> {
  const doc = await Visit.findById(String(req.params.id))
    .populate('clientId', 'name category company phone')
    .populate('employeeId', 'firstName lastName employeeCode')
    .exec();
  if (!doc) throw new NotFoundError('Visit not found');
  res.json({ success: true, data: doc });
}

export async function createVisit(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createVisitSchema>;
  let employeeId = body.employeeId;
  if (!employeeId) {
    const resolved = await resolveEmployeeIdFromContext();
    if (!resolved) throw new ValidationAppError('employeeId required');
    employeeId = resolved;
  }
  const doc = await Visit.create({ ...body, employeeId });
  void audit({ action: 'create', entity: 'Visit', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function updateVisit(req: Request, res: Response): Promise<void> {
  const doc = await Visit.findByIdAndUpdate(String(req.params.id), req.body, {
    new: true,
  }).exec();
  if (!doc) throw new NotFoundError('Visit not found');
  res.json({ success: true, data: doc });
}

export async function deleteVisit(req: Request, res: Response): Promise<void> {
  const doc = await Visit.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Visit not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  res.json({ success: true, message: 'Visit deleted' });
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkInSchema>;
  const empId = await resolveEmployeeIdFromContext();
  if (!empId) throw new ValidationAppError('Employee profile not found');

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
  await Client.updateOne(
    { _id: body.clientId },
    { $set: { lastVisitDate: checkInPoint.time } },
  ).exec();

  res.status(201).json({ success: true, data: doc });
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkOutSchema>;
  const visit = await Visit.findById(String(req.params.id)).exec();
  if (!visit) throw new NotFoundError('Visit not found');
  if (!visit.checkIn?.time) {
    throw new ValidationAppError('Visit has no check-in');
  }
  const checkOutPoint = {
    ...body.checkOut,
    time: body.checkOut.time ?? new Date(),
  };
  visit.checkOut = checkOutPoint;
  visit.duration = Math.round(
    ((checkOutPoint.time as Date).getTime() - visit.checkIn.time.getTime()) / 60000,
  );
  if (body.notes) visit.notes = body.notes;
  if (body.outcome) visit.outcome = body.outcome;
  if (body.productsDiscussed) visit.productsDiscussed = body.productsDiscussed;
  visit.status = 'completed';
  await visit.save();
  res.json({ success: true, data: visit });
}

export async function visitTimeline(req: Request, res: Response): Promise<void> {
  const employeeId = String(req.params.employeeId);
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
