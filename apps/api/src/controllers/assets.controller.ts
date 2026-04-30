import type { Request, Response } from 'express';
import { z } from 'zod';
import { Asset } from '../models/asset.model.js';
import { Employee } from '../models/employee.model.js';
import { ConflictError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { audit } from '../services/audit.service.js';

const ASSET_CATEGORIES = [
  'laptop',
  'desktop',
  'mobile',
  'tablet',
  'monitor',
  'peripheral',
  'furniture',
  'vehicle',
  'tool',
  'other',
] as const;

const ASSET_STATUSES = ['available', 'assigned', 'maintenance', 'retired', 'lost'] as const;
const ASSET_CONDITIONS = ['new', 'good', 'fair', 'poor', 'damaged'] as const;

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

export const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  assetCode: z.string().min(1).max(64).optional(),
  category: z.enum(ASSET_CATEGORIES).default('other'),
  status: z.enum(ASSET_STATUSES).optional(),
  condition: z.enum(ASSET_CONDITIONS).default('good'),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  purchaseDate: z.coerce.date().optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  currentValue: z.coerce.number().min(0).optional(),
  warrantyExpiresAt: z.coerce.date().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

export const updateAssetSchema = createAssetSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  category: z.enum(ASSET_CATEGORIES).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  assignedTo: objectId.optional(),
  sort: z.string().optional(),
});

export const assignSchema = z.object({
  employee: objectId,
  notes: z.string().optional(),
});

export const unassignSchema = z.object({
  notes: z.string().optional(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
});

async function nextAssetCode(): Promise<string> {
  const last = await Asset.findOne({ assetCode: /^AST-/ })
    .sort({ assetCode: -1 })
    .select('assetCode')
    .lean()
    .exec();
  const lastNum = last?.assetCode?.match(/AST-(\d+)/)?.[1];
  const next = lastNum ? Number(lastNum) + 1 : 1;
  return `AST-${String(next).padStart(4, '0')}`;
}

/** GET /api/v1/assets/me — assets currently assigned to the calling employee. Auth-only, no perms. */
export async function myAssets(_req: Request, res: Response): Promise<void> {
  const userId = getUserId();
  if (!userId) {
    res.json({ success: true, data: [] });
    return;
  }
  const emp = await Employee.findOne({ userId }).select('_id').lean().exec();
  if (!emp) {
    res.json({ success: true, data: [] });
    return;
  }
  const assets = await Asset.find({ assignedTo: emp._id })
    .sort({ updatedAt: -1 })
    .lean()
    .exec();
  res.json({ success: true, data: assets });
}

/** GET /api/v1/assets */
export async function listAssets(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.category) filter.category = q.category;
  if (q.status) filter.status = q.status;
  if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.search) {
    const re = new RegExp(q.search, 'i');
    filter.$or = [
      { name: re },
      { assetCode: re },
      { serialNumber: re },
      { manufacturer: re },
      { modelNumber: re },
    ];
  }

  const result = await Asset.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: { path: 'assignedTo', select: 'firstName lastName employeeId email profileImage' },
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

