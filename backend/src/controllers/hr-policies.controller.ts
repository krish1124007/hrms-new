import type { Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { HrPolicy } from '../models/hr-policy.model.js';
import { Employee } from '../models/employee.model.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { saveFile, deleteFile } from '../lib/local-storage.js';

const CATEGORIES = [
  'general',
  'code_of_conduct',
  'leave',
  'attendance',
  'compensation',
  'benefits',
  'safety',
  'security',
  'data_privacy',
  'remote_work',
  'travel',
  'expenses',
  'harassment',
  'grievance',
  'it',
  'other',
] as const;

const STATUSES = ['draft', 'published', 'archived'] as const;
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

/** GET /api/v1/hr-policies/published — all published policies. Auth-only, no perms. */
export async function listPublished(_req: Request, res: Response): Promise<void> {
  const policies = await HrPolicy.find({ status: 'published' })
    .sort({ category: 1, title: 1 })
    .select('-acknowledgements -versions')
    .lean()
    .exec();
  res.json({ success: true, data: policies });
}

export const createSchema = z.object({
  policyCode: z.string().max(64).optional(),
  title: z.string().min(1).max(200),
  category: z.enum(CATEGORIES).default('general'),
  summary: z.string().max(1000).optional(),
  content: z.string().min(1).max(200000),
  effectiveDate: z.coerce.date().optional(),
  reviewDueDate: z.coerce.date().optional(),
  mandatory: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export const updateSchema = createSchema.partial().extend({
  changeNotes: z.string().max(1000).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(STATUSES).optional(),
  mandatory: z.enum(['true', 'false']).optional(),
  tag: z.string().optional(),
  sort: z.string().optional(),
});

export const publishSchema = z.object({
  effectiveDate: z.coerce.date().optional(),
  changeNotes: z.string().max(1000).optional(),
});

export const acknowledgeSchema = z.object({
  employee: objectId,
  comment: z.string().max(1000).optional(),
});

async function nextPolicyCode(): Promise<string> {
  // The unique index on `policyCode` covers soft-deleted rows too, so we have
  // to count them when picking the next code — otherwise a deleted POL-0001
  // collides with the freshly-generated POL-0001. `withDeleted: true` opts
  // out of the soft-delete plugin's default filter (see mongoose-plugins.ts).
  const last = await HrPolicy.findOne({ policyCode: /^POL-/ })
    .setOptions({ withDeleted: true })
    .sort({ policyCode: -1 })
    .select('policyCode')
    .lean()
    .exec();
  const lastNum = last?.policyCode?.match(/POL-(\d+)/)?.[1];
  const next = lastNum ? Number(lastNum) + 1 : 1;
  return `POL-${String(next).padStart(4, '0')}`;
}

/** GET /api/v1/hr-policies */
export async function list(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.category) filter.category = q.category;
  if (q.status) filter.status = q.status;
  if (q.mandatory) filter.mandatory = q.mandatory === 'true';
  if (q.tag) filter.tags = q.tag;
  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [{ title: re }, { policyCode: re }, { summary: re }, { tags: re }];
  }

  // Non-managers only see published policies — drafts and archives are
  // HR/admin internal state. Force the filter regardless of any client-supplied
  // `status` so an employee can't request `?status=draft`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const role = (req.user as any)?.role as { permissions?: string[] } | undefined;
  const userPerms = new Set<string>([
    ...(role?.permissions ?? []),
    ...(req.user?.customPermissions ?? []),
  ]);
  const canManage = userPerms.has('*') || userPerms.has('policies.manage');
  if (!canManage) filter.status = 'published';

  const result = await HrPolicy.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-updatedAt',
    select:
      'policyCode title category status summary currentVersion mandatory effectiveDate reviewDueDate tags acknowledgements createdAt updatedAt',
  });

  // Decorate each row with cheap counts (no need to ship the full content blob).
  const data = result.data.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (p as any).toObject ? (p as any).toObject() : p;
    obj.acknowledgementCount = obj.acknowledgements?.length ?? 0;
    delete obj.acknowledgements;
    return obj;
  });

  res.json({ success: true, data, pagination: result.pagination });
}

