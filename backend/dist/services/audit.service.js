import { AuditLog } from '../models/audit-log.model.js';
import { getContext } from '../lib/async-context.js';
import { logger } from '../config/logger.js';
export async function audit(input) {
    try {
        const ctx = getContext();
        await AuditLog.create({
            userId: ctx?.userId,
            action: input.action,
            entity: input.entity,
            entityId: input.entityId,
            changes: input.before || input.after ? { before: input.before, after: input.after } : undefined,
            ip: ctx?.ip,
            userAgent: ctx?.userAgent,
            metadata: input.metadata,
        });
    }
    catch (err) {
        logger.warn({ err }, 'Failed to write audit log');
    }
}
export async function auditExplicit(input) {
    try {
        await AuditLog.create({
            userId: input.userId,
            action: input.action,
            entity: input.entity,
            entityId: input.entityId,
            changes: input.before || input.after
                ? { before: input.before, after: input.after }
                : undefined,
            ip: input.ip,
            userAgent: input.userAgent,
            metadata: input.metadata,
        });
    }
    catch (err) {
        logger.warn({ err }, 'Failed to write explicit audit log');
    }
}
//# sourceMappingURL=audit.service.js.map