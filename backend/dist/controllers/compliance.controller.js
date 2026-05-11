import { z } from 'zod';
import { User } from '../models/user.model.js';
import { Session } from '../models/session.model.js';
import { revokeAllUserTokens } from '../lib/token-blacklist.js';
import { audit } from '../services/audit.service.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';
export const deleteAccountSchema = z.object({
    password: z.string().min(1),
    confirmation: z.literal('DELETE MY ACCOUNT'),
    reason: z.string().max(500).optional(),
});
export async function deleteMyAccount(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const user = await User.findById(req.user._id).select('+password').exec();
    if (!user)
        throw new UnauthorizedError();
    const ok = await user.comparePassword(body.password);
    if (!ok)
        throw new UnauthorizedError('Password verification failed');
    const otherAdmins = await User.countDocuments({
        _id: { $ne: user._id },
        status: 'active',
    }).exec();
    if (otherAdmins === 0) {
        throw new ForbiddenError('You are the last active user. Invite another admin before deleting your account.');
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await user.softDelete({
        by: user._id,
        reason: body.reason ?? 'User requested account deletion',
    });
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    await user.save();
    await Session.updateMany({ userId: user._id }, { isActive: false }).exec();
    await revokeAllUserTokens(String(user._id), user.sessionVersion);
    void audit({
        action: 'delete',
        entity: 'User',
        entityId: String(user._id),
        metadata: { event: 'account.delete', reason: body.reason },
    });
    res.json({
        success: true,
        message: 'Account deleted.',
    });
}
export const recordConsentSchema = z.object({
    consents: z.object({
        termsOfService: z.boolean(),
        privacyPolicy: z.boolean(),
        marketing: z.boolean().optional(),
        analytics: z.boolean().optional(),
    }),
    documentVersions: z.record(z.string()).optional(),
});
export async function recordConsent(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, {
        $set: {
            consents: {
                ...body.consents,
                recordedAt: new Date(),
                ip: req.ip,
                userAgent: req.header('user-agent'),
                documentVersions: body.documentVersions ?? {},
            },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, { new: true }).exec();
    void audit({
        action: 'update',
        entity: 'User',
        entityId: String(req.user._id),
        after: { consents: body.consents },
        metadata: { event: 'consent.recorded' },
    });
    res.json({ success: true, data: { consents: user.consents } });
}
export async function complianceStatus(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const { AuditLog } = await import('../models/audit-log.model.js');
    const recent = await AuditLog.find({
        userId: req.user._id,
        'metadata.event': { $in: ['consent.recorded', 'account.delete'] },
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
        .exec();
    res.json({
        success: true,
        data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            consents: req.user.consents ?? null,
            history: recent,
        },
    });
}
//# sourceMappingURL=compliance.controller.js.map