/**
 * Dynamic dashboard data aggregation service.
 *
 * Returns summary metrics only for the modules the tenant has enabled,
 * so the frontend can render a contextual overview.
 */
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { PayrollCycle } from '../models/payroll-cycle.model.js';
import { Project } from '../models/project.model.js';
import { Task } from '../models/task.model.js';
import { Visit } from '../models/visit.model.js';
import { logger } from '../config/logger.js';
import {
  businessDayLabels,
  DAY_MS,
  endOfBusinessDay,
  localDateOf,
  startOfBusinessDay,
} from '../lib/business-day.js';
import { classifyDay, listHolidaysBetween } from '../lib/day-classifier.js';
import { DEFAULT_WORK_DAYS } from '../lib/week-off.js';
import { getWeekOffRule } from './week-off.service.js';
import { fieldDay } from './field-route.service.js';

/* ─────────────── Types ─────────────── */

export interface DashboardData {
  employees?: { total: number; active: number; newThisMonth: number };
  attendance?: {
    presentToday: number;
    /** `absent` rows for today's business day (day-close and unpaid leave write them). */
    absentToday: number;
    lateToday: number;
    /** `attendanceRateBetween` for the business week so far (Monday on), as a whole percentage. */
    averageThisWeek: number;
    /** `attendanceRateBetween` for the month so far, as a fraction 0–1 (4 decimals). */
    monthToDateRate: number;
  };
  leaves?: { pendingRequests: number; onLeaveToday: number };
  payroll?: { lastProcessedMonth: string; totalPayroll: number };
  projects?: { active: number; overdue: number; completedThisMonth: number };
  tasks?: { myPending: number; myOverdue: number; completedThisWeek: number };
  field?: { activeAgents: number; visitsToday: number };
}

/* ─────────────── Helpers ─────────────── */

/**
 * Today's field figures (IST day): visits checked in (cancelled ones aside)
 * and how many people made them. Locations are only recorded at check-in /
 * check-out now, so "active in the field" means "checked in at a site today".
 */
export async function fieldTodayFigures(): Promise<{ activeAgents: number; visitsToday: number }> {
  const { from, to } = fieldDay();
  const checkedInToday = { 'checkIn.time': { $gte: from, $lt: to }, status: { $ne: 'cancelled' } };
  const [people, visitsToday] = await Promise.all([
    Visit.distinct('employeeId', checkedInToday).exec(),
    Visit.countDocuments(checkedInToday).exec(),
  ]);
  return { activeAgents: people.length, visitsToday };
}

/** Business-timezone day bounds — the attendance controller uses the same
 *  helpers, so "present today" here means the same day it does there. */
function startOfDay(d: Date = new Date()): Date {
  return startOfBusinessDay(d);
}

function endOfDay(d: Date = new Date()): Date {
  return endOfBusinessDay(d);
}

function startOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d: Date = new Date()): Date {
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1; // Monday-based week
  const s = new Date(d);
  s.setDate(s.getDate() - diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** Statuses that count as attended; `on_leave` counts only when the leave is paid. */
const PRESENT_ISH = {
  $or: [{ status: { $in: ['present', 'late', 'half_day'] } }, { status: 'on_leave', isPaidLeave: true }],
};

/**
 * Attendance rate over the business days `from`..`to` (day labels,
 * inclusive): present-ish rows of active (and on-notice) employees on the
 * company's working days, over those employees × those working days. A working day is
 * `classifyDay`'s verdict with the default shift week (Mon–Sat), the
 * configured week-off rule and the company-wide public holidays. 0 when
 * there is nobody active or no working day yet.
 */
export async function attendanceRateBetween(from: Date, to: Date): Promise<number> {
  const labels = businessDayLabels(from, to);
  if (labels.length === 0) return 0;
  const [active, weekOffRule, holidays] = await Promise.all([
    // On notice still works (and is paid): their days count like anyone's.
    Employee.find({ status: { $in: ['active', 'onNotice'] } }).select('_id').lean().exec(),
    getWeekOffRule(),
    listHolidaysBetween(localDateOf(labels[0]!), localDateOf(labels[labels.length - 1]!)),
  ]);
  const working = new Set(
    labels
      .filter(
        (day) =>
          classifyDay(localDateOf(day), { workDays: DEFAULT_WORK_DAYS, weekOffRule, holidays, departmentId: null }) ===
          'working',
      )
      .map((day) => day.toISOString().slice(0, 10)),
  );
  if (active.length === 0 || working.size === 0) return 0;

  const perDay = await Attendance.aggregate<{ _id: string; count: number }>([
    {
      // Aggregations skip the soft-delete query hook: exclude deleted rows here.
      $match: {
        employeeId: { $in: active.map((e) => e._id) },
        date: { $gte: labels[0]!, $lt: new Date(labels[labels.length - 1]!.getTime() + DAY_MS) },
        isDeleted: { $ne: true },
        ...PRESENT_ISH,
      },
    },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, count: { $sum: 1 } } },
  ]).exec();
  const attended = perDay.reduce((sum, d) => (working.has(d._id) ? sum + d.count : sum), 0);
  return Math.round((attended / (active.length * working.size)) * 10_000) / 10_000;
}

