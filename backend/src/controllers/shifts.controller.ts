import type { Request, Response } from 'express';
import { z } from 'zod';
import { Shift, type IShift } from '../models/shift.model.js';
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createShiftSchema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(TIME_REGEX, 'HH:mm format'),
  endTime: z.string().regex(TIME_REGEX, 'HH:mm format'),
  graceMinutes: z.coerce.number().int().min(0).default(15),
  halfDayHours: z.coerce.number().min(0).default(4),
  fullDayHours: z.coerce.number().min(0).default(8),
  workDays: z.array(z.coerce.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  isNightShift: z.boolean().default(false),
  breakDuration: z.coerce.number().int().min(0).default(60),
  isDefault: z.boolean().default(false),
  color: z.string().default('#3b82f6'),
});

export const updateShiftSchema = createShiftSchema.partial();

export const assignShiftSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().optional(),
});

export async function listShifts(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.search) filter.name = { $regex: q.search, $options: 'i' };
  const result = await Shift.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-isDefault name',
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function createShift(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createShiftSchema>;
  const dup = await Shift.findOne({ name: body.name }).exec();
  if (dup) throw new ConflictError('Shift name already exists');
  if (body.isDefault) {
    await Shift.updateMany({}, { $set: { isDefault: false } });
  }
  const s = await Shift.create(body);
  void audit({ action: 'create', entity: 'Shift', entityId: String(s._id) });
  res.status(201).json({ success: true, data: s });
}

export async function getShift(req: Request, res: Response): Promise<void> {
  const s = await Shift.findById(String(req.params.id)).exec();
  if (!s) throw new NotFoundError('Shift not found');
  res.json({ success: true, data: s });
}

export async function updateShift(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateShiftSchema>;
  if (body.isDefault) {
    await Shift.updateMany({}, { $set: { isDefault: false } });
  }
  const s = await Shift.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
  if (!s) throw new NotFoundError('Shift not found');
  void audit({ action: 'update', entity: 'Shift', entityId: String(s._id), after: body });
  res.json({ success: true, data: s });
}

export async function deleteShift(req: Request, res: Response): Promise<void> {
  const s = await Shift.findById(String(req.params.id)).exec();
  if (!s) throw new NotFoundError('Shift not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (s as any).softDelete();
  void audit({ action: 'delete', entity: 'Shift', entityId: String(s._id) });
  res.json({ success: true, message: 'Shift deleted' });
}

export async function assignShift(req: Request, res: Response): Promise<void> {
  const { employeeIds } = req.body as z.infer<typeof assignShiftSchema>;
  const shift = await Shift.findById(String(req.params.id)).exec();
  if (!shift) throw new NotFoundError('Shift not found');
  const result = await Employee.updateMany(
    { _id: { $in: employeeIds } },
    { $set: { shift: shift._id } },
  );
  res.json({ success: true, data: { matched: result.matchedCount, modified: result.modifiedCount } });
}

// ───────────────────────────────────────────────────────────────────
// Roster endpoints — materialise per-day shift assignments for a date
// range. The current model stores a single `shift` per employee (not a
// per-day calendar), so we generate the roster by walking the date range
// and applying the assigned shift on its `workDays`. Days that fall
// outside `workDays` come back as `status: 'off'`.
//
// When the data model grows to support published rosters / overrides,
// this controller can opt to read from a ShiftAssignment collection
// instead, while keeping the same response shape.
// ───────────────────────────────────────────────────────────────────

export const rosterQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  departmentId: z.string().optional(),
});

