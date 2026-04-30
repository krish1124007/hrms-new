import type { Request, Response } from 'express';
import { z } from 'zod';
import { Department } from '../models/department.model.js';
import { Employee } from '../models/employee.model.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';

export const createDepartmentSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  head: z.string().optional(),
  parentDepartment: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  sort: z.string().optional(),
});

export async function listDepartments(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.search) {
    filter.$or = [
      { name: { $regex: q.search, $options: 'i' } },
      { code: { $regex: q.search, $options: 'i' } },
    ];
  }
  const result = await Department.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? 'name',
    populate: [
      { path: 'head', select: 'firstName lastName employeeId profileImage' },
      { path: 'parentDepartment', select: 'name code' },
    ],
  });

  // attach employee counts
  const ids = result.data.map((d) => d._id);
  const counts = await Employee.aggregate([
    { $match: { department: { $in: ids } } },
    { $group: { _id: '$department', n: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.n]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data.map((d: any) => ({
    ...d.toObject(),
    employeeCount: map.get(String(d._id)) ?? 0,
  }));
  res.json({ success: true, data, pagination: result.pagination });
}

export async function getDepartmentTree(_req: Request, res: Response): Promise<void> {
  const all = await Department.find({}).sort('name').lean().exec();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roots: any[] = [];
  all.forEach((d) => map.set(String(d._id), { ...d, children: [] }));
  all.forEach((d) => {
    const node = map.get(String(d._id));
    if (d.parentDepartment) {
      const parent = map.get(String(d.parentDepartment));
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  });
  res.json({ success: true, data: roots });
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createDepartmentSchema>;
  const exists = await Department.findOne({ code: body.code.toUpperCase() }).exec();
  if (exists) throw new ConflictError('Department code already exists');
  const dept = await Department.create(body);
  void audit({ action: 'create', entity: 'Department', entityId: String(dept._id) });
  res.status(201).json({ success: true, data: dept });
}

export async function getDepartment(req: Request, res: Response): Promise<void> {
  const dept = await Department.findById(String(req.params.id))
    .populate('head', 'firstName lastName employeeId profileImage')
    .populate('parentDepartment', 'name code')
    .exec();
  if (!dept) throw new NotFoundError('Department not found');
  res.json({ success: true, data: dept });
}

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateDepartmentSchema>;
  const dept = await Department.findByIdAndUpdate(String(req.params.id), body, {
    new: true,
  }).exec();
  if (!dept) throw new NotFoundError('Department not found');
  void audit({ action: 'update', entity: 'Department', entityId: String(dept._id), after: body });
  res.json({ success: true, data: dept });
}

export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  const dept = await Department.findById(String(req.params.id)).exec();
  if (!dept) throw new NotFoundError('Department not found');
  const inUse = await Employee.countDocuments({ department: dept._id });
  if (inUse > 0) throw new ConflictError('Cannot delete: department has employees');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (dept as any).softDelete();
  void audit({ action: 'delete', entity: 'Department', entityId: String(dept._id) });
  res.json({ success: true, message: 'Department deleted' });
}
