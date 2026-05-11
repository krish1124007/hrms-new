import { z } from 'zod';
import { Role } from '../models/role.model.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { slugify } from '../lib/slugify.js';
import { cached, invalidate } from '../lib/cache.js';
export const createRoleSchema = z.object({
    name: z.string().min(2).max(64),
    description: z.string().optional(),
    permissions: z.array(z.string()).default([]),
});
export const updateRoleSchema = z.object({
    name: z.string().min(2).max(64).optional(),
    description: z.string().optional(),
    permissions: z.array(z.string()).optional(),
});
export async function listRoles(_req, res) {
    const key = 'roles:list';
    const data = await cached(key, 300, () => Role.find().sort({ isSystem: -1, name: 1 }).lean().exec());
    res.json({ success: true, data });
}
async function invalidateRolesCache() {
    await invalidate('roles:*');
}
export async function createRole(req, res) {
    const body = req.body;
    const slug = slugify(body.name);
    const existing = await Role.findOne({ slug }).exec();
    if (existing)
        throw new ConflictError('A role with this name already exists');
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
export async function getRole(req, res) {
    const role = await Role.findById(String(req.params.id)).exec();
    if (!role)
        throw new NotFoundError('Role not found');
    res.json({ success: true, data: role });
}
export async function updateRole(req, res) {
    const role = await Role.findById(String(req.params.id)).exec();
    if (!role)
        throw new NotFoundError('Role not found');
    if (role.isSystem)
        throw new ForbiddenError('System roles cannot be modified');
    const body = req.body;
    if (body.name !== undefined) {
        role.name = body.name;
        role.slug = slugify(body.name);
    }
    if (body.description !== undefined)
        role.description = body.description;
    if (body.permissions !== undefined)
        role.permissions = body.permissions;
    await role.save();
    void audit({ action: 'update', entity: 'Role', entityId: String(role._id) });
    await invalidateRolesCache();
    res.json({ success: true, data: role });
}
export async function deleteRole(req, res) {
    const role = await Role.findById(String(req.params.id)).exec();
    if (!role)
        throw new NotFoundError('Role not found');
    if (role.isSystem)
        throw new ForbiddenError('System roles cannot be deleted');
    await role.deleteOne();
    void audit({ action: 'delete', entity: 'Role', entityId: String(role._id) });
    await invalidateRolesCache();
    res.json({ success: true, message: 'Role deleted' });
}
export const PERMISSIONS_BY_MODULE = {
    users: ['users.view', 'users.create', 'users.update', 'users.delete'],
    roles: ['roles.view', 'roles.create', 'roles.update', 'roles.delete'],
    employees: ['employees.view', 'employees.create', 'employees.update', 'employees.delete', 'employees.export'],
    departments: ['departments.view', 'departments.manage'],
    designations: ['designations.view', 'designations.manage'],
    shifts: ['shifts.view', 'shifts.manage'],
    holidays: ['holidays.view', 'holidays.create', 'holidays.update', 'holidays.delete'],
    attendance: ['attendance.view', 'attendance.manage', 'attendance.config'],
    leaves: ['leaves.view', 'leaves.approve', 'leaves.config', 'leaves.update'],
    payroll: ['payroll.view', 'payroll.process', 'payroll.config'],
    'expense-claims': ['expense-claims.view', 'expense-claims.approve', 'expense-claims.update'],
    overtime: ['overtime.view', 'overtime.approve'],
    assets: ['assets.view', 'assets.manage'],
    loans: ['loans.view', 'loans.manage', 'loans.approve'],
    disciplinary: ['disciplinary.view', 'disciplinary.manage'],
    policies: ['policies.view', 'policies.manage'],
    notices: ['notices.view', 'notices.manage'],
    documents: ['documents.view', 'documents.manage'],
    field: ['field-sales.view', 'field-sales.manage'],
    projects: ['projects.view', 'projects.manage'],
    audit: ['audit.view'],
    backups: ['backups.view', 'backups.manage'],
    settings: ['settings.view', 'settings.manage'],
};
export async function listPermissions(_req, res) {
    res.json({ success: true, data: PERMISSIONS_BY_MODULE });
}
//# sourceMappingURL=roles.controller.js.map