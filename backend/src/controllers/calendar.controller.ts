import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Event as CalendarEvent } from '../models/event.model.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isAllDay: z.boolean().default(false),
  location: z.string().optional(),
  color: z.string().optional(),
  attendees: z.array(objectId).default([]),
});

export const updateEventSchema = createEventSchema.partial();

export const listEventsQuerySchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
});

export async function listEvents(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;

  // Calendar events are company-wide — only admin/HR can create them, so
  // every event is shared. Employees see the full list read-only; the
  // mutation routes (POST/PATCH/DELETE) are gated by `events.manage`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = {};
  if (q.start) filter.endDate = { $gte: new Date(q.start) };
  if (q.end) filter.startDate = { ...(filter.startDate ?? {}), $lte: new Date(q.end) };

  const events = await CalendarEvent.find(filter)
    .sort({ startDate: 1 })
    .populate('createdBy', 'firstName lastName email')
    .populate('attendees', 'firstName lastName email')
    .lean()
    .exec();
  res.json({ success: true, data: events });
}

export async function createEvent(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof createEventSchema>;

  const event = await CalendarEvent.create({
    ...body,
    attendees: body.attendees.map((id) => new Types.ObjectId(id)),
    createdBy: req.user._id,
  });

  void audit({ action: 'create', entity: 'CalendarEvent', entityId: String(event._id) });
  res.status(201).json({ success: true, data: event });
}

export async function getEvent(req: Request, res: Response): Promise<void> {
  const event = await CalendarEvent.findById(String(req.params.id))
    .populate('createdBy', 'firstName lastName email')
    .populate('attendees', 'firstName lastName email')
    .exec();
  if (!event) throw new NotFoundError('Event not found');
  res.json({ success: true, data: event });
}

export async function updateEvent(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateEventSchema>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { ...body };
  if (body.attendees) {
    update.attendees = body.attendees.map((id) => new Types.ObjectId(id));
  }
  const event = await CalendarEvent.findByIdAndUpdate(String(req.params.id), update, {
    new: true,
  }).exec();
  if (!event) throw new NotFoundError('Event not found');

  void audit({ action: 'update', entity: 'CalendarEvent', entityId: String(event._id) });
  res.json({ success: true, data: event });
}

export async function deleteEvent(req: Request, res: Response): Promise<void> {
  const event = await CalendarEvent.findById(String(req.params.id)).exec();
  if (!event) throw new NotFoundError('Event not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (event as any).softDelete();
  void audit({ action: 'delete', entity: 'CalendarEvent', entityId: String(event._id) });
  res.json({ success: true, message: 'Event deleted' });
}
