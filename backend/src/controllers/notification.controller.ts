import type { Request, Response } from 'express';
import { z } from 'zod';
import { Notification } from '../models/notification.model.js';
import { PushDevice } from '../models/push-device.model.js';
import { NotFoundError, UnauthorizedError } from '../lib/errors.js';

/**
 * Per-user notification inbox.
 *
 * All endpoints scope by `tenantId` (auto via plugin) AND `userId` (from
 * the authenticated caller) — notifications are never visible across
 * users, even within the same tenant.
 */

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export async function listNotifications(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;

  const filter: Record<string, unknown> = { userId: req.user._id };
  if (q.unreadOnly) filter.isRead = false;

  const result = await Notification.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-createdAt',
  });

  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  }).exec();

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    meta: { unreadCount },
  });
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  }).exec();
  res.json({ success: true, data: { unreadCount } });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await Notification.findOne({
    _id: String(req.params.id),
    userId: req.user._id,
  }).exec();
  if (!doc) throw new NotFoundError('Notification not found');
  doc.isRead = true;
  doc.readAt = new Date();
  await doc.save();
  res.json({ success: true, data: doc });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const r = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() },
  ).exec();
  res.json({ success: true, data: { modified: r.modifiedCount } });
}

export async function deleteNotification(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await Notification.findOneAndDelete({
    _id: String(req.params.id),
    userId: req.user._id,
  }).exec();
  if (!doc) throw new NotFoundError('Notification not found');
  res.json({ success: true, message: 'Notification deleted' });
}

/* ──────────────── Push-device registration (mobile) ──────────────── */

export const registerDeviceSchema = z.object({
  token: z.string().min(16).max(4096),
  platform: z.enum(['ios', 'android']),
  deviceName: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

/**
 * Upsert the caller's device row so subsequent push events route here.
 * Uses `{ token }` as the unique key — if the same token shows up under
 * a different user (account switch on the same phone), the row is
 * re-assigned to the new user, not duplicated.
 */
export async function registerDevice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof registerDeviceSchema>;

  const doc = await PushDevice.findOneAndUpdate(
    { token: body.token },
    {
      userId: req.user._id,
      token: body.token,
      platform: body.platform,
      deviceName: body.deviceName,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
      lastSeenAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  res.json({ success: true, data: doc });
}

export async function unregisterDevice(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const token = String(req.params.token);
  await PushDevice.deleteOne({ token, userId: req.user._id }).exec();
  res.json({ success: true, message: 'Device unregistered' });
}