/** GET /api/v1/assets/stats */
export async function assetStats(_req: Request, res: Response): Promise<void> {
  const notDeleted = { isDeleted: { $ne: true } };
  const [total, byStatus, byCategory, valueAgg] = await Promise.all([
    Asset.countDocuments({}),
    Asset.aggregate([
      { $match: notDeleted },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Asset.aggregate([
      { $match: notDeleted },
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]),
    Asset.aggregate([
      { $match: notDeleted },
      {
        $group: {
          _id: null,
          purchase: { $sum: { $ifNull: ['$purchasePrice', 0] } },
          current: { $sum: { $ifNull: ['$currentValue', 0] } },
        },
      },
    ]),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const s of ASSET_STATUSES) statusCounts[s] = 0;
  for (const row of byStatus) statusCounts[row._id] = row.n;

  res.json({
    success: true,
    data: {
      total,
      byStatus: statusCounts,
      byCategory,
      totalPurchaseValue: valueAgg[0]?.purchase ?? 0,
      totalCurrentValue: valueAgg[0]?.current ?? 0,
    },
  });
}

/** POST /api/v1/assets */
export async function createAsset(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createAssetSchema>;
  const assetCode = body.assetCode?.trim() || (await nextAssetCode());

  try {
    const asset = await Asset.create({
      ...body,
      assetCode,
      imageUrl: body.imageUrl || undefined,
      status: body.status ?? 'available',
    });
    void audit({ action: 'create', entity: 'Asset', entityId: String(asset._id) });
    res.status(201).json({ success: true, data: asset });
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((err as any).code === 11000) {
      throw new ConflictError('An asset with this code already exists');
    }
    throw err;
  }
}

/** GET /api/v1/assets/:id */
export async function getAsset(req: Request, res: Response): Promise<void> {
  const asset = await Asset.findById(String(req.params.id))
    .populate('assignedTo', 'firstName lastName employeeId email profileImage')
    .populate('history.employee', 'firstName lastName employeeId')
    .exec();
  if (!asset) throw new NotFoundError('Asset not found');
  res.json({ success: true, data: asset });
}

/** PATCH /api/v1/assets/:id */
export async function updateAsset(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateAssetSchema>;
  const asset = await Asset.findByIdAndUpdate(
    String(req.params.id),
    {
      ...body,
      imageUrl: body.imageUrl === '' ? undefined : body.imageUrl,
    },
    { new: true, runValidators: true },
  )
    .populate('assignedTo', 'firstName lastName employeeId email profileImage')
    .exec();
  if (!asset) throw new NotFoundError('Asset not found');
  void audit({ action: 'update', entity: 'Asset', entityId: String(asset._id) });
  res.json({ success: true, data: asset });
}

/** DELETE /api/v1/assets/:id */
export async function deleteAsset(req: Request, res: Response): Promise<void> {
  const asset = await Asset.findById(String(req.params.id)).exec();
  if (!asset) throw new NotFoundError('Asset not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (asset as any).softDelete();
  void audit({ action: 'delete', entity: 'Asset', entityId: String(asset._id) });
  res.json({ success: true, message: 'Asset deleted' });
}

/** POST /api/v1/assets/:id/assign */
export async function assignAsset(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof assignSchema>;
  const asset = await Asset.findById(String(req.params.id)).exec();
  if (!asset) throw new NotFoundError('Asset not found');
  if (asset.status === 'retired' || asset.status === 'lost') {
    throw new ValidationAppError(`Cannot assign a ${asset.status} asset`);
  }
  if (asset.assignedTo) {
    throw new ValidationAppError('Asset is already assigned. Unassign it first.');
  }

  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asset.assignedTo = body.employee as any;
  asset.assignedAt = now;
  asset.status = 'assigned';
  asset.history.push({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employee: body.employee as any,
    assignedAt: now,
    notes: body.notes,
  });
  await asset.save();
  await asset.populate('assignedTo', 'firstName lastName employeeId email profileImage');

  void audit({
    action: 'update',
    entity: 'Asset',
    entityId: String(asset._id),
    metadata: { assignedTo: body.employee },
  });
  res.json({ success: true, data: asset });
}

/** POST /api/v1/assets/:id/unassign */
export async function unassignAsset(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof unassignSchema>;
  const asset = await Asset.findById(String(req.params.id)).exec();
  if (!asset) throw new NotFoundError('Asset not found');
  if (!asset.assignedTo) {
    throw new ValidationAppError('Asset is not currently assigned');
  }

  const now = new Date();
  const open = asset.history.find((h) => !h.returnedAt);
  if (open) {
    open.returnedAt = now;
    if (body.notes) open.notes = [open.notes, body.notes].filter(Boolean).join(' • ');
  }
  asset.assignedTo = null;
  asset.assignedAt = null;
  asset.status = 'available';
  if (body.condition) asset.condition = body.condition;
  await asset.save();

  void audit({
    action: 'update',
    entity: 'Asset',
    entityId: String(asset._id),
    metadata: { unassigned: true },
  });
  res.json({ success: true, data: asset });
}