interface RosterAssignmentResponse {
  _id: string;
  date: string;
  shift: IShift | null;
  employee: {
    _id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  status: 'planned' | 'confirmed' | 'swapped' | 'off';
  note?: string;
}

/** Inclusive iteration: from..to, returning a Date per day. */
function* eachDay(from: string, to: string): Generator<Date> {
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T00:00:00.000Z');
  const cur = new Date(start);
  while (cur <= end) {
    yield new Date(cur);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

async function buildRoster(
  employees: Array<{
    _id: unknown;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shift?: any;
  }>,
  from: string,
  to: string,
): Promise<RosterAssignmentResponse[]> {
  // Pre-fetch attendance for the range so a "completed" day surfaces as
  // `confirmed`. One round-trip; the screen only needs status colour.
  const empIds = employees.map((e) => e._id);
  const attendanceRows = await Attendance.find({
    employeeId: { $in: empIds },
    date: {
      $gte: new Date(from + 'T00:00:00.000Z'),
      $lte: new Date(to + 'T23:59:59.999Z'),
    },
  })
    .select('employeeId date status')
    .lean()
    .exec();

  const attMap = new Map<string, 'present' | 'late' | 'absent' | 'on_leave' | 'half_day' | 'holiday' | 'weekend' | undefined>();
  for (const a of attendanceRows) {
    const k = `${String(a.employeeId)}|${a.date.toISOString().slice(0, 10)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    attMap.set(k, (a as any).status);
  }

  const out: RosterAssignmentResponse[] = [];

  for (const emp of employees) {
    // `shift` may be unpopulated id, populated doc, or undefined.
    const shift = emp.shift && typeof emp.shift === 'object' && 'startTime' in emp.shift
      ? (emp.shift as IShift)
      : null;
    // Fallback: pretend Mon–Fri 09:00–18:00 if no shift assigned, so the
    // mobile screen still has something rather than every day "off".
    const workDays = shift?.workDays ?? [1, 2, 3, 4, 5];

    for (const date of eachDay(from, to)) {
      const dow = date.getUTCDay();
      const isWorkDay = workDays.includes(dow);
      const dateKey = date.toISOString().slice(0, 10);
      const att = attMap.get(`${String(emp._id)}|${dateKey}`);

      let status: RosterAssignmentResponse['status'] = 'planned';
      if (!isWorkDay || att === 'weekend' || att === 'holiday') status = 'off';
      else if (att === 'on_leave') status = 'off';
      else if (att === 'present' || att === 'late' || att === 'half_day') status = 'confirmed';

      out.push({
        // Synthetic id — UI only needs uniqueness for keys, no FK.
        _id: `${String(emp._id)}-${dateKey}`,
        date: date.toISOString(),
        shift: shift,
        employee: {
          _id: String(emp._id),
          firstName: emp.firstName,
          lastName: emp.lastName,
          avatar: emp.avatar,
        },
        status,
      });
    }
  }
  return out;
}

/** GET /api/v1/shifts/my-roster?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function myRoster(req: Request, res: Response): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new ForbiddenError('Not authenticated');
  const q = req.query as unknown as z.infer<typeof rosterQuerySchema>;

  const me = await Employee.findOne({ userId })
    .select('firstName lastName avatar shift')
    .populate('shift')
    .lean()
    .exec();
  if (!me) {
    // No linked employee record — return empty so the UI shows its
    // EmptyState ("No shifts in this range") rather than 500.
    res.json({ success: true, data: [] });
    return;
  }

  const data = await buildRoster([me], q.from, q.to);
  res.json({ success: true, data });
}

/** GET /api/v1/shifts/team-roster?from=…&to=…&departmentId=… */
export async function teamRoster(req: Request, res: Response): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new ForbiddenError('Not authenticated');
  const q = req.query as unknown as z.infer<typeof rosterQuerySchema>;

  const me = await Employee.findOne({ userId }).select('_id').lean().exec();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = me ? { reportingManager: me._id } : { status: 'active' };
  if (q.departmentId) filter.department = q.departmentId;

  const employees = await Employee
    .find(filter)
    .select('firstName lastName avatar shift')
    .populate('shift')
    .lean()
    .exec();

  const data = await buildRoster(employees, q.from, q.to);
  res.json({ success: true, data });
}

export const swapRequestSchema = z.object({
  assignmentId: z.string().min(1),
  requestedWith: z.string().min(1),
  reason: z.string().min(3),
});

/**
 * POST /api/v1/shifts/swap-request
 *
 * Stub: persists the request as an audit entry until a dedicated
 * ShiftSwap model lands. The mobile UI still gets a 200 + toast.
 */
export async function requestSwap(req: Request, res: Response): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new ForbiddenError('Not authenticated');
  const body = req.body as z.infer<typeof swapRequestSchema>;
  void audit({
    action: 'create',
    entity: 'ShiftSwapRequest',
    entityId: body.assignmentId,
    metadata: { requestedWith: body.requestedWith, reason: body.reason },
  });
  res.status(202).json({
    success: true,
    message: 'Swap request received',
    data: { status: 'pending' },
  });
}