/** GET /api/v1/hr-policies/stats */
export async function stats(_req: Request, res: Response): Promise<void> {
  const notDeleted = { isDeleted: { $ne: true } };
  const [total, byStatus, byCategory, mandatoryCount, totalEmployees] = await Promise.all([
    HrPolicy.countDocuments({}),
    HrPolicy.aggregate([
      { $match: notDeleted },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    HrPolicy.aggregate([
      { $match: notDeleted },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]),
    HrPolicy.countDocuments({ mandatory: true, status: 'published' }),
    Employee.countDocuments({ status: 'active' }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const s of STATUSES) statusCounts[s] = 0;
  for (const r of byStatus) statusCounts[r._id] = r.n;

  res.json({
    success: true,
    data: {
      total,
      byStatus: statusCounts,
      byCategory,
      mandatoryPublished: mandatoryCount,
      activeEmployees: totalEmployees,
    },
  });
}

/** POST /api/v1/hr-policies */
export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createSchema>;
  const policyCode = body.policyCode?.trim() || (await nextPolicyCode());

  try {
    const policy = await HrPolicy.create({
      ...body,
      policyCode,
      status: 'draft',
      currentVersion: 1,
      versions: [
        {
          versionNumber: 1,
          content: body.content,
          publishedAt: null,
        },
      ],
    });
    void audit({ action: 'create', entity: 'HrPolicy', entityId: String(policy._id) });
    res.status(201).json({ success: true, data: policy });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).code === 11000) {
      throw new ConflictError('A policy with this code already exists');
    }
    throw err;
  }
}

/** GET /api/v1/hr-policies/:id */
export async function get(req: Request, res: Response): Promise<void> {
  const policy = await HrPolicy.findById(String(req.params.id))
    .populate('ownerUser', 'firstName lastName email')
    .populate('versions.publishedBy', 'firstName lastName')
    .populate('acknowledgements.employee', 'firstName lastName employeeId email profileImage')
    .exec();
  if (!policy) throw new NotFoundError('Policy not found');
  res.json({ success: true, data: policy });
}

/** PATCH /api/v1/hr-policies/:id */
export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateSchema>;
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');

  const contentChanged = body.content !== undefined && body.content !== policy.content;

  // If the policy is already published and the content is being edited,
  // fork a new draft version. Metadata-only changes apply in place.
  if (contentChanged && policy.status === 'published') {
    const nextVersion = policy.currentVersion + 1;
    policy.versions.push({
      versionNumber: nextVersion,
      content: body.content as string,
      changeNotes: body.changeNotes,
      publishedAt: null,
      publishedBy: null,
      effectiveDate: null,
    });
    policy.currentVersion = nextVersion;
    policy.status = 'draft';
    policy.content = body.content as string;
  } else if (contentChanged) {
    // In-place rewrite of the current draft version.
    policy.content = body.content as string;
    const v = policy.versions.find((x) => x.versionNumber === policy.currentVersion);
    if (v) {
      v.content = body.content as string;
      if (body.changeNotes !== undefined) v.changeNotes = body.changeNotes;
    } else {
      // No version yet (legacy doc) — create one.
      policy.versions.push({
        versionNumber: policy.currentVersion,
        content: body.content as string,
        changeNotes: body.changeNotes,
        publishedAt: null,
        publishedBy: null,
        effectiveDate: null,
      });
    }
  }

  if (body.title !== undefined) policy.title = body.title;
  if (body.category !== undefined) policy.category = body.category;
  if (body.summary !== undefined) policy.summary = body.summary;
  if (body.effectiveDate !== undefined) policy.effectiveDate = body.effectiveDate;
  if (body.reviewDueDate !== undefined) policy.reviewDueDate = body.reviewDueDate;
  if (body.mandatory !== undefined) policy.mandatory = body.mandatory;
  if (body.tags !== undefined) policy.tags = body.tags;
  if (body.policyCode !== undefined && body.policyCode.trim() !== '') {
    policy.policyCode = body.policyCode.trim().toUpperCase();
  }

  await policy.save();
  void audit({ action: 'update', entity: 'HrPolicy', entityId: String(policy._id) });
  res.json({ success: true, data: policy });
}

/** POST /api/v1/hr-policies/:id/publish */
export async function publish(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof publishSchema>;
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');
  if (policy.status === 'published') {
    throw new ValidationAppError('Policy is already published');
  }
  if (!policy.content?.trim()) {
    throw new ValidationAppError('Cannot publish a policy with empty content');
  }

  const v = policy.versions.find((x) => x.versionNumber === policy.currentVersion);
  if (v) {
    v.publishedAt = new Date();
    v.publishedBy = req.user._id;
    if (body.effectiveDate) v.effectiveDate = body.effectiveDate;
    if (body.changeNotes !== undefined) v.changeNotes = body.changeNotes;
  }
  policy.status = 'published';
  if (body.effectiveDate) policy.effectiveDate = body.effectiveDate;
  await policy.save();

  void audit({
    action: 'update',
    entity: 'HrPolicy',
    entityId: String(policy._id),
    metadata: { event: 'published', version: policy.currentVersion },
  });
  res.json({ success: true, data: policy });
}

