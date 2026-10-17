import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { Employee } from '../models/employee.model.js';
import { NotFoundError, UnauthorizedError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import {
  assertNotSelfApproval,
  assertOwnOrPermission,
  currentEmployeeId,
  hasPermission,
} from '../lib/access.js';

const SELF_APPROVAL_MESSAGE = 'You cannot approve or reject your own overtime request';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');

export const createSchema = z.object({
  // Optional — defaults to the caller's employee record. Only holders of
  // `overtime.view` (HR / managers) may file on behalf of someone else; for
  // everyone else it is ignored.
  employee: objectId.optional(),
  date: z.coerce.date(),
  hours: z.coerce.number().positive().max(24),
  reason: z.string().min(1).max(1000),
});

export const updateSchema = z.object({
  date: z.coerce.date().optional(),
  hours: z.coerce.number().positive().max(24).optional(),
  reason: z.string().min(1).max(1000).optional(),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  employee: objectId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});

export const approveSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

/** GET /api/v1/overtime */
export async function list(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.employee) filter.employee = q.employee;
  if (q.from || q.to) {
    filter.date = {};
    if (q.from) filter.date.$gte = q.from;
    if (q.to) filter.date.$lte = q.to;
  }

  const result = await OvertimeRequest.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-date',
    populate: [
      { path: 'employee', select: 'firstName lastName employeeId email profileImage' },
      { path: 'approvedBy', select: 'firstName lastName email' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

/** GET /api/v1/overtime/me */
export async function listMine(req: Request, res: Response): Promise<void> {
  const employeeId = await currentEmployeeId(req);
  if (!employeeId) {
    res.json({ success: true, data: [], pagination: { page: 1, limit: 0, total: 0, pages: 1 } });
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { employee: employeeId };
  if (q.status) filter.status = q.status;
  const result = await OvertimeRequest.paginate(filter, {
    page: q.page ?? 1,
    limit: q.limit ?? 50,
    sort: '-date',
    populate: { path: 'approvedBy', select: 'firstName lastName' },
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

/** GET /api/v1/overtime/stats */
export async function stats(_req: Request, res: Response): Promise<void> {
  const notDeleted = { isDeleted: { $ne: true } };
  const [total, byStatus, hoursAgg] = await Promise.all([
    OvertimeRequest.countDocuments({}),
    OvertimeRequest.aggregate([
      { $match: notDeleted },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    OvertimeRequest.aggregate([
      { $match: { ...notDeleted, status: 'approved' } },
      { $group: { _id: null, totalHours: { $sum: '$hours' } } },
    ]),
  ]);

  const statusCounts: Record<string, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };
  for (const r of byStatus) statusCounts[r._id] = r.n;

  res.json({
    success: true,
    data: {
      total,
      byStatus: statusCounts,
      approvedHours: hoursAgg[0]?.totalHours ?? 0,
    },
  });
}

/** POST /api/v1/overtime */
export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof createSchema>;

  // Resolve which employee the request is for: the caller's own record,
  // unless an `overtime.view` holder names someone else.
  let employeeId: Types.ObjectId;
  if (body.employee && hasPermission(req.user, 'overtime.view')) {
    const emp = await Employee.findById(body.employee).select('_id').exec();
    if (!emp) throw new NotFoundError('Employee not found');
    employeeId = emp._id as Types.ObjectId;
  } else {
    const own = await currentEmployeeId(req);
    if (!own) {
      throw new ValidationAppError(
        'Cannot determine employee — link the user to an employee record',
      );
    }
    employeeId = own;
  }

  const otReq = await OvertimeRequest.create({
    employee: employeeId,
    date: body.date,
    hours: body.hours,
    reason: body.reason,
    status: 'pending',
    appliedAt: new Date(),
  });
  void audit({ action: 'create', entity: 'OvertimeRequest', entityId: String(otReq._id) });
  res.status(201).json({ success: true, data: otReq });
}

/** GET /api/v1/overtime/:id */
export async function get(req: Request, res: Response): Promise<void> {
  const otReq = await OvertimeRequest.findById(String(req.params.id))
    .populate('employee', 'firstName lastName employeeId email profileImage')
    .populate('approvedBy', 'firstName lastName email')
    .exec();
  if (!otReq) throw new NotFoundError('Overtime request not found');
  await assertOwnOrPermission(req, otReq.employee, 'overtime.view');
  res.json({ success: true, data: otReq });
}

/** PATCH /api/v1/overtime/:id */
export async function update(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateSchema>;
  const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
  if (!otReq) throw new NotFoundError('Overtime request not found');
  await assertOwnOrPermission(req, otReq.employee, 'overtime.view');
  if (otReq.status !== 'pending') {
    throw new ValidationAppError('Only pending requests can be edited');
  }
  if (body.date !== undefined) otReq.date = body.date;
  if (body.hours !== undefined) otReq.hours = body.hours;
  if (body.reason !== undefined) otReq.reason = body.reason;
  await otReq.save();
  void audit({ action: 'update', entity: 'OvertimeRequest', entityId: String(otReq._id) });
  res.json({ success: true, data: otReq });
}

/** DELETE /api/v1/overtime/:id — withdraw a pending request */
export async function remove(req: Request, res: Response): Promise<void> {
  const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
  if (!otReq) throw new NotFoundError('Overtime request not found');
  await assertOwnOrPermission(req, otReq.employee, 'overtime.view');
  if (otReq.status === 'approved' && otReq.payrollRecordId) {
    throw new ValidationAppError('Cannot withdraw — this request is already in a payroll cycle');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (otReq as any).softDelete();
  void audit({ action: 'delete', entity: 'OvertimeRequest', entityId: String(otReq._id) });
  res.json({ success: true, message: 'Overtime request withdrawn' });
}

/** POST /api/v1/overtime/:id/approve */
export async function approve(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof approveSchema>;
  const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
  if (!otReq) throw new NotFoundError('Overtime request not found');
  await assertNotSelfApproval(req, otReq.employee, SELF_APPROVAL_MESSAGE);
  if (otReq.status !== 'pending') {
    throw new ValidationAppError(`Cannot approve a request with status "${otReq.status}"`);
  }
  otReq.status = 'approved';
  otReq.approvedBy = req.user._id;
  otReq.approvedAt = new Date();
  if (body.notes) otReq.approverNotes = body.notes;
  await otReq.save();
  void audit({
    action: 'update',
    entity: 'OvertimeRequest',
    entityId: String(otReq._id),
    metadata: { event: 'approved' },
  });
  res.json({ success: true, data: otReq });
}

/** POST /api/v1/overtime/:id/reject */
export async function reject(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  const body = req.body as z.infer<typeof rejectSchema>;
  const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
  if (!otReq) throw new NotFoundError('Overtime request not found');
  await assertNotSelfApproval(req, otReq.employee, SELF_APPROVAL_MESSAGE);
  if (otReq.status !== 'pending') {
    throw new ValidationAppError(`Cannot reject a request with status "${otReq.status}"`);
  }
  otReq.status = 'rejected';
  otReq.approvedBy = req.user._id;
  otReq.approvedAt = new Date();
  otReq.rejectedReason = body.reason;
  await otReq.save();
  void audit({
    action: 'update',
    entity: 'OvertimeRequest',
    entityId: String(otReq._id),
    metadata: { event: 'rejected', reason: body.reason },
  });
  res.json({ success: true, data: otReq });
}