/** `attendanceRateBetween` from the 1st of the business month through the business day of `now`. */
export async function monthToDateAttendanceRate(now: Date = new Date()): Promise<number> {
  const today = startOfBusinessDay(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return attendanceRateBetween(monthStart, today);
}

/** `attendanceRateBetween` from Monday of the business week through the business day of `now`. */
async function weekToDateAttendanceRate(now: Date = new Date()): Promise<number> {
  const today = startOfBusinessDay(now);
  const sinceMonday = (today.getUTCDay() + 6) % 7;
  return attendanceRateBetween(new Date(today.getTime() - sinceMonday * DAY_MS), today);
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/* ─────────────── Main ─────────────── */

/**
 * Returns aggregated dashboard data. Only modules present in `enabledModules`
 * are queried — this keeps the response fast and relevant.
 *
 * @param userId - The current user's id (needed for task widgets)
 */
export async function getDashboardData(
  enabledModules: string[],
  userId?: string,
): Promise<DashboardData> {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);

  const data: DashboardData = {};
  const tasks: Array<Promise<void>> = [];

  /* ── Employees ── */
  if (enabledModules.includes('employees')) {
    tasks.push(
      (async () => {
        try {
          const [total, active, newThisMonth] = await Promise.all([
            Employee.countDocuments({ isDeleted: { $ne: true } }),
            Employee.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
            Employee.countDocuments({
              isDeleted: { $ne: true },
              createdAt: { $gte: monthStart },
            }),
          ]);
          data.employees = { total, active, newThisMonth };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: employees query failed');
        }
      })(),
    );
  }

  /* ── Attendance ── */
  if (enabledModules.includes('attendance')) {
    tasks.push(
      (async () => {
        try {
          const [presentToday, absentToday, lateToday] = await Promise.all([
            // Late arrivals are still in the building — the attendance
            // dashboard counts them as present, so this tile must too or the
            // two "Present today" numbers disagree every time someone is late.
            Attendance.countDocuments({
              date: { $gte: todayStart, $lte: todayEnd },
              status: { $in: ['present', 'late'] },
            }),
            Attendance.countDocuments({
              date: { $gte: todayStart, $lte: todayEnd },
              status: 'absent',
            }),
            Attendance.countDocuments({
              date: { $gte: todayStart, $lte: todayEnd },
              status: 'late',
            }),
          ]);

          const [weekRate, monthToDateRate] = await Promise.all([
            weekToDateAttendanceRate(now),
            monthToDateAttendanceRate(now),
          ]);
          const averageThisWeek = Math.round(weekRate * 100);

          data.attendance = { presentToday, absentToday, lateToday, averageThisWeek, monthToDateRate };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: attendance query failed');
        }
      })(),
    );
  }

  /* ── Leaves ── */
  if (enabledModules.includes('leaves')) {
    tasks.push(
      (async () => {
        try {
          const [pendingRequests, onLeaveToday] = await Promise.all([
            LeaveRequest.countDocuments({ status: 'pending' }),
            LeaveRequest.countDocuments({
              status: 'approved',
              startDate: { $lte: todayEnd },
              endDate: { $gte: todayStart },
            }),
          ]);
          data.leaves = { pendingRequests, onLeaveToday };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: leaves query failed');
        }
      })(),
    );
  }

  /* ── Payroll ── */
  if (enabledModules.includes('payroll')) {
    tasks.push(
      (async () => {
        try {
          const lastCycle = await PayrollCycle.findOne(
            { status: { $in: ['processed', 'paid', 'locked'] } },
            { month: 1, year: 1, totalNet: 1 },
          )
            .sort({ year: -1, month: -1 })
            .lean();

          data.payroll = {
            lastProcessedMonth: lastCycle
              ? `${MONTH_NAMES[lastCycle.month]} ${lastCycle.year}`
              : 'N/A',
            totalPayroll: lastCycle?.totalNet ?? 0,
          };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: payroll query failed');
        }
      })(),
    );
  }

  /* ── Projects ── */
  if (enabledModules.includes('projects')) {
    tasks.push(
      (async () => {
        try {
          const [active, overdue, completedThisMonth] = await Promise.all([
            Project.countDocuments({
              status: 'in_progress',
              isDeleted: { $ne: true },
            }),
            Project.countDocuments({
              status: 'in_progress',
              endDate: { $lt: todayStart },
              isDeleted: { $ne: true },
            }),
            Project.countDocuments({
              status: 'completed',
              updatedAt: { $gte: monthStart },
              isDeleted: { $ne: true },
            }),
          ]);
          data.projects = { active, overdue, completedThisMonth };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: projects query failed');
        }
      })(),
    );
  }

  /* ── Tasks ── */
  if (enabledModules.includes('tasks') && userId) {
    tasks.push(
      (async () => {
        try {
          const [myPending, myOverdue, completedThisWeek] = await Promise.all([
            Task.countDocuments({
              assignee: userId,
              status: { $in: ['todo', 'in_progress', 'in_review'] },
              isDeleted: { $ne: true },
            }),
            Task.countDocuments({
              assignee: userId,
              status: { $in: ['todo', 'in_progress'] },
              dueDate: { $lt: todayStart },
              isDeleted: { $ne: true },
            }),
            Task.countDocuments({
              assignee: userId,
              status: 'done',
              updatedAt: { $gte: weekStart },
              isDeleted: { $ne: true },
            }),
          ]);
          data.tasks = { myPending, myOverdue, completedThisWeek };
        } catch (err) {
          logger.warn({ err }, 'Dashboard: tasks query failed');
        }
      })(),
    );
  }

  /* ── Field Visits ── */
  if (enabledModules.includes('field')) {
    tasks.push(
      (async () => {
        try {
          data.field = await fieldTodayFigures();
        } catch (err) {
          logger.warn({ err }, 'Dashboard: field query failed');
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);

  return data;
}