/** POST /api/v1/hr-policies/:id/archive */
export async function archive(req: Request, res: Response): Promise<void> {
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');
  if (policy.status === 'archived') {
    throw new ValidationAppError('Policy is already archived');
  }
  policy.status = 'archived';
  await policy.save();
  void audit({
    action: 'update',
    entity: 'HrPolicy',
    entityId: String(policy._id),
    metadata: { event: 'archived' },
  });
  res.json({ success: true, data: policy });
}

/** POST /api/v1/hr-policies/:id/restore */
export async function restore(req: Request, res: Response): Promise<void> {
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');
  if (policy.status !== 'archived') {
    throw new ValidationAppError('Only archived policies can be restored');
  }
  policy.status = policy.versions.some((v) => v.publishedAt) ? 'published' : 'draft';
  await policy.save();
  res.json({ success: true, data: policy });
}

/** DELETE /api/v1/hr-policies/:id */
export async function remove(req: Request, res: Response): Promise<void> {
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (policy as any).softDelete();
  void audit({ action: 'delete', entity: 'HrPolicy', entityId: String(policy._id) });
  res.json({ success: true, message: 'Policy deleted' });
}

/** POST /api/v1/hr-policies/:id/acknowledge */
export async function acknowledge(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof acknowledgeSchema>;
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');
  if (policy.status !== 'published') {
    throw new ValidationAppError('Only published policies can be acknowledged');
  }

  // Replace the employee's previous acknowledgement (so we always reflect
  // the latest version they saw, rather than keeping a row per old version).
  policy.acknowledgements = policy.acknowledgements.filter(
    (a) => String(a.employee) !== body.employee,
  );
  policy.acknowledgements.push({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employee: body.employee as any,
    versionNumber: policy.currentVersion,
    acknowledgedAt: new Date(),
    comment: body.comment,
  });
  await policy.save();
  await policy.populate(
    'acknowledgements.employee',
    'firstName lastName employeeId email profileImage',
  );

  res.json({ success: true, data: policy });
}

/** GET /api/v1/hr-policies/:id/acknowledgements */
export async function listAcknowledgements(req: Request, res: Response): Promise<void> {
  const policy = await HrPolicy.findById(String(req.params.id))
    .populate('acknowledgements.employee', 'firstName lastName employeeId email profileImage')
    .exec();
  if (!policy) throw new NotFoundError('Policy not found');

  const total = await Employee.countDocuments({ status: 'active' });
  const acked = policy.acknowledgements.length;
  res.json({
    success: true,
    data: {
      acknowledgements: policy.acknowledgements,
      summary: {
        total,
        acknowledged: acked,
        pending: Math.max(0, total - acked),
        currentVersion: policy.currentVersion,
      },
    },
  });
}

/* ──────────────────────────────────────────────────────────── */
/* Attachments                                                   */
/* ──────────────────────────────────────────────────────────── */

function safeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\x00]+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 200) || 'file'
  );
}

/** POST /api/v1/hr-policies/:id/attachments — upload a PDF and attach it. */
export async function uploadAttachment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = (req as any).file as
    | { originalname: string; buffer: Buffer; size: number; mimetype: string }
    | undefined;
  if (!file) throw new ValidationAppError('No file uploaded — send a multipart "file" field');

  const isPdf =
    file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
  if (!isPdf) throw new ValidationAppError('Only PDF files are allowed for policy attachments');

  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');

  const safeName = safeFilename(file.originalname);
  const rand = randomBytes(4).toString('hex');
  const key = `policies/${String(policy._id)}/${Date.now()}-${rand}-${safeName}`;
  const url = await saveFile(key, file.buffer, file.mimetype);

  policy.attachments.push({
    name: safeName,
    url,
    uploadedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // Stash the storage key on the last attachment so we can clean up on delete.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (policy.attachments[policy.attachments.length - 1] as any).key = key;
  await policy.save();

  void audit({ action: 'update', entity: 'HrPolicy', entityId: String(policy._id) });
  res.status(201).json({ success: true, data: policy });
}

/** DELETE /api/v1/hr-policies/:id/attachments/:attachmentId — remove an attachment. */
export async function deleteAttachment(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const policy = await HrPolicy.findById(String(req.params.id)).exec();
  if (!policy) throw new NotFoundError('Policy not found');

  const attachmentId = String(req.params.attachmentId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const att = policy.attachments.find((a: any) => String(a._id) === attachmentId);
  if (!att) throw new NotFoundError('Attachment not found');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const key = (att as any).key as string | undefined;
  if (key) {
    try {
      await deleteFile(key);
    } catch {
      // Best-effort cleanup — proceed with row removal even if file is gone.
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  policy.attachments = policy.attachments.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a: any) => String(a._id) !== attachmentId,
  ) as typeof policy.attachments;
  await policy.save();

  void audit({ action: 'update', entity: 'HrPolicy', entityId: String(policy._id) });
  res.json({ success: true, data: policy });
}
