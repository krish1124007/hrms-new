import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { env } from '../config/env.js';

export const inviteUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleId: z.string().min(1),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  avatar: z.string().url().optional(),
  roleId: z.string().optional(),
  customPermissions: z.array(z.string()).optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'invited']).optional(),
  sort: z.string().optional(),
});

export async function listUsers(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.search) {
    filter.$or = [
      { email: { $regex: q.search, $options: 'i' } },
      { firstName: { $regex: q.search, $options: 'i' } },
      { lastName: { $regex: q.search, $options: 'i' } },
    ];
  }
  const result = await User.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: 'role',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function inviteUser(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof inviteUserSchema>;

  const role = await Role.findById(body.roleId).exec();
  if (!role) throw new NotFoundError('Role not found');

  const existing = await User.findOne({ email: body.email.toLowerCase() }).exec();
  if (existing) throw new ConflictError('User with this email already exists');

  const tempPassword = randomBytes(16).toString('hex');
  const verificationToken = randomBytes(32).toString('hex');

  const user = await User.create({
    email: body.email,
    firstName: body.firstName,
    lastName: body.lastName,
    role: role._id,
    password: tempPassword,
    status: 'invited',
    emailVerificationToken: verificationToken,
  });

  void sendMail({
    to: user.email,
    subject: 'You have been invited',
    html: `<p>Hi ${user.firstName},</p><p>You've been invited. Click below to set up your account:</p><p><a href="${env.CORS_ORIGIN}/accept-invite/${verificationToken}">Accept invitation</a></p>`,
  });

  void audit({ action: 'create', entity: 'User', entityId: String(user._id) });
  res.status(201).json({ success: true, data: user });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const user = await User.findById(String(req.params.id))
    .populate('role')
    .exec();
  if (!user) throw new NotFoundError('User not found');
  res.json({ success: true, data: user });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateUserSchema>;
  const update: Record<string, unknown> = {};
  if (body.firstName !== undefined) update.firstName = body.firstName;
  if (body.lastName !== undefined) update.lastName = body.lastName;
  if (body.avatar !== undefined) update.avatar = body.avatar;
  if (body.roleId !== undefined) update.role = body.roleId;
  if (body.customPermissions !== undefined) update.customPermissions = body.customPermissions;

  const user = await User.findByIdAndUpdate(String(req.params.id), update, {
    new: true,
  })
    .populate('role')
    .exec();
  if (!user) throw new NotFoundError('User not found');

  void audit({ action: 'update', entity: 'User', entityId: String(user._id), after: update });
  res.json({ success: true, data: user });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const user = await User.findById(String(req.params.id)).exec();
  if (!user) throw new NotFoundError('User not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (user as any).softDelete();
  void audit({ action: 'delete', entity: 'User', entityId: String(user._id) });
  res.json({ success: true, message: 'User deleted' });
}

export async function updateUserStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as { status: 'active' | 'inactive' };
  const user = await User.findByIdAndUpdate(
    String(req.params.id),
    { status },
    { new: true },
  ).exec();
  if (!user) throw new NotFoundError('User not found');
  void audit({
    action: 'update',
    entity: 'User',
    entityId: String(user._id),
    after: { status },
  });
  res.json({ success: true, data: user });
}
