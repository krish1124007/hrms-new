import type { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { FieldTask, type IFieldTask } from '../models/field-task.model.js';
import { Employee } from '../models/employee.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { createNotification, formatBusinessDate } from '../services/notification.service.js';
import { notifyTaskCompleted } from '../services/field-visits.service.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { logger } from '../config/logger.js';
import { idOf } from '../lib/access.js';
import {
  assertFieldRead,
  assertFieldWrite,
  canManageField,
  listScopeFilter,
  requireOwnEmployeeId,
} from '../lib/field-access.js';
import { fieldScope, scopeIncludes, type FieldScope } from '../lib/field-scope.js';
import { fieldFileRefs } from '../lib/field-files.js';
import { captureTimes } from '../lib/offline-capture.js';
import { objectIdString, pageParams, setAndUnset, sortParam } from '../lib/field-utils.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
const STATUSES = ['new', 'accepted', 'in_progress', 'completed', 'cancelled'] as const;
const CLOSED: readonly string[] = ['completed', 'cancelled'];

/** An upload key from POST /field/uploads/photo (or a signed link to one, turned back into its stored form). */
const photoRef = z.string().trim().min(1).max(2048);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  assignedTo: objectIdString,
  siteId: objectIdString.optional(),
  location: z
    .object({
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      address: z.string().trim().max(500).optional(),
    })
    .optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  status: z.enum(['new', 'accepted', 'in_progress']).default('new'),
  dueDate: z.coerce.date().optional(),
});

/** `null` clears an optional field: the description, site, location or due date (never the assignee). */
export const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  assignedTo: objectIdString.optional(),
  siteId: objectIdString.nullable().optional(),
  location: createTaskSchema.shape.location.unwrap().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(STATUSES).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

/**
 * Completion, offline-safe: `clientRef` (a replay answers 200 with the task)
 * and `capturedAt` (the device time, stored as `completedAt`). Photos as
 * upload keys in `photoKeys`; `completionPhotos` / `photo` / `notes` are older
 * names still accepted.
 */
export const completeSchema = z.object({
  clientRef: z.string().trim().uuid().optional(),
  capturedAt: z.string().trim().max(40).optional(),
  photoKeys: z.array(photoRef).max(20).optional(),
  completionPhotos: z.array(photoRef).max(20).optional(),
  completionNotes: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
  photo: photoRef.optional(),
});

export const listQuerySchema = z.object({
  ...pageParams,
  assignedTo: objectIdString.optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  sort: sortParam(['createdAt', 'dueDate', 'priority']).optional(),
});

export const myQuerySchema = z.object({ ...pageParams, status: z.enum(STATUSES).optional() });

const POPULATE = [
  { path: 'assignedTo', select: 'firstName lastName employeeId' },
  { path: 'siteId', select: 'name type address location radiusM' },
];

async function loadTask(id: string): Promise<IFieldTask> {
  const task = await FieldTask.findById(id).exec();
  if (!task) throw new NotFoundError('Task not found');
  return task;
}

/** The assignee's login, or 400 when `employeeId` is not an employee. */
async function assigneeUserId(employeeId: string): Promise<string | null> {
  const emp = Types.ObjectId.isValid(employeeId)
    ? await Employee.findById(employeeId).select('userId').lean().exec()
    : null;
  if (!emp) throw new ValidationAppError('assignedTo does not name an employee');
  return emp.userId ? String(emp.userId) : null;
}

