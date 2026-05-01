import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { DocumentModel as DocumentRecord } from '../models/document.model.js';
import {
  NotFoundError,
  ValidationAppError,
  UnauthorizedError,
  ForbiddenError,
} from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { saveFile, deleteFile } from '../lib/local-storage.js';

// Roles that bypass per-user visibility — HR/admin need to see every document
// for compliance, payroll, and offboarding workflows.
const PRIVILEGED_ROLES = new Set(['admin', 'hr_manager', 'hr_executive']);

function isPrivileged(user: Express.Request['user']): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slug = (user as any)?.role?.slug as string | undefined;
  return !!slug && PRIVILEGED_ROLES.has(slug);
}

/**
 * Visibility filter for non-privileged users — they may see documents they
 * uploaded, documents marked accessLevel='all', and documents explicitly
 * shared with them. Privileged roles get an empty filter (see all).
 */
function visibilityFilter(user: Express.Request['user']): Record<string, unknown> {
  if (!user) return { _id: null };
  if (isPrivileged(user)) return {};
  return {
    $or: [
      { uploadedBy: user._id },
      { accessLevel: 'all' },
      { 'sharedWith.userId': user._id },
    ],
  };
}

// ---------- Validation Schemas ----------

export const updateDocumentSchema = z.object({
  name: z.string().min(1).optional(),
  folder: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  accessLevel: z.enum(['private', 'department', 'all']).optional(),
});

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  folder: z.string().optional(),
  search: z.string().optional(),
});

// ---------- Helpers ----------

function safeFilename(name: string): string {
  // Strip path separators + null bytes; replace anything weird with `_`.
  return name
    .replace(/[\\/:*?"<>|\x00]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 200) || 'file';
}

function normaliseFolder(folder?: string): string {
  if (!folder) return '/';
  const f = folder.trim().replace(/\\+/g, '/');
  if (!f.startsWith('/')) return '/' + f;
  return f.replace(/\/+$/, '') || '/';
}

// ---------- Controllers ----------

export async function listDocuments(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const page = Number(q.page ?? 1);
  const limit = Number(q.limit ?? 50);
  const skip = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { ...visibilityFilter(req.user) };
  if (q.folder) filter.folder = normaliseFolder(q.folder);
  if (q.search) filter.name = { $regex: q.search, $options: 'i' };

  const [docs, total] = await Promise.all([
    DocumentRecord.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'firstName lastName email')
      .lean()
      .exec(),
    DocumentRecord.countDocuments(filter).exec(),
  ]);

  res.json({
    success: true,
    data: docs,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
}

/**
 * Distinct folder paths in the document collection — used to render a
 * folder tree on the frontend without hardcoding it.
 */
export async function listFolders(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const folders = await DocumentRecord.distinct('folder', visibilityFilter(req.user));
  res.json({
    success: true,
    data: (folders as string[]).filter(Boolean).sort(),
  });
}

/**
 * Multipart upload entry point. Expects `multer.single('file')` middleware
 * to have populated `req.file`. Optional fields: folder, tags (CSV),
 * category, accessLevel.
 */
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (!isPrivileged(req.user)) {
    throw new ForbiddenError('Only HR or admin users can upload documents');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = (req as any).file as
    | { originalname: string; buffer: Buffer; size: number; mimetype: string }
    | undefined;
  if (!file) throw new ValidationAppError('No file uploaded — send a multipart "file" field');

  const folder = normaliseFolder(req.body.folder as string | undefined);
  const tags = typeof req.body.tags === 'string' ? req.body.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
  const category = (req.body.category as string | undefined)?.trim() || undefined;
  const accessLevel = (req.body.accessLevel as 'private' | 'department' | 'all') ?? 'private';

  // Storage key: documents/<yyyy>/<mm>/<timestamp>-<rand>-<safeName>
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const safeName = safeFilename(file.originalname);
  const rand = randomBytes(4).toString('hex');
  const key = `documents/${yyyy}/${mm}/${now.getTime()}-${rand}-${safeName}`;

  const url = await saveFile(key, file.buffer, file.mimetype);

  const doc = await DocumentRecord.create({
    name: safeName,
    category,
    folder,
    tags,
    accessLevel,
    file: {
      url,
      size: file.size,
      mimeType: file.mimetype,
      key,
    },
    uploadedBy: req.user._id,
  });

  void audit({ action: 'create', entity: 'Document', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function getDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await DocumentRecord.findOne({
    _id: String(req.params.id),
    ...visibilityFilter(req.user),
  })
    .populate('uploadedBy', 'firstName lastName email')
    .exec();
  if (!doc) throw new NotFoundError('Document not found');
  res.json({ success: true, data: doc });
}

export async function updateDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await DocumentRecord.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Document not found');
  if (!isPrivileged(req.user) && String(doc.uploadedBy) !== String(req.user._id)) {
    throw new ForbiddenError('You can only modify documents you uploaded');
  }

  const body = req.body as z.infer<typeof updateDocumentSchema>;
  const update: Record<string, unknown> = { ...body };
  if (body.folder) update.folder = normaliseFolder(body.folder);

  const updated = await DocumentRecord.findByIdAndUpdate(doc._id, update, { new: true }).exec();
  if (!updated) throw new NotFoundError('Document not found');
  void audit({ action: 'update', entity: 'Document', entityId: String(updated._id) });
  res.json({ success: true, data: updated });
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const doc = await DocumentRecord.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Document not found');
  if (!isPrivileged(req.user) && String(doc.uploadedBy) !== String(req.user._id)) {
    throw new ForbiddenError('You can only delete documents you uploaded');
  }

  // Best-effort blob cleanup — soft-delete the row even if the file is gone
  if (doc.file?.key) {
    try {
      await deleteFile(doc.file.key);
    } catch {
      // swallow — soft delete should still succeed
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  void audit({ action: 'delete', entity: 'Document', entityId: String(doc._id) });
  res.json({ success: true, message: 'Document deleted' });
}
