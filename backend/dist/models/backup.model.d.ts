import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type BackupType = 'database' | 'files' | 'full';
export type BackupStatus = 'in_progress' | 'completed' | 'failed';
export type BackupTrigger = 'manual' | 'scheduled';
export interface IBackup extends Document {
    type: BackupType;
    status: BackupStatus;
    trigger: BackupTrigger;
    size?: number;
    /** Tarball basename inside BACKUP_DIR (see lib/backups.ts). */
    fileName?: string;
    /**
     * Legacy rows only: `/uploads/backups/<name>.tar.gz` from when backups lived
     * in the upload root. `npm run backups:relocate` converts them to fileName.
     * Never sent to clients.
     */
    fileUrl?: string;
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    /** Null for scheduled backups (no human user triggered them). */
    createdBy?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export declare const Backup: PaginateModel<IBackup> & Model<IBackup, {}, {}, {}, Document<unknown, {}, IBackup, {}, {}> & IBackup & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=backup.model.d.ts.map