/** Tell the assignee about a task given to them. Never fails the request. */
async function notifyAssignee(userId: string | null, task: IFieldTask): Promise<void> {
  if (!userId) return;
  try {
    await createNotification({
      userId,
      type: 'task_assigned',
      title: 'New field task',
      message: task.dueDate
        ? `"${task.title}" has been assigned to you (due ${formatBusinessDate(task.dueDate)}).`
        : `"${task.title}" has been assigned to you.`,
      link: `/field/tasks/${String(task._id)}`,
      metadata: { module: 'field', taskId: String(task._id) },
    });
  } catch (err) {
    logger.warn({ err, taskId: String(task._id) }, 'field task notification failed');
  }
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = await listScopeFilter(req, q.assignedTo, 'assignedTo');
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  const result = await FieldTask.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: POPULATE,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myTasks(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof myQuerySchema>;
  const filter: Record<string, unknown> = { assignedTo: await requireOwnEmployeeId(req) };
  if (q.status) filter.status = q.status;
  const result = await FieldTask.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: { dueDate: 1, createdAt: -1 },
    populate: [{ path: 'siteId', select: 'name type address location radiusM' }],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

/** The tasks of the reps the caller can see (field managers: everyone), paginated. */
export async function teamTasks(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof myQuerySchema>;
  const filter: Record<string, unknown> = await listScopeFilter(req, undefined, 'assignedTo');
  // A rep's "team" is the people who report to them, not themselves.
  if (!canManageField(req)) {
    const self = await requireOwnEmployeeId(req);
    const ids = ((filter.assignedTo as { $in: Types.ObjectId[] }).$in ?? []).filter((id) => !id.equals(self));
    filter.assignedTo = { $in: ids };
  }
  if (q.status) filter.status = q.status;
  const result = await FieldTask.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-createdAt',
    populate: POPULATE,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getTask(req: Request, res: Response): Promise<void> {
  const doc = await FieldTask.findById(String(req.params.id)).populate(POPULATE).exec();
  if (!doc) throw new NotFoundError('Task not found');
  await assertFieldRead(req, doc.assignedTo);
  res.json({ success: true, data: doc });
}

/**
 * May the caller manage `task` (edit everything, reassign, cancel, delete)?
 * A field manager; whoever created it; or the assignee's direct manager.
 */
function managesTask(req: Request, scope: FieldScope, task: Pick<IFieldTask, 'assignedTo' | 'createdBy'>): boolean {
  if (scope.manage) return true;
  if (task.createdBy && req.user?._id && idOf(task.createdBy) === String(req.user._id)) return true;
  return scopeIncludes(scope, task.assignedTo) && idOf(task.assignedTo) !== (scope.self ? String(scope.self) : null);
}

/** 403 unless the caller may give a task to `employeeId` (self, a direct report, or anyone with field.manage). */
function assertMayAssign(scope: FieldScope, employeeId: string): void {
  if (!scopeIncludes(scope, employeeId)) {
    throw new AppError('You can assign tasks only to yourself and your direct reports', 403, 'FORBIDDEN');
  }
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createTaskSchema>;
  const userId = await assigneeUserId(body.assignedTo);
  assertMayAssign(await fieldScope(req), body.assignedTo);
  const doc = await FieldTask.create({ ...body, ...(req.user?._id ? { createdBy: req.user._id } : {}) });
  void audit({ action: 'create', entity: 'FieldTask', entityId: String(doc._id) });
  await notifyAssignee(userId, doc);
  res.status(201).json({ success: true, data: doc });
}

/** Managers edit anything (reassigning notifies the new assignee); the assignee only moves the status along. */
export async function updateTask(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateTaskSchema>;
  const task = await loadTask(String(req.params.id));
  const scope = await fieldScope(req);
  const manager = managesTask(req, scope, task);
  if (!manager) await assertFieldWrite(req, task.assignedTo);

  const set: Record<string, unknown> = manager ? { ...body } : {};
  if (!manager && body.status) set.status = body.status;
  if (set.status && set.status !== task.status) {
    if (CLOSED.includes(task.status)) throw new AppError(`The task is already ${task.status}`, 409, 'TASK_CLOSED');
    if (set.status === 'cancelled' && !manager) {
      throw new AppError('Only a field manager can cancel a task', 403, 'FORBIDDEN');
    }
    if (set.status === 'completed') set.completedAt = new Date();
  }

  const reassigned = manager && body.assignedTo && body.assignedTo !== String(task.assignedTo);
  if (reassigned) assertMayAssign(scope, body.assignedTo as string);
  const newAssigneeUser = reassigned ? await assigneeUserId(body.assignedTo as string) : null;

  const doc = await FieldTask.findByIdAndUpdate(task._id, setAndUnset(set), { new: true }).exec();
  if (!doc) throw new NotFoundError('Task not found');
  if (reassigned) await notifyAssignee(newAssigneeUser, doc);
  res.json({ success: true, data: doc });
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  const doc = await loadTask(String(req.params.id));
  if (!managesTask(req, await fieldScope(req), doc)) {
    throw new AppError('Only a field manager, the task’s creator or the assignee’s manager can delete it', 403, 'FORBIDDEN');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete({ by: req.user?._id });
  void audit({ action: 'delete', entity: 'FieldTask', entityId: String(doc._id) });
  res.json({ success: true, message: 'Task deleted' });
}

export async function acceptTask(req: Request, res: Response): Promise<void> {
  const task = await loadTask(String(req.params.id));
  await assertFieldWrite(req, task.assignedTo);
  const doc = await FieldTask.findOneAndUpdate(
    { _id: task._id, status: { $in: ['new', 'accepted'] } },
    { $set: { status: 'accepted' } },
    { new: true },
  ).exec();
  if (!doc) throw new AppError(`A task that is ${task.status} cannot be accepted`, 409, 'TASK_CLOSED');
  res.json({ success: true, data: doc });
}

/**
 * PATCH /field/tasks/:id/complete — the assignee (or a field manager) closes
 * the task with notes and proof photos. Idempotent by `clientRef`. The
 * assignee's manager and the task's creator are told.
 */
export async function completeTask(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof completeSchema>;
  const task = await loadTask(String(req.params.id));
  await assertFieldWrite(req, task.assignedTo);
  const populated = () => FieldTask.findById(task._id).populate(POPULATE).exec();
  if (body.clientRef && task.completionClientRef === body.clientRef) {
    res.json({ success: true, data: await populated() }); // replay
    return;
  }
  if (CLOSED.includes(task.status)) throw new AppError(`The task is already ${task.status}`, 409, 'TASK_CLOSED');

  const times = captureTimes(body.capturedAt, await getFieldSettings());
  const keys = [...(body.photoKeys ?? []), ...(body.completionPhotos ?? []), ...(body.photo ? [body.photo] : [])];
  const photos = [...new Set(await fieldFileRefs(keys, 'photo'))];
  const doc = await FieldTask.findOneAndUpdate(
    { _id: task._id, status: { $nin: CLOSED } },
    {
      $set: {
        status: 'completed',
        completedAt: times.capturedAt,
        completionReceivedAt: times.receivedAt,
        completionPhotos: photos,
        completionNotes: body.completionNotes ?? body.notes,
        ...(body.clientRef ? { completionClientRef: body.clientRef } : {}),
      },
    },
    { new: true },
  ).exec();
  if (!doc) {
    const now = await FieldTask.findById(task._id).select('completionClientRef status').lean().exec();
    if (body.clientRef && now?.completionClientRef === body.clientRef) {
      res.json({ success: true, data: await populated() });
      return;
    }
    throw new AppError(`The task is already ${now?.status ?? task.status}`, 409, 'TASK_CLOSED');
  }
  void audit({ action: 'update', entity: 'FieldTask', entityId: String(doc._id), after: { status: 'completed' } });
  await notifyTaskCompleted(doc, req.user?._id ? String(req.user._id) : null);
  res.json({ success: true, data: await populated() });
}
