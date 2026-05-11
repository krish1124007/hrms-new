import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const auditLogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: {
        type: String,
        enum: ['create', 'update', 'delete', 'login', 'logout', 'export', 'import'],
        required: true,
    },
    entity: { type: String, required: true },
    entityId: String,
    changes: {
        before: Schema.Types.Mixed,
        after: Schema.Types.Mixed,
    },
    ip: String,
    userAgent: String,
    metadata: Schema.Types.Mixed,
});
auditLogSchema.plugin(timestampPlugin);
auditLogSchema.plugin(paginatePlugin);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });
export const AuditLog = model('AuditLog', auditLogSchema);
//# sourceMappingURL=audit-log.model.js.map