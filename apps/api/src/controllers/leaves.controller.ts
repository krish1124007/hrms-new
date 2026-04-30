import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { LeaveType, LeaveBalance, LeaveRequest, Employee, Holiday, Shift } from '../models/index.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';

// ---------- Helpers ----------

async function getCurrentEmployee(): Promise<typeof Employee.prototype | null> {
  const userId = getUserId();
  if (!userId) return null;
  return Employee.findOne({ userId: new Types.ObjectId(userId) }).exec();
}

/**
 * Compute working days between startDate..endDate inclusive,
 * excluding non-work days (shift.workDays) and holidays.
 */
async function computeWorkingDays(
  start: Date,
  end: Date,
  workDays: number[],
  isHalfDay: boolean,
): Promise<number> {
  if (end < start) throw new ValidationAppError('endDate must be on or after startDate');

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  const holidays = await Holiday.find({
    date: { $gte: startDay, $lte: endDay },
  })
    .select('date')
    .lean()
    .exec();
  const holidaySet = new Set(
    holidays.map((h) => new Date(h.date).toISOString().slice(0, 10)),
  );

  let count = 0;
  const cur = new Date(startDay);
  while (cur <= endDay) {
    const dow = cur.getDay();
    const key = cur.toISOString().slice(0, 10);
    if (workDays.includes(dow) && !holidaySet.has(key)) count += 1;
    cur.setDate(cur.getDate() + 1);
  }

  if (isHalfDay && count > 0) count = count - 0.5;
  return count;
}

// ---------- Leave Type ----------

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  daysAllowed: z.coerce.number().min(0),
  carryForward: z
    .object({
      enabled: z.boolean().default(false),
      maxDays: z.coerce.number().min(0).default(0),
    })
    .default({ enabled: false, maxDays: 0 }),
  encashable: z.boolean().default(false),
  paidLeave: z.boolean().default(true),
  applicableGender: z.enum(['all', 'male', 'female']).default('all'),
  probationAllowed: z.boolean().default(false),
  halfDayAllowed: z.boolean().default(true),
  attachmentRequired: z.boolean().default(false),
  color: z.string().default('#3b82f6'),
  isActive: z.boolean().default(true),
});
export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

export const leaveTypeQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  isActive: z.coerce.boolean().optional(),
});

