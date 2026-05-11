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
import { ProductOrder } from '../models/product-order.model.js';
import { LocationTrack } from '../models/location-track.model.js';
import { logger } from '../config/logger.js';
/* ─────────────── Helpers ─────────────── */
function startOfDay(d = new Date()) {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return s;
}
function endOfDay(d = new Date()) {
    const e = new Date(d);
    e.setHours(23, 59, 59, 999);
    return e;
}
function startOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfWeek(d = new Date()) {
    const day = d.getDay(); // 0 = Sunday
    const diff = day === 0 ? 6 : day - 1; // Monday-based week
    const s = new Date(d);
    s.setDate(s.getDate() - diff);
    s.setHours(0, 0, 0, 0);
    return s;
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
export async function getDashboardData(enabledModules, userId) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const monthStart = startOfMonth(now);
    const weekStart = startOfWeek(now);
    const data = {};
    const tasks = [];
    /* ── Employees ── */
    if (enabledModules.includes('employees')) {
        tasks.push((async () => {
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
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: employees query failed');
            }
        })());
    }
    /* ── Attendance ── */
    if (enabledModules.includes('attendance')) {
        tasks.push((async () => {
            try {
                const [presentToday, absentToday, lateToday] = await Promise.all([
                    Attendance.countDocuments({
                        date: { $gte: todayStart, $lte: todayEnd },
                        status: 'present',
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
                // Weekly average: present records / working days elapsed this week
                const weekRecords = await Attendance.countDocuments({
                    date: { $gte: weekStart, $lte: todayEnd },
                    status: { $in: ['present', 'late'] },
                });
                const daysElapsed = Math.max(1, Math.ceil((now.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24)));
                const activeEmployees = await Employee.countDocuments({
                    status: 'active',
                    isDeleted: { $ne: true },
                });
                const averageThisWeek = activeEmployees > 0
                    ? Math.round((weekRecords / (daysElapsed * activeEmployees)) * 100)
                    : 0;
                data.attendance = { presentToday, absentToday, lateToday, averageThisWeek };
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: attendance query failed');
            }
        })());
    }
    /* ── Leaves ── */
    if (enabledModules.includes('leaves')) {
        tasks.push((async () => {
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
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: leaves query failed');
            }
        })());
    }
    /* ── Payroll ── */
    if (enabledModules.includes('payroll')) {
        tasks.push((async () => {
            try {
                const lastCycle = await PayrollCycle.findOne({ status: { $in: ['processed', 'paid', 'locked'] } }, { month: 1, year: 1, totalNet: 1 })
                    .sort({ year: -1, month: -1 })
                    .lean();
                data.payroll = {
                    lastProcessedMonth: lastCycle
                        ? `${MONTH_NAMES[lastCycle.month]} ${lastCycle.year}`
                        : 'N/A',
                    totalPayroll: lastCycle?.totalNet ?? 0,
                };
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: payroll query failed');
            }
        })());
    }
    /* ── Projects ── */
    if (enabledModules.includes('projects')) {
        tasks.push((async () => {
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
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: projects query failed');
            }
        })());
    }
    /* ── Tasks ── */
    if (enabledModules.includes('tasks') && userId) {
        tasks.push((async () => {
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
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: tasks query failed');
            }
        })());
    }
    /* ── Field Sales ── */
    if (enabledModules.includes('fieldSales')) {
        tasks.push((async () => {
            try {
                const [activeAgents, visitsToday, ordersToday] = await Promise.all([
                    // Agents that have sent a location ping today
                    LocationTrack.distinct('employeeId', {
                        timestamp: { $gte: todayStart, $lte: todayEnd },
                    }).then((ids) => ids.length),
                    Visit.countDocuments({
                        createdAt: { $gte: todayStart, $lte: todayEnd },
                        status: { $ne: 'cancelled' },
                    }),
                    ProductOrder.countDocuments({
                        createdAt: { $gte: todayStart, $lte: todayEnd },
                        status: { $ne: 'cancelled' },
                    }),
                ]);
                data.fieldSales = { activeAgents, visitsToday, ordersToday };
            }
            catch (err) {
                logger.warn({ err }, 'Dashboard: fieldSales query failed');
            }
        })());
    }
    await Promise.allSettled(tasks);
    return data;
}
//# sourceMappingURL=dashboard.service.js.map