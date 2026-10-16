import type { Request, Response } from 'express';
import { z } from 'zod';
import { Holiday } from '../models/holiday.model.js';
import { NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';

export const createHolidaySchema = z.object({
  name: z.string().min(1),
  date: z.coerce.date(),
  type: z.enum(['public', 'optional', 'restricted']).default('public'),
  departments: z.array(z.string()).default([]),
  isRecurring: z.boolean().default(false),
  description: z.string().optional(),
});

export const updateHolidaySchema = createHolidaySchema.partial();

export const importCalendarSchema = z.object({
  holidays: z
    .array(
      z.object({
        name: z.string(),
        date: z.coerce.date(),
        type: z.enum(['public', 'optional', 'restricted']).default('public'),
      }),
    )
    .min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  year: z.coerce.number().int().optional(),
  type: z.enum(['public', 'optional', 'restricted']).optional(),
});

export async function listHolidays(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.type) filter.type = q.type;
  if (q.year) {
    filter.date = {
      $gte: new Date(`${q.year}-01-01`),
      $lt: new Date(`${q.year + 1}-01-01`),
    };
  }
  const result = await Holiday.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: 'date',
    populate: { path: 'departments', select: 'name code' },
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function upcomingHolidays(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const in30 = new Date();
  in30.setDate(now.getDate() + 30);
  const list = await Holiday.find({ date: { $gte: now, $lte: in30 } })
    .sort('date')
    .lean()
    .exec();
  res.json({ success: true, data: list });
}

export async function createHoliday(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createHolidaySchema>;
  const h = await Holiday.create(body);
  void audit({ action: 'create', entity: 'Holiday', entityId: String(h._id) });
  res.status(201).json({ success: true, data: h });
}

export async function getHoliday(req: Request, res: Response): Promise<void> {
  const h = await Holiday.findById(String(req.params.id))
    .populate('departments', 'name code')
    .exec();
  if (!h) throw new NotFoundError('Holiday not found');
  res.json({ success: true, data: h });
}

export async function updateHoliday(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateHolidaySchema>;
  const h = await Holiday.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
  if (!h) throw new NotFoundError('Holiday not found');
  void audit({ action: 'update', entity: 'Holiday', entityId: String(h._id), after: body });
  res.json({ success: true, data: h });
}

export async function deleteHoliday(req: Request, res: Response): Promise<void> {
  const h = await Holiday.findById(String(req.params.id)).exec();
  if (!h) throw new NotFoundError('Holiday not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (h as any).softDelete();
  void audit({ action: 'delete', entity: 'Holiday', entityId: String(h._id) });
  res.json({ success: true, message: 'Holiday deleted' });
}

export async function importCalendar(req: Request, res: Response): Promise<void> {
  const { holidays } = req.body as z.infer<typeof importCalendarSchema>;
  const created = await Holiday.insertMany(holidays);
  res.status(201).json({ success: true, data: { count: created.length } });
}