export async function listLeaveTypes(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (typeof q.isActive === 'boolean') filter.isActive = q.isActive;
  const result = await LeaveType.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: 'name',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function createLeaveType(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createLeaveTypeSchema>;
  const doc = await LeaveType.create(body);
  void audit({ action: 'create', entity: 'LeaveType', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function getLeaveType(req: Request, res: Response): Promise<void> {
  const doc = await LeaveType.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave type not found');
  res.json({ success: true, data: doc });
}

export async function updateLeaveType(req: Request, res: Response): Promise<void> {
  const doc = await LeaveType.findByIdAndUpdate(String(req.params.id), req.body, {
    new: true,
  }).exec();
  if (!doc) throw new NotFoundError('Leave type not found');
  void audit({ action: 'update', entity: 'LeaveType', entityId: String(doc._id) });
  res.json({ success: true, data: doc });
}

export async function deleteLeaveType(req: Request, res: Response): Promise<void> {
  const doc = await LeaveType.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave type not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  void audit({ action: 'delete', entity: 'LeaveType', entityId: String(doc._id) });
  res.json({ success: true, message: 'Leave type deleted' });
}

// ---------- Leave Balance ----------

export const balanceQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  employeeId: z.string().optional(),
  leaveTypeId: z.string().optional(),
  year: z.coerce.number().int().optional(),
});

export const allocateBalanceSchema = z.object({
  employeeIds: z.array(z.string()).min(1),
  leaveTypeId: z.string(),
  year: z.coerce.number().int(),
  allocated: z.coerce.number().min(0),
});

export const adjustBalanceSchema = z.object({
  delta: z.coerce.number(),
  reason: z.string().optional(),
});

export async function listLeaveBalances(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.employeeId) filter.employeeId = new Types.ObjectId(q.employeeId);
  if (q.leaveTypeId) filter.leaveTypeId = new Types.ObjectId(q.leaveTypeId);
  if (q.year) filter.year = q.year;
  const result = await LeaveBalance.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-year',
    populate: [
      { path: 'employeeId', select: 'firstName lastName employeeId' },
      { path: 'leaveTypeId', select: 'name code color' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myLeaveBalances(req: Request, res: Response): Promise<void> {
  const employee = await getCurrentEmployee();
  if (!employee) throw new NotFoundError('Employee profile not found');
  const year = Number(req.query.year ?? new Date().getFullYear());
  const list = await LeaveBalance.find({ employeeId: employee._id, year })
    .populate('leaveTypeId', 'name code color')
    .lean()
    .exec();
  res.json({ success: true, data: list });
}

export async function allocateLeaveBalances(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof allocateBalanceSchema>;
  const ops = body.employeeIds.map((eid) => ({
    updateOne: {
      filter: {
        employeeId: new Types.ObjectId(eid),
        leaveTypeId: new Types.ObjectId(body.leaveTypeId),
        year: body.year,
      },
      update: { $set: { allocated: body.allocated } },
      upsert: true,
    },
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await LeaveBalance.bulkWrite(ops as any);
  void audit({ action: 'update', entity: 'LeaveBalance', after: { count: ops.length } });
  res.json({ success: true, data: { matched: result.matchedCount, upserted: result.upsertedCount } });
}

export async function adjustLeaveBalance(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof adjustBalanceSchema>;
  const doc = await LeaveBalance.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave balance not found');
  doc.adjusted = (doc.adjusted ?? 0) + body.delta;
  await doc.save();
  void audit({
    action: 'update',
    entity: 'LeaveBalance',
    entityId: String(doc._id),
    after: { delta: body.delta, reason: body.reason },
  });
  res.json({ success: true, data: doc });
}

// ---------- Leave Request ----------

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().optional(), // optional — defaults to current employee
  leaveTypeId: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  isHalfDay: z.boolean().default(false),
  halfDayType: z.enum(['first_half', 'second_half']).optional(),
  reason: z.string().min(1),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        fileUrl: z.string().url(),
      }),
    )
    .default([]),
});

export const leaveRequestQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  employeeId: z.string().optional(),
  leaveTypeId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});

export const rejectLeaveSchema = z.object({
  reason: z.string().min(1),
});

