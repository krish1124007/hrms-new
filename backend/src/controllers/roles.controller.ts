import type { Request, Response } from 'express';
import { z } from 'zod';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { slugify } from '../lib/slugify.js';
import { cached, invalidate } from '../lib/cache.js';
import { PERMISSIONS_BY_MODULE } from '../config/permissions.js';
import {
  assertCanGrant,
  assertCanManageRole,
  assertCanSetPermissions,
  permissionListSchema,
  storedPermissionListSchema,
} from '../lib/permission-grants.js';

export const createRoleSchema = z.object({
  name: z.string().min(2).max(64),
  description: z.string().optional(),
  permissions: permissionListSchema.default([]),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(64).optional(),
  description: z.string().optional(),
  permissions: storedPermissionListSchema.optional(),
});

export async function listRoles(_req: Request, res: Response): Promise<void> {
  const key = 'roles:list';
  const data = await cached(key, 300, () =>
    Role.find().sort({ isSystem: -1, name: 1 }).lean().exec(),
  );
  res.json({ success: true, data });
}

async function invalidateRolesCache(): Promise<void> {
  await invalidate('roles:*');
}

export async function createRole(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createRoleSchema>;
  // Names were validated against the catalogue by the schema; `*` and anything
  // else the caller does not hold themselves is for a `*` holder to grant.
  assertCanGrant(req.user, body.permissions);
  const slug = slugify(body.name);
  const existing = await Role.findOne({ slug }).exec();
  if (existing) throw new ConflictError('A role with this name already exists');

  const role = await Role.create({
    name: body.name,
    slug,
    description: body.description,
    permissions: body.permissions,
    isSystem: false,
  });
  void audit({ action: 'create', entity: 'Role', entityId: String(role._id) });
  await invalidateRolesCache();
  res.status(201).json({ success: true, data: role });
}

export async function getRole(req: Request, res: Response): Promise<void> {
  const role = await Role.findById(String(req.params.id)).exec();
  if (!role) throw new NotFoundError('Role not found');
  res.json({ success: true, data: role });
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  const role = await Role.findById(String(req.params.id)).exec();
  if (!role) throw new NotFoundError('Role not found');
  if (role.isSystem) throw new ForbiddenError('System roles cannot be modified');
  assertCanManageRole(req.user, role);

  const body = req.body as z.infer<typeof updateRoleSchema>;
  if (body.permissions !== undefined) {
    // Only what is being *added* is validated and needs the caller's blessing:
    // a role may already store retired names (the UI sends the whole list back).
    // Nobody may widen a role — their own included — beyond what they hold.
    assertCanSetPermissions(req.user, 'permissions', body.permissions, role.permissions);
  }
  if (body.name !== undefined) {
    role.name = body.name;
    role.slug = slugify(body.name);
  }
  if (body.description !== undefined) role.description = body.description;
  if (body.permissions !== undefined) role.permissions = body.permissions;
  await role.save();

  void audit({ action: 'update', entity: 'Role', entityId: String(role._id) });
  await invalidateRolesCache();
  res.json({ success: true, data: role });
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  const role = await Role.findById(String(req.params.id)).exec();
  if (!role) throw new NotFoundError('Role not found');
  if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');
  assertCanManageRole(req.user, role);

  // Soft-deleted users keep their role reference and can be restored, so they count too.
  const assigned = await User.countDocuments({ role: role._id }).setOptions({ withDeleted: true }).exec();
  if (assigned > 0) {
    throw new ConflictError(
      `This role is still assigned to ${assigned} user${assigned === 1 ? '' : 's'}. Reassign them first.`,
      'ROLE_IN_USE',
      { userCount: assigned },
    );
  }

  await role.deleteOne();
  void audit({ action: 'delete', entity: 'Role', entityId: String(role._id) });
  await invalidateRolesCache();
  res.json({ success: true, message: 'Role deleted' });
}

export async function listPermissions(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: PERMISSIONS_BY_MODULE });
}
