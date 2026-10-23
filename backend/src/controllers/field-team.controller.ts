/**
 * The team map's data: each person's status on an IST day and their day
 * route. Tracking is only at check-in/check-out points (attendance day in/out
 * and visit in/out), so "where" is the last such point.
 *
 * Scope (lib/field-scope.ts): `field.view` — the caller and their direct
 * reports; `field.manage` — every field employee (HR's "field staff" flag, or
 * a login whose role or own permissions give `field.view` without
 * `field.manage`), plus anyone who checked in at a site that day.
 */
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Employee } from '../models/employee.model.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { Visit } from '../models/visit.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { FIELD_MANAGE, FIELD_VIEW, fieldScope, scopeIncludes, type FieldScope } from '../lib/field-scope.js';
import {
  dateKeySchema,
  dayKey,
  dayPointsOf,
  dayRoute,
  fieldDay,
  loadFieldDays,
  measureDays,
  publicPoint,
  publicRoute,
  type DayRoute,
  type FieldDay,
  type FieldDayData,
} from '../services/field-route.service.js';

export const dayQuerySchema = z.object({ date: dateKeySchema.optional() });

/** Employee statuses that still work here. */
const WORKING = ['active', 'onNotice'];

export type TeamStatus = 'at_site' | 'between_sites' | 'day_ended' | 'not_started';

export interface EmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
}

export function employeeRef(e: { _id: unknown; firstName?: string; lastName?: string; employeeId?: string }): EmployeeRef {
  return {
    _id: String(e._id),
    firstName: e.firstName ?? '',
    lastName: e.lastName ?? '',
    employeeId: e.employeeId ?? '',
  };
}

export const fullName = (e: { firstName?: string; lastName?: string } | null | undefined): string =>
  `${e?.firstName ?? ''} ${e?.lastName ?? ''}`.trim();

/** 403 `NOT_YOUR_REPORT` unless `employeeId` is in the caller's scope. */
export function assertInScope(scope: FieldScope, employeeId: string): void {
  if (scopeIncludes(scope, employeeId)) return;
  throw new AppError("You can only see your own and your direct reports' field data", 403, 'NOT_YOUR_REPORT');
}

/** A 24-hex Employee id from the path, or 400. */
export function employeeIdParam(value: unknown): string {
  const id = String(value ?? '');
  if (!/^[a-f\d]{24}$/i.test(id)) throw new ValidationAppError('Invalid employee id');
  return id.toLowerCase();
}

/** Logins that work in the field: `field.view` from their role or own permissions, without `field.manage`. */
async function fieldUserIds(): Promise<Types.ObjectId[]> {
  const [fieldRoles, manageRoles] = await Promise.all([
    Role.find({ permissions: FIELD_VIEW }).select('_id permissions').lean().exec(),
    Role.find({ permissions: { $in: [FIELD_MANAGE, '*'] } }).select('_id').lean().exec(),
  ]);
  const viewRoleIds = fieldRoles.filter((r) => !r.permissions.includes(FIELD_MANAGE) && !r.permissions.includes('*')).map((r) => r._id);
  const manageRoleIds = manageRoles.map((r) => r._id);
  const users = await User.find({
    $or: [{ role: { $in: viewRoleIds } }, { customPermissions: FIELD_VIEW }],
    role: { $nin: manageRoleIds },
    customPermissions: { $ne: FIELD_MANAGE },
  })
    .select('_id')
    .lean()
    .exec();
  return users.map((u) => u._id as Types.ObjectId);
}

/** Who the team map lists for `scope` on `day`, by name. */
async function teamMembers(scope: FieldScope, day: FieldDay): Promise<EmployeeRef[]> {
  const visitedFilter: Record<string, unknown> = {
    'checkIn.time': { $gte: day.from, $lt: day.to },
    status: { $ne: 'cancelled' },
  };
  if (scope.employeeIds !== 'all') visitedFilter.employeeId = { $in: scope.employeeIds };
  const visited = (await Visit.distinct('employeeId', visitedFilter).exec()) as Types.ObjectId[];

  const working =
    scope.employeeIds === 'all'
      ? { status: { $in: WORKING }, $or: [{ isFieldStaff: true }, { userId: { $in: await fieldUserIds() } }] }
      : { status: { $in: WORKING }, _id: { $in: scope.employeeIds } };
  const employees = await Employee.find({ $or: [working, { _id: { $in: visited } }] })
    .select('firstName lastName employeeId')
    .lean()
    .exec();
  return employees
    .map(employeeRef)
    .sort((a, b) => fullName(a).localeCompare(fullName(b)) || a._id.localeCompare(b._id));
}

function statusRow(employee: EmployeeRef, day: FieldDayData | undefined, route: DayRoute | undefined) {
  const visits = day?.visits ?? [];
  const open = [...visits].reverse().find((v) => v.status === 'in_progress' && !v.checkOut?.time);
  const attendance = day?.attendance;
  let status: TeamStatus = 'not_started';
  if (open) status = 'at_site';
  else if (attendance?.checkOut?.time) status = 'day_ended';
  else if (attendance?.checkIn?.time || visits.length > 0) status = 'between_sites';

  const points = route?.points ?? dayPointsOf(day);
  const last = points[points.length - 1];
  return {
    employee,
    status,
    currentVisit: open
      ? {
          _id: String(open._id),
          site: { _id: open.siteId ? String(open.siteId._id) : '', name: open.siteId?.name ?? 'Unknown site' },
          since: open.checkIn!.time,
        }
      : null,
    lastPoint: last ? publicPoint(last) : null,
    visitsToday: visits.length,
    kmToday: route?.totalKm ?? 0,
  };
}

/**
 * `GET /field/team/status?date=YYYY-MM-DD` (default today) — one row per
 * person in scope: `{ employee, status, currentVisit, lastPoint, visitsToday,
 * kmToday }` (`currentVisit` / `lastPoint` null when there is none).
 */
export async function teamStatus(req: Request, res: Response): Promise<void> {
  const scope = await fieldScope(req);
  const day = fieldDay((req.query as z.infer<typeof dayQuerySchema>).date);
  const members = await teamMembers(scope, day);
  const days = await loadFieldDays({
    employeeIds: members.map((m) => new Types.ObjectId(m._id)),
    from: day.date,
    to: day.date,
  });
  const byEmployee = new Map(days.map((d) => [d.employeeId, d]));
  const routes = await measureDays(
    members.map((m) => ({ employeeId: m._id, date: day.date, points: dayPointsOf(byEmployee.get(m._id)) })),
  );
  const rows = members.map((m) => statusRow(m, byEmployee.get(m._id), routes.get(dayKey(m._id, day.date))));
  res.json({ success: true, data: rows });
}

/**
 * `GET /field/route/:employeeId?date=YYYY-MM-DD` (default today) — `{ date,
 * points: [{ lat, lng, at, kind, siteName? }], legs: [{ fromIndex, toIndex,
 * distanceM, estimated }], totalKm, estimated }`. 403 outside the caller's
 * scope, 404 for an unknown employee.
 */
export async function employeeRoute(req: Request, res: Response): Promise<void> {
  const employeeId = employeeIdParam(req.params.employeeId);
  const scope = await fieldScope(req);
  assertInScope(scope, employeeId);
  if (!(await Employee.exists({ _id: employeeId }).exec())) throw new NotFoundError('Employee not found');
  const day = fieldDay((req.query as z.infer<typeof dayQuerySchema>).date);
  const { route } = await dayRoute(employeeId, day.date);
  res.json({ success: true, data: publicRoute(route) });
}
