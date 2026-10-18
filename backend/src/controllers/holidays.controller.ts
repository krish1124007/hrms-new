import type { Request, Response } from 'express';
import { z } from 'zod';
import { Holiday } from '../models/holiday.model.js';
import { NotFoundError } from '../lib/errors.js';
import { DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
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

export const rolloverSchema = z.object({
  /** The year to copy the recurring holidays into, from the year before it. */
  year: z.coerce.number().int().min(1970).max(9999),
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

/** `(day, name)` — what makes two holidays the same one (the name compared trimmed, ignoring case). */
const holidayKey = (date: Date, name: string): string =>
  `${startOfBusinessDay(date).toISOString().slice(0, 10)}|${name.trim().toLowerCase()}`;

/**
 * The `holidayKey` of every holiday falling on a business day in
 * `[from, to]` (day labels). The query window is widened by a day each side
 * so a date stored at IST midnight is still found; the key is exact.
 */
async function existingKeys(from: Date, to: Date): Promise<Set<string>> {
  const rows = await Holiday.find({
    date: { $gte: new Date(from.getTime() - DAY_MS), $lt: new Date(to.getTime() + 2 * DAY_MS) },
  })
    .select('date name')
    .lean()
    .exec();
  return new Set(rows.map((h) => holidayKey(h.date, h.name)));
}

/**
 * Insert holidays, counting any that lose a race to an identical one written
 * meanwhile (the unique `(date, name)` index) as skipped.
 */
async function insertHolidays(docs: Record<string, unknown>[]): Promise<{ created: number; skipped: number }> {
  if (docs.length === 0) return { created: 0, skipped: 0 };
  try {
    await Holiday.insertMany(docs, { ordered: false });
    return { created: docs.length, skipped: 0 };
  } catch (err) {
    const writeErrors = (err as { writeErrors?: { code?: number; err?: { code?: number } }[] }).writeErrors ?? [];
    const onlyDuplicates =
      writeErrors.length > 0 && writeErrors.every((w) => (w.err?.code ?? w.code) === 11000);
    if (!onlyDuplicates) throw err;
    return { created: docs.length - writeErrors.length, skipped: writeErrors.length };
  }
}

/**
 * POST /holidays/import-calendar — add the holidays not already in the
 * calendar. Each date is stored as its business-day label; a row matching an
 * existing holiday (same day, same name) or an earlier row of the payload is
 * skipped. Returns `{ created, skipped }`.
 */
export async function importCalendar(req: Request, res: Response): Promise<void> {
  const { holidays } = req.body as z.infer<typeof importCalendarSchema>;
  const rows = holidays.map((h) => ({ ...h, name: h.name.trim(), date: startOfBusinessDay(h.date) }));
  const times = rows.map((h) => h.date.getTime());
  const seen = await existingKeys(new Date(Math.min(...times)), new Date(Math.max(...times)));

  const fresh: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const h of rows) {
    const key = holidayKey(h.date, h.name);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    fresh.push(h);
  }
  const inserted = await insertHolidays(fresh);
  void audit({
    action: 'create',
    entity: 'Holiday',
    metadata: { event: 'import-calendar', created: inserted.created, skipped: skipped + inserted.skipped },
  });
  res.status(201).json({ success: true, data: { created: inserted.created, skipped: skipped + inserted.skipped } });
}

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * POST /holidays/rollover `{ year }` — copy every recurring holiday of
 * `year − 1` to the same month and day of `year` (29 Feb → 28 Feb when
 * `year` is not a leap year), skipping any already there (same day, same
 * name). Idempotent. Returns `{ created, skipped }`.
 */
export async function rolloverHolidays(req: Request, res: Response): Promise<void> {
  const { year } = req.body as z.infer<typeof rolloverSchema>;
  const fromStart = new Date(Date.UTC(year - 1, 0, 1));
  const toStart = new Date(Date.UTC(year, 0, 1));
  const toEnd = new Date(Date.UTC(year, 11, 31));

  // Widened by a day each side (IST-midnight dates); the year test is exact.
  const candidates = await Holiday.find({
    isRecurring: true,
    date: { $gte: new Date(fromStart.getTime() - DAY_MS), $lt: new Date(toStart.getTime() + DAY_MS) },
  })
    .lean()
    .exec();
  const seen = await existingKeys(toStart, toEnd);

  const fresh: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const h of candidates) {
    const day = startOfBusinessDay(h.date);
    if (day.getUTCFullYear() !== year - 1) continue;
    const month = day.getUTCMonth();
    const date = month === 1 && day.getUTCDate() === 29 && !isLeapYear(year) ? 28 : day.getUTCDate();
    const target = new Date(Date.UTC(year, month, date));
    const key = holidayKey(target, h.name);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    fresh.push({
      name: h.name,
      date: target,
      type: h.type,
      departments: h.departments ?? [],
      isRecurring: true,
      ...(h.description ? { description: h.description } : {}),
    });
  }
  const inserted = await insertHolidays(fresh);
  const result = { created: inserted.created, skipped: skipped + inserted.skipped };
  void audit({ action: 'create', entity: 'Holiday', metadata: { event: 'rollover', year, ...result } });
  res.status(201).json({ success: true, data: result });
}
