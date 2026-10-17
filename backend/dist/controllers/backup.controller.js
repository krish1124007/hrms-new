import fs from 'node:fs';
import { once } from 'node:events';
import { z } from 'zod';
import { Backup } from '../models/backup.model.js';
import { setSetting } from '../models/system-setting.model.js';
import { NotFoundError, UnauthorizedError, AppError } from '../lib/errors.js';
import { MONTHLY_BACKUP_SETTING, locateBackupFiles, restoreTargetProblem } from '../lib/backups.js';
import { audit } from '../services/audit.service.js';
import { enqueueBackupCreate, enqueueBackupRestore, getMonthlyBackupSchedule, setMonthlyBackupSchedule, } from '../jobs/backup.jobs.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
/**
 * Client view of a backup row: the storage reference is replaced by the
 * authenticated download route (never a `/uploads/` path, so the response
 * presigner leaves it alone).
 */
function toBackupView(row) {
    const { fileUrl: _storedReference, ...rest } = row;
    const downloadable = row.status === 'completed' && locateBackupFiles(row) !== null;
    return { ...rest, downloadUrl: downloadable ? `/api/v1/backups/${String(row._id)}/download` : null };
}
// ---------- Validation Schemas ----------
export const createBackupSchema = z.object({
    type: z.enum(['database', 'files', 'full']).default('database'),
});
/**
 * No body: the restore target is server configuration
 * (BACKUP_SCRATCH_MONGO_URI), never something a client chooses.
 */
export const restoreBackupSchema = z.object({});
// ---------- Controllers ----------
export async function listBackups(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);
    const skip = (page - 1) * limit;
    const [backups, total] = await Promise.all([
        Backup.find({ deletedAt: null })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec(),
        Backup.countDocuments({ deletedAt: null }).exec(),
    ]);
    res.json({
        success: true,
        data: backups.map(toBackupView),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
}
/**
 * POST /api/v1/backups
 *
 * Creates the row, enqueues a BullMQ job. The worker picks it up,
 * runs mongodump → tar+gzip → BACKUP_DIR → writes `fileName` + `size` back.
 */
export async function createBackup(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const backup = await Backup.create({
        type: body.type,
        status: 'in_progress',
        createdBy: req.user._id,
        startedAt: new Date(),
    });
    await enqueueBackupCreate(String(backup._id));
    void audit({
        action: 'create',
        entity: 'Backup',
        entityId: String(backup._id),
        metadata: { event: 'backup.enqueued', type: body.type },
    });
    res.status(201).json({
        success: true,
        data: toBackupView(backup.toObject()),
        message: 'Backup queued — status will update in a few minutes.',
    });
}
/**
 * POST /api/v1/backups/:id/restore
 *
 * **Does NOT overwrite the live database.** The restore lands in the scratch
 * database configured server-side as BACKUP_SCRATCH_MONGO_URI; the operator
 * verifies contents there before any destructive swap. A destructive restore
 * over prod should be an out-of-band console run with a loud warning — not a
 * UI button.
 */
export async function restoreBackup(req, res) {
    const target = env.BACKUP_SCRATCH_MONGO_URI;
    if (!target) {
        throw new AppError('Restore is disabled: BACKUP_SCRATCH_MONGO_URI is not configured on the server.', 400, 'RESTORE_TARGET_NOT_CONFIGURED');
    }
    const problem = restoreTargetProblem(target, env.MONGODB_URI);
    if (problem) {
        throw new AppError(`Refusing to restore: ${problem}. Point BACKUP_SCRATCH_MONGO_URI at a throwaway database.`, 400, 'UNSAFE_RESTORE_TARGET');
    }
    const backup = await Backup.findById(String(req.params.id)).exec();
    if (!backup)
        throw new NotFoundError('Backup not found');
    if (backup.status !== 'completed' || !locateBackupFiles(backup)) {
        throw new AppError('Backup is not yet complete — cannot restore', 400, 'NOT_READY');
    }
    await enqueueBackupRestore(String(backup._id));
    void audit({
        action: 'update',
        entity: 'Backup',
        entityId: String(backup._id),
        metadata: { event: 'backup.restore-enqueued' },
    });
    logger.warn({ backupId: String(backup._id), by: req.user?._id ? String(req.user._id) : undefined }, 'backup restore enqueued (into BACKUP_SCRATCH_MONGO_URI)');
    res.json({
        success: true,
        message: 'Restore enqueued. Data will be written to the scratch database — inspect it before any further action.',
    });
}
/**
 * GET /api/v1/backups/:id/download — streams the tarball. Backups are never
 * exposed as signed file links; this route (backups.manage) is the only way out.
 */
export async function downloadBackup(req, res) {
    const backup = await Backup.findById(String(req.params.id)).lean().exec();
    if (!backup)
        throw new NotFoundError('Backup not found');
    const files = locateBackupFiles(backup);
    if (!files)
        throw new NotFoundError('Backup file not found');
    const stat = await fs.promises.stat(files.tarball).catch(() => null);
    if (!stat?.isFile())
        throw new NotFoundError('Backup file not found');
    const stream = fs.createReadStream(files.tarball);
    try {
        await once(stream, 'open');
    }
    catch (err) {
        throw err.code === 'ENOENT' ? new NotFoundError('Backup file not found') : err;
    }
    void audit({
        action: 'export',
        entity: 'Backup',
        entityId: String(backup._id),
        metadata: { event: 'backup.downloaded' },
    });
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Length', String(stat.size));
    // Safe to quote verbatim: isSafeBackupName allows only [A-Za-z0-9._-].
    res.setHeader('Content-Disposition', `attachment; filename="${files.fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', (err) => {
        logger.warn({ err, backupId: String(backup._id) }, 'backups: read failed mid-stream');
        res.destroy(err);
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
}
/** Removes the row's tarball and sidecar (new or legacy location), then soft-deletes the row. */
export async function deleteBackup(req, res) {
    const backup = await Backup.findById(String(req.params.id)).exec();
    if (!backup)
        throw new NotFoundError('Backup not found');
    const files = locateBackupFiles(backup);
    if (files) {
        await fs.promises.rm(files.tarball, { force: true });
        if (files.counts)
            await fs.promises.rm(files.counts, { force: true });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await backup.softDelete({ by: req.user?._id });
    void audit({ action: 'delete', entity: 'Backup', entityId: String(backup._id) });
    res.json({ success: true, message: 'Backup deleted' });
}
/* ─────────── Schedule (monthly auto-backup) ─────────── */
export const updateScheduleSchema = z.object({
    enabled: z.boolean(),
});
export async function getSchedule(_req, res) {
    const status = await getMonthlyBackupSchedule();
    res.json({ success: true, data: status });
}
export async function updateSchedule(req, res) {
    const body = req.body;
    // Persisted first: index.ts re-applies this on every boot.
    await setSetting(MONTHLY_BACKUP_SETTING, body.enabled);
    await setMonthlyBackupSchedule(body.enabled);
    void audit({
        action: 'update',
        entity: 'Backup',
        metadata: { event: 'schedule.toggled', enabled: body.enabled },
    });
    const status = await getMonthlyBackupSchedule();
    res.json({ success: true, data: status });
}
//# sourceMappingURL=backup.controller.js.map