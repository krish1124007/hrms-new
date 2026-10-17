import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { User, activateIfInvited } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { appBaseUrl } from '../lib/app-url.js';
import { assertCanAssignRole, assertCanManageUser, assertCanSetPermissions, storedPermissionListSchema, } from '../lib/permission-grants.js';
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
    customPermissions: storedPermissionListSchema.optional(),
});
export const updateStatusSchema = z.object({
    status: z.enum(['active', 'inactive']),
});
export const setPasswordSchema = z.object({
    password: z.string().min(8).max(128),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    status: z.enum(['active', 'inactive', 'invited']).optional(),
    sort: z.string().optional(),
});
export async function listUsers(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.status)
        filter.status = q.status;
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
export async function inviteUser(req, res) {
    const body = req.body;
    const role = await Role.findById(body.roleId).exec();
    if (!role)
        throw new NotFoundError('Role not found');
    assertCanAssignRole(req.user, role);
    const existing = await User.findOne({ email: body.email.toLowerCase() }).exec();
    if (existing)
        throw new ConflictError('User with this email already exists');
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
        html: `<p>Hi ${user.firstName},</p><p>You've been invited. Click below to set up your account:</p><p><a href="${appBaseUrl()}/accept-invite?token=${verificationToken}">Accept invitation</a></p>`,
    });
    void audit({ action: 'create', entity: 'User', entityId: String(user._id) });
    res.status(201).json({ success: true, data: user });
}
export async function getUser(req, res) {
    const user = await User.findById(String(req.params.id))
        .populate('role')
        .exec();
    if (!user)
        throw new NotFoundError('User not found');
    res.json({ success: true, data: user });
}
export async function updateUser(req, res) {
    const body = req.body;
    const target = await User.findById(String(req.params.id)).populate('role').exec();
    if (!target)
        throw new NotFoundError('User not found');
    // A lesser admin may not change a more privileged user at all — otherwise
    // they could demote them first (dropping permissions is always allowed) and
    // then reset their password, deactivate or delete them.
    assertCanManageUser(req.user, target);
    // Nobody can use this endpoint to give anyone (themselves included) more
    // than they hold. Only what actually changes is checked, so a stored list
    // with retired names can be re-saved.
    if (body.customPermissions !== undefined) {
        assertCanSetPermissions(req.user, 'customPermissions', body.customPermissions, target.customPermissions ?? []);
    }
    if (body.roleId !== undefined) {
        const role = await Role.findById(body.roleId).exec();
        if (!role)
            throw new NotFoundError('Role not found');
        // `target.role` is populated (null if its role document is gone).
        const currentRoleId = target.role?._id;
        if (String(role._id) !== String(currentRoleId))
            assertCanAssignRole(req.user, role);
    }
    const update = {};
    if (body.firstName !== undefined)
        update.firstName = body.firstName;
    if (body.lastName !== undefined)
        update.lastName = body.lastName;
    if (body.avatar !== undefined)
        update.avatar = body.avatar;
    if (body.roleId !== undefined)
        update.role = body.roleId;
    if (body.customPermissions !== undefined)
        update.customPermissions = body.customPermissions;
    const user = await User.findByIdAndUpdate(String(req.params.id), update, {
        new: true,
    })
        .populate('role')
        .exec();
    if (!user)
        throw new NotFoundError('User not found');
    void audit({ action: 'update', entity: 'User', entityId: String(user._id), after: update });
    res.json({ success: true, data: user });
}
/**
 * The user a request wants to act on (password reset, status change, delete),
 * 404 if missing and 403 unless the caller holds every permission that user
 * holds — a lesser admin must not be able to lock out, take over or remove a
 * more privileged account. A `*` caller is unrestricted.
 */
async function loadManageableUser(req, opts = {}) {
    const query = User.findById(String(req.params.id)).populate('role');
    if (opts.withPassword)
        query.select('+password +emailVerificationToken');
    const user = await query.exec();
    if (!user)
        throw new NotFoundError('User not found');
    assertCanManageUser(req.user, user);
    return user;
}
export async function deleteUser(req, res) {
    const user = await loadManageableUser(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await user.softDelete();
    void audit({ action: 'delete', entity: 'User', entityId: String(user._id) });
    res.json({ success: true, message: 'User deleted' });
}
/**
 * Admin-driven password reset. Sets `password` on the target user (the User
 * model's pre-save hook hashes it), bumps `sessionVersion` and revokes any
 * active sessions so the target is forced to log in again with the new one.
 */
export async function setUserPassword(req, res) {
    const { password } = req.body;
    const { validatePasswordStrength } = await import('../lib/password-security.js');
    const strength = validatePasswordStrength(password);
    if (!strength.ok) {
        const { AppError } = await import('../lib/errors.js');
        throw new AppError(strength.reason ?? 'Password rejected', 400, 'WEAK_PASSWORD');
    }
    const user = await loadManageableUser(req, { withPassword: true });
    user.password = password;
    user.passwordChangedAt = new Date();
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    // An admin handing an invited user a password is activating the account:
    // otherwise login keeps refusing it as "invited".
    const activated = activateIfInvited(user);
    await user.save();
    const { Session } = await import('../models/session.model.js');
    await Session.updateMany({ userId: user._id, isActive: true }, { isActive: false }).exec();
    const { revokeAllUserTokens } = await import('../lib/token-blacklist.js');
    await revokeAllUserTokens(String(user._id), user.sessionVersion);
    void audit({
        action: 'update',
        entity: 'User',
        entityId: String(user._id),
        metadata: {
            event: 'password.admin-reset',
            sessionVersion: user.sessionVersion,
            ...(activated ? { activated: true } : {}),
        },
    });
    res.json({ success: true, message: 'Password updated. The user must sign in again.' });
}
export async function updateUserStatus(req, res) {
    const { status } = req.body;
    await loadManageableUser(req);
    const user = await User.findByIdAndUpdate(String(req.params.id), { status }, { new: true }).exec();
    if (!user)
        throw new NotFoundError('User not found');
    void audit({
        action: 'update',
        entity: 'User',
        entityId: String(user._id),
        after: { status },
    });
    res.json({ success: true, data: user });
}
//# sourceMappingURL=users.controller.js.map