export async function listLeaveRequests(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.employeeId) filter.employeeId = new Types.ObjectId(q.employeeId);
  if (q.leaveTypeId) filter.leaveTypeId = new Types.ObjectId(q.leaveTypeId);
  if (q.from || q.to) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const range: Record<string, any> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) range.$lte = q.to;
    filter.startDate = range;
  }
  const result = await LeaveRequest.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: [
      { path: 'employeeId', select: 'firstName lastName employeeId' },
      { path: 'leaveTypeId', select: 'name code color' },
      { path: 'approvedBy', select: 'firstName lastName email' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myLeaveRequests(req: Request, res: Response): Promise<void> {
  const employee = await getCurrentEmployee();
  if (!employee) throw new NotFoundError('Employee profile not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const result = await LeaveRequest.paginate(
    { employeeId: employee._id },
    {
      page: Number(q.page ?? 1),
      limit: Number(q.limit ?? 20),
      sort: '-createdAt',
      populate: [{ path: 'leaveTypeId', select: 'name code color' }],
    },
  );
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function teamLeaveRequests(req: Request, res: Response): Promise<void> {
  const manager = await getCurrentEmployee();
  if (!manager) throw new NotFoundError('Employee profile not found');
  const team = await Employee.find({ reportingManager: manager._id }).select('_id').lean().exec();
  const teamIds = team.map((t) => t._id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { employeeId: { $in: teamIds } };
  if (q.status) filter.status = q.status;
  const result = await LeaveRequest.paginate(filter, {
    page: Number(q.page ?? 1),
    limit: Number(q.limit ?? 20),
    sort: '-createdAt',
    populate: [
      { path: 'employeeId', select: 'firstName lastName employeeId' },
      { path: 'leaveTypeId', select: 'name code color' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function leaveCalendar(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const from = q.from ? new Date(q.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to = q.to ? new Date(q.to) : new Date(from.getFullYear(), from.getMonth() + 1, 0);
  const list = await LeaveRequest.find({
    status: { $in: ['approved', 'pending'] },
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .populate('employeeId', 'firstName lastName employeeId')
    .populate('leaveTypeId', 'name code color')
    .lean()
    .exec();
  res.json({ success: true, data: list });
}

export async function applyLeave(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createLeaveRequestSchema>;

  // Resolve employee
  let employeeId: Types.ObjectId;
  if (body.employeeId) {
    employeeId = new Types.ObjectId(body.employeeId);
  } else {
    const me = await getCurrentEmployee();
    if (!me) throw new NotFoundError('Employee profile not found');
    employeeId = me._id as Types.ObjectId;
  }

  // Validate dates
  if (body.endDate < body.startDate) {
    throw new ValidationAppError('endDate must be on or after startDate');
  }
  if (body.isHalfDay && body.startDate.getTime() !== body.endDate.getTime()) {
    throw new ValidationAppError('Half day leave must be on a single date');
  }

  // Get employee shift to determine workDays
  const emp = await Employee.findById(employeeId).populate('shift').exec();
  if (!emp) throw new NotFoundError('Employee not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shift = emp.shift as any;
  const workDays: number[] = shift?.workDays ?? [1, 2, 3, 4, 5];

  // Compute working days
  const days = await computeWorkingDays(body.startDate, body.endDate, workDays, body.isHalfDay);
  if (days <= 0) {
    throw new ValidationAppError('Selected range has no working days');
  }

  // Check for overlapping leave requests
  const overlap = await LeaveRequest.findOne({
    employeeId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: body.endDate },
    endDate: { $gte: body.startDate },
  }).exec();
  if (overlap) {
    throw new ValidationAppError('Overlapping leave request exists for this period');
  }

  // Validate balance — lazy-allocate from leaveType.daysAllowed if missing,
  // so HR doesn't need to run the bulk-allocate endpoint before employees apply.
  const year = body.startDate.getFullYear();
  const leaveTypeOid = new Types.ObjectId(body.leaveTypeId);
  let balance = await LeaveBalance.findOne({
    employeeId,
    leaveTypeId: leaveTypeOid,
    year,
  }).exec();
  if (!balance) {
    const leaveType = await LeaveType.findById(leaveTypeOid).exec();
    if (!leaveType) throw new ValidationAppError('Invalid leave type');
    if (!leaveType.daysAllowed || leaveType.daysAllowed <= 0) {
      throw new ValidationAppError(
        `${leaveType.name} has no annual allocation — please contact HR to set one`,
      );
    }
    balance = await LeaveBalance.create({
      employeeId,
      leaveTypeId: leaveTypeOid,
      year,
      allocated: leaveType.daysAllowed,
    });
  }
  const remaining =
    (balance.allocated ?? 0) +
    (balance.carried ?? 0) +
    (balance.adjusted ?? 0) -
    (balance.used ?? 0);
  if (days > remaining) {
    throw new ValidationAppError(`Insufficient leave balance (available: ${remaining}, requested: ${days})`);
  }

  const doc = await LeaveRequest.create({
    employeeId,
    leaveTypeId: new Types.ObjectId(body.leaveTypeId),
    startDate: body.startDate,
    endDate: body.endDate,
    days,
    isHalfDay: body.isHalfDay,
    halfDayType: body.halfDayType,
    reason: body.reason,
    attachments: body.attachments.map((a) => ({ ...a, uploadedAt: new Date() })),
    status: 'pending',
    appliedAt: new Date(),
  });

  void audit({ action: 'create', entity: 'LeaveRequest', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function getLeaveRequest(req: Request, res: Response): Promise<void> {
  const doc = await LeaveRequest.findById(String(req.params.id))
    .populate('employeeId', 'firstName lastName employeeId')
    .populate('leaveTypeId', 'name code color')
    .populate('approvedBy', 'firstName lastName email')
    .exec();
  if (!doc) throw new NotFoundError('Leave request not found');
  res.json({ success: true, data: doc });
}

export async function approveLeaveRequest(req: Request, res: Response): Promise<void> {
  const doc = await LeaveRequest.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave request not found');
  if (doc.status !== 'pending') {
    throw new ValidationAppError(`Cannot approve a ${doc.status} request`);
  }

  // Increment used in balance
  const year = doc.startDate.getFullYear();
  await LeaveBalance.findOneAndUpdate(
    { employeeId: doc.employeeId, leaveTypeId: doc.leaveTypeId, year },
    { $inc: { used: doc.days } },
  ).exec();

  doc.status = 'approved';
  const userId = getUserId();
  if (userId) doc.approvedBy = new Types.ObjectId(userId);
  doc.approvedAt = new Date();
  await doc.save();

  void audit({ action: 'update', entity: 'LeaveRequest', entityId: String(doc._id), after: { status: 'approved' } });
  res.json({ success: true, data: doc });
}

export async function rejectLeaveRequest(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof rejectLeaveSchema>;
  const doc = await LeaveRequest.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave request not found');
  if (doc.status !== 'pending') {
    throw new ValidationAppError(`Cannot reject a ${doc.status} request`);
  }
  doc.status = 'rejected';
  doc.rejectedReason = body.reason;
  const userId = getUserId();
  if (userId) doc.approvedBy = new Types.ObjectId(userId);
  doc.approvedAt = new Date();
  await doc.save();
  void audit({ action: 'update', entity: 'LeaveRequest', entityId: String(doc._id), after: { status: 'rejected' } });
  res.json({ success: true, data: doc });
}

export async function cancelLeaveRequest(req: Request, res: Response): Promise<void> {
  const doc = await LeaveRequest.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Leave request not found');
  if (doc.status === 'cancelled' || doc.status === 'rejected') {
    throw new ValidationAppError(`Cannot cancel a ${doc.status} request`);
  }
  // If approved, restore balance
  if (doc.status === 'approved') {
    const year = doc.startDate.getFullYear();
    await LeaveBalance.findOneAndUpdate(
      { employeeId: doc.employeeId, leaveTypeId: doc.leaveTypeId, year },
      { $inc: { used: -doc.days } },
    ).exec();
  }
  doc.status = 'cancelled';
  await doc.save();
  void audit({ action: 'update', entity: 'LeaveRequest', entityId: String(doc._id), after: { status: 'cancelled' } });
  res.json({ success: true, data: doc });
}

// ---------- Reports ----------

export async function leaveReports(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const year = Number(q.year ?? new Date().getFullYear());

  const [byStatus, byType, totalDays] = await Promise.all([
    LeaveRequest.aggregate([
      { $match: { startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) } } },
      { $group: { _id: '$status', n: { $sum: 1 }, days: { $sum: '$days' } } },
    ]),
    LeaveRequest.aggregate([
      {
        $match: {
          status: 'approved',
          startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) },
        },
      },
      { $group: { _id: '$leaveTypeId', days: { $sum: '$days' } } },
      { $lookup: { from: 'leavetypes', localField: '_id', foreignField: '_id', as: 'leaveType' } },
      { $unwind: { path: '$leaveType', preserveNullAndEmptyArrays: true } },
      { $project: { leaveTypeId: '$_id', name: '$leaveType.name', color: '$leaveType.color', days: 1, _id: 0 } },
    ]),
    LeaveRequest.aggregate([
      {
        $match: {
          status: 'approved',
          startDate: { $gte: new Date(`${year}-01-01`), $lt: new Date(`${year + 1}-01-01`) },
        },
      },
      { $group: { _id: null, days: { $sum: '$days' } } },
    ]),
  ]);

  res.json({
    success: true,
    data: { year, byStatus, byType, totalApprovedDays: totalDays[0]?.days ?? 0 },
  });
}

// Suppress unused-import warning for Shift (kept for type clarity if needed later)
void Shift;
