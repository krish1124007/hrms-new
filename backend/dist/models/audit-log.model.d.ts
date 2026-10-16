import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'import'
/** A request the server refused — see `metadata` for code, path and reason. */
 | 'failure';
export interface IAuditLog extends Document {
    userId?: Types.ObjectId;
    action: AuditAction;
    entity: string;
    entityId?: string;
    changes?: {
        before?: Record<string, any>;
        after?: Record<string, any>;
    };
    ip?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AuditLog: PaginateModel<IAuditLog> & Model<IAuditLog, {}, {}, {}, Document<unknown, {}, IAuditLog, {}, {}> & IAuditLog & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=audit-log.model.d.ts.map