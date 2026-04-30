import type { Request, Response } from 'express';
import { z } from 'zod';
import { Backup } from '../models/backup.model.js';
import { NotFoundError, UnauthorizedError, AppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import {
  enqueueBackupCreate,
  enqueueBackupRestore,
  getMonthlyBackupSchedule,
  setMonthlyBackupSchedule,
} from '../jobs/backup.jobs.js';
import { logger } from '../config/logger.js';

// ---------- Validation Schemas ----------

export const createBackupSchema = z.object({
  type: z.enum(['database', 'files', 'full']).default('database'),
});

export const restoreBackupSchema = z.object({
  // Restore is only allowed to a scratch database URI — never over prod.
  // The admin must provide it explicitly so there's no "default that targets prod".
  scratchMongoUri: z.string().url(),
});

// ---------- Controllers ----------

export async function listBackups(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
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
    data: backups,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
  });
}

/**
 * POST /api/v1/backups
 *
 * Creates the row, enqueues a BullMQ job. The worker picks it up,
 * runs mongodump → tar+gzip → S3 → writes `fileUrl` + `size` back.
 */
export async function createBackup(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof createBackupSchema>;

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
    data: backup,
    message: 'Backup queued — status will update in a few minutes.',
  });
}

/**
 * POST /api/v1/backups/:id/restore
 *
 * **Does NOT overwrite the live database.** The caller must supply a
 * `scratchMongoUri` pointing at a throwaway instance; the restore lands
 * there and the operator verifies contents before any destructive swap.
 * A destructive restore over prod should be an out-of-band console run
 * with a loud warning — not a UI button.
 */
export async function restoreBackup(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof restoreBackupSchema>;

  const backup = await Backup.findById(String(req.params.id)).exec();
  if (!backup) throw new NotFoundError('Backup not found');
  if (backup.status !== 'completed' || !backup.fileUrl) {
    throw new AppError('Backup is not yet complete — cannot restore', 400, 'NOT_READY');
  }

  // Defensive: reject the live URI even though the worker also checks.
  if (
    body.scratchMongoUri.includes('ddhrms_prod') ||
    body.scratchMongoUri === process.env.MONGODB_URI
  ) {
    throw new AppError(
      'Refusing to restore over the live database. Point scratchMongoUri at a throwaway instance.',
      400,
      'UNSAFE_RESTORE_TARGET',
    );
  }

  await enqueueBackupRestore(String(backup._id), body.scratchMongoUri);

  void audit({
    action: 'update',
    entity: 'Backup',
    entityId: String(backup._id),
    metadata: { event: 'backup.restore-enqueued', target: body.scratchMongoUri },
  });

  logger.warn(
    {
      backupId: String(backup._id),
      target: body.scratchMongoUri,
      by: req.user?._id ? String(req.user._id) : undefined,
    },
    'backup restore enqueued',
  );

  res.json({
    success: true,
    message:
      'Restore enqueued. Data will be written to the scratch database — inspect it before any further action.',
  });
}

export async function deleteBackup(req: Request, res: Response): Promise<void> {
  const backup = await Backup.findById(String(req.params.id)).exec();
  if (!backup) throw new NotFoundError('Backup not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (backup as any).softDelete();
  void audit({ action: 'delete', entity: 'Backup', entityId: String(backup._id) });
  res.json({ success: true, message: 'Backup deleted' });
}

/* ─────────── Schedule (monthly auto-backup) ─────────── */

export const updateScheduleSchema = z.object({
  enabled: z.boolean(),
});

export async function getSchedule(_req: Request, res: Response): Promise<void> {
  const status = await getMonthlyBackupSchedule();
  res.json({ success: true, data: status });
}

export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateScheduleSchema>;
  await setMonthlyBackupSchedule(body.enabled);
  void audit({
    action: 'update',
    entity: 'Backup',
    metadata: { event: 'schedule.toggled', enabled: body.enabled },
  });
  const status = await getMonthlyBackupSchedule();
  res.json({ success: true, data: status });
}
