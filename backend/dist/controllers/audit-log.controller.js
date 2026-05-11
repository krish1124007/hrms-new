import { z } from 'zod';
import { Types } from 'mongoose';
import { AuditLog } from '../models/audit-log.model.js';
export const listAuditLogsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    action: z
        .enum(['create', 'update', 'delete', 'login', 'logout', 'export', 'import'])
        .optional(),
    entity: z.string().optional(),
    entityId: z.string().optional(),
    userId: z.string().optional(),
    search: z.string().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
});
export async function listAuditLogs(req, res) {
    const q = listAuditLogsQuerySchema.parse(req.query);
    const filter = {};
    if (q.action)
        filter.action = q.action;
    if (q.entity)
        filter.entity = q.entity;
    if (q.entityId)
        filter.entityId = q.entityId;
    if (q.userId && Types.ObjectId.isValid(q.userId)) {
        filter.userId = new Types.ObjectId(q.userId);
    }
    if (q.from || q.to) {
        filter.createdAt = {};
        if (q.from)
            filter.createdAt.$gte = new Date(q.from);
        if (q.to)
            filter.createdAt.$lte = new Date(q.to);
    }
    if (q.search) {
        const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ entity: rx }, { entityId: rx }, { 'metadata.event': rx }];
    }
    const result = await AuditLog.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: '-createdAt',
        populate: { path: 'userId', select: 'firstName lastName email avatar' },
    });
    res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
    });
}
export async function getAuditLog(req, res) {
    const id = String(req.params.id);
    if (!Types.ObjectId.isValid(id)) {
        res.status(400).json({
            success: false,
            error: { code: 'INVALID_ID', message: 'Invalid audit log id' },
        });
        return;
    }
    const log = await AuditLog.findById(id)
        .populate('userId', 'firstName lastName email avatar')
        .lean()
        .exec();
    if (!log) {
        res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Audit log not found' },
        });
        return;
    }
    res.json({ success: true, data: log });
}
/** Distinct entity names — used by the frontend filter dropdown. */
export async function listAuditEntities(_req, res) {
    const entities = await AuditLog.distinct('entity');
    res.json({ success: true, data: entities.filter(Boolean).sort() });
}
//# sourceMappingURL=audit-log.controller.js.map