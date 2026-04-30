import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Notice } from '../models/notice.model.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { sanitizeStrict, sanitizeRich } from '../lib/sanitize.js';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

export const createNoticeSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20000),
  priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
  /** Restrict visibility to these departments. Empty array = all employees. */
  departments: z.array(objectId).default([]),
  expiresAt: z.coerce.date().optional(),
  isPinned: z.boolean().default(false),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        size: z.coerce.number().default(0),
        mimeType: z.string().default('application/octet-stream'),
      }),
    )
    .default([]),
});

export const updateNoticeSchema = createNoticeSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  priority: z.enum(['normal', 'important', 'urgent']).optional(),
});

export async function listNotices(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const page = Number(q.page ?? 1);
  const limit = Number(q.limit ?? 20);
  const skip = (page - 1) * limit;

  const now = new Date();
  // Show non-expired notices. Mongoose softDelete plugin already filters
  // out isDeleted=true documents at the query level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {
    $or: [{ expiresAt: { $gte: now } }, { expiresAt: null }, { expiresAt: { $exists: false } }],
  };
  if (q.priority) filter.priority = q.priority;
  if (q.search) {
    filter.$and = [
      { $or: filter.$or },
      {
        $or: [
          { title: { $regex: q.search, $options: 'i' } },
          { content: { $regex: q.search, $options: 'i' } },
        ],
      },
    ];
    delete filter.$or;
  }

  const [notices, total] = await Promise.all([
    Notice.find(filter)
      .sort({ isPinned: -1, priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('postedBy', 'firstName lastName email')
      .populate('departments', 'name code')
      .lean()
      .exec(),
    Notice.countDocuments(filter).exec(),
  ]);

  res.json({
    success: true,
    data: notices,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function createNotice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof createNoticeSchema>;

  const notice = await Notice.create({
    title: sanitizeStrict(body.title),
    content: sanitizeRich(body.content),
    priority: body.priority,
    departments: body.departments.map((id) => new Types.ObjectId(id)),
    expiresAt: body.expiresAt,
    isPinned: body.isPinned,
    attachments: body.attachments,
    postedBy: req.user._id,
    acknowledgements: [],
  });

  await notice.populate('postedBy', 'firstName lastName email');
  void audit({ action: 'create', entity: 'Notice', entityId: String(notice._id) });
  res.status(201).json({ success: true, data: notice });
}

export async function getNotice(req: Request, res: Response): Promise<void> {
  const notice = await Notice.findById(String(req.params.id))
    .populate('postedBy', 'firstName lastName email')
    .populate('departments', 'name code')
    .exec();
  if (!notice) throw new NotFoundError('Notice not found');
  res.json({ success: true, data: notice });
}

export async function updateNotice(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateNoticeSchema>;
  const update: Record<string, unknown> = { ...body };
  if (typeof body.title === 'string') update.title = sanitizeStrict(body.title);
  if (typeof body.content === 'string') update.content = sanitizeRich(body.content);
  if (body.departments) {
    update.departments = body.departments.map((id) => new Types.ObjectId(id));
  }

  const notice = await Notice.findByIdAndUpdate(String(req.params.id), update, {
    new: true,
  }).exec();
  if (!notice) throw new NotFoundError('Notice not found');

  void audit({ action: 'update', entity: 'Notice', entityId: String(notice._id) });
  res.json({ success: true, data: notice });
}

export async function deleteNotice(req: Request, res: Response): Promise<void> {
  const notice = await Notice.findById(String(req.params.id)).exec();
  if (!notice) throw new NotFoundError('Notice not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (notice as any).softDelete();
  void audit({ action: 'delete', entity: 'Notice', entityId: String(notice._id) });
  res.json({ success: true, message: 'Notice deleted' });
}

export async function acknowledgeNotice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const userId = req.user._id;
  const notice = await Notice.findById(String(req.params.id)).exec();
  if (!notice) throw new NotFoundError('Notice not found');

  const alreadyAcked = notice.acknowledgements.some(
    (a) => String(a.userId) === String(userId),
  );
  if (!alreadyAcked) {
    notice.acknowledgements.push({ userId, acknowledgedAt: new Date() });
    await notice.save();
  }

  res.json({ success: true, data: notice });
}
