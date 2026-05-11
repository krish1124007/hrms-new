import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { AuditLog } from '../models/audit-log.model.js';
import { Department } from '../models/department.model.js';
import { Visit } from '../models/visit.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { SalesTarget } from '../models/sales-target.model.js';
import { Task } from '../models/task.model.js';
import { LocationTrack } from '../models/location-track.model.js';
import { getDashboardData } from '../services/dashboard.service.js';
import { UnauthorizedError } from '../lib/errors.js';
/**
 * Tenant-facing dashboard aggregates.
 *
 *   GET /api/v1/dashboard/overview           → per-module summary cards
 *   GET /api/v1/dashboard/attendance-trend   → 7-day series for the chart
 *   GET /api/v1/dashboard/upcoming           → birthdays + leaves next 7d
 *   GET /api/v1/dashboard/recent-activity    → last N audit entries
 *
 * Each endpoint is < 200 ms even on a large tenant because we use
 * countDocuments + aggregate pipelines hitting indexed fields only
 * (tenantId + createdAt + status). No full-collection scans.
 */
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
/* ─────────── Overview (per-module cards) ─────────── */
export async function overview(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const modules = [
        'employees', 'attendance', 'leaves', 'payroll',
        'crm', 'projects', 'tasks', 'fieldSales',
    ];
    const data = await getDashboardData(modules, String(req.user._id));
    res.json({ success: true, data });
}
export async function attendanceTrend(_req, res) {
    const days = 7;
    const from = startOfDay(new Date(Date.now() - (days - 1) * 24 * 3600 * 1000));
    const to = endOfDay();
    // Group attendance rows by date + status via one aggregation pipeline
    const attendanceByDay = await Attendance.aggregate([
        {
            $match: {
                date: { $gte: from, $lte: to },
            },
        },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                    status: '$status',
                },
                count: { $sum: 1 },
            },
        },
    ]).exec();
    // Leave rows overlap attendance — show them separately so the chart
    // can stack legitimately-absent ("leave") alongside unexplained absences.
    const leavesByDay = await LeaveRequest.aggregate([
        {
            $match: {
                status: 'approved',
                startDate: { $lte: to },
                endDate: { $gte: from },
            },
        },
        // Expand each leave into its day range intersected with our window.
        // Cheaper client-side math than $unwind over a generated array.
        {
            $project: {
                startDate: 1,
                endDate: 1,
            },
        },
    ]).exec();
    // Build the 7-slot output array, zero-filled
    const buckets = new Map();
    for (let i = 0; i < days; i += 1) {
        const d = new Date(from);
        d.setDate(from.getDate() + i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { date: key, present: 0, absent: 0, late: 0, leave: 0 });
    }
    for (const row of attendanceByDay) {
        const bucket = buckets.get(row._id.date);
        if (!bucket)
            continue;
        if (row._id.status === 'present')
            bucket.present = row.count;
        else if (row._id.status === 'absent')
            bucket.absent = row.count;
        else if (row._id.status === 'late' || row._id.status === 'half-day')
            bucket.late += row.count;
    }
    for (const l of leavesByDay) {
        const s = new Date(l.startDate);
        const e = new Date(l.endDate);
        for (let d = new Date(Math.max(s.getTime(), from.getTime())); d <= e && d <= to;) {
            const key = d.toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (bucket)
                bucket.leave += 1;
            d.setDate(d.getDate() + 1);
        }
    }
    res.json({
        success: true,
        data: [...buckets.values()],
    });
}
/* ─────────── Upcoming: birthdays + leaves ───────────
 *
 * Returns ALL active employees' birthdays sorted by the next-occurrence date
 * starting today (so January birthdays appear after December when we're in
 * November, etc.), and ALL approved leaves whose end date is today or later
 * (currently-on-leave + upcoming, sorted by start date).
 *
 * Same payload for every role — both admin and employee dashboards consume it.
 */
export async function upcoming(_req, res) {
    const now = new Date();
    const todayMonth = now.getMonth() + 1;
    const todayDay = now.getDate();
    const employees = await Employee.find({
        status: 'active',
        dateOfBirth: { $exists: true, $ne: null },
    })
        .select('firstName lastName dateOfBirth profileImage employeeId')
        .lean()
        .exec();
    // Compute days-until-next-birthday on the server so the frontend doesn't
    // have to. Cap the list at 100 — covers most company sizes; if a client
    // hits the cap we'd want a paginated /employees/birthdays page anyway.
    const birthdays = employees
        .filter((e) => e.dateOfBirth)
        .map((e) => {
        const dob = new Date(e.dateOfBirth);
        const m = dob.getMonth() + 1;
        const d = dob.getDate();
        // Next-occurrence sort key: months*100 + day with a wrap-around offset
        // so months that already passed this year sort AFTER the current month.
        const passed = m < todayMonth || (m === todayMonth && d < todayDay);
        const sortKey = (passed ? 1200 : 0) + m * 100 + d;
        return {
            _id: String(e._id),
            firstName: e.firstName,
            lastName: e.lastName,
            employeeId: e.employeeId,
            avatar: e.profileImage,
            // Frontend expects `dob` for legacy reasons — alias here.
            dob: e.dateOfBirth,
            sortKey,
        };
    })
        .sort((a, b) => a.sortKey - b.sortKey)
        .slice(0, 100)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ sortKey: _s, ...rest }) => rest);
    const todayStart = startOfDay(now);
    const leavesRaw = await LeaveRequest.find({
        status: 'approved',
        endDate: { $gte: todayStart },
    })
        .populate('employeeId', 'firstName lastName profileImage employeeId')
        .populate('leaveTypeId', 'name')
        .sort({ startDate: 1 })
        .limit(100)
        .lean()
        .exec();
    // Reshape so the populated employee lives at `.employee` (frontend's key)
    // rather than the raw mongoose-populated `.employeeId` field.
    const leaves = leavesRaw.map((l) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp = l.employeeId;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lt = l.leaveTypeId;
        return {
            _id: String(l._id),
            employee: emp && typeof emp === 'object'
                ? {
                    _id: String(emp._id),
                    firstName: emp.firstName,
                    lastName: emp.lastName,
                    employeeId: emp.employeeId,
                    avatar: emp.profileImage,
                }
                : undefined,
            startDate: l.startDate,
            endDate: l.endDate,
            leaveType: lt && typeof lt === 'object' ? lt.name : undefined,
        };
    });
    res.json({ success: true, data: { birthdays, leaves } });
}
/* ─────────── Recent activity (from audit log) ─────────── */
export async function recentActivity(_req, res) {
    const activities = await AuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(15)
        .populate('userId', 'firstName lastName avatar')
        .lean()
        .exec();
    res.json({ success: true, data: activities });
}
/* ─────────── Analytics overview (deep insights) ─────────── */
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export async function analytics(_req, res) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    /* ── KPIs ── */
    const [activeEmployees, prevActiveEmployees, presentThisMonth, workingDaysThisMonth, paidThisMonth, paidPrevMonth, completedTasksThisMonth, totalTasksThisMonth,] = await Promise.all([
        Employee.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
        Employee.countDocuments({
            status: 'active',
            isDeleted: { $ne: true },
            createdAt: { $lt: monthStart },
        }),
        Attendance.countDocuments({
            date: { $gte: monthStart, $lte: todayEnd },
            status: { $in: ['present', 'late', 'half_day'] },
        }),
        Attendance.countDocuments({ date: { $gte: monthStart, $lte: todayEnd } }),
        PaymentCollection.aggregate([
            { $match: { status: 'collected', collectedAt: { $gte: monthStart, $lte: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        PaymentCollection.aggregate([
            { $match: { status: 'collected', collectedAt: { $gte: prevMonthStart, $lte: prevMonthEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        Task.countDocuments({
            status: 'done',
            updatedAt: { $gte: monthStart },
            isDeleted: { $ne: true },
        }),
        Task.countDocuments({
            createdAt: { $gte: monthStart },
            isDeleted: { $ne: true },
        }),
    ]);
    const totalRevenue = paidThisMonth[0]?.total ?? 0;
    const prevRevenue = paidPrevMonth[0]?.total ?? 0;
    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const employeeChange = prevActiveEmployees > 0
        ? ((activeEmployees - prevActiveEmployees) / prevActiveEmployees) * 100
        : 0;
    const attendanceRate = workingDaysThisMonth > 0 ? (presentThisMonth / workingDaysThisMonth) * 100 : 0;
    const taskCompletion = totalTasksThisMonth > 0 ? (completedTasksThisMonth / totalTasksThisMonth) * 100 : 0;
    /* ── Revenue trend (last 6 months) ── */
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const revenueByMonth = await PaymentCollection.aggregate([
        { $match: { status: 'collected', collectedAt: { $gte: sixMonthsAgo } } },
        {
            $group: {
                _id: { y: { $year: '$collectedAt' }, m: { $month: '$collectedAt' } },
                revenue: { $sum: '$amount' },
            },
        },
    ]);
    const revenueTrend = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const row = revenueByMonth.find((r) => r._id.y === d.getFullYear() && r._id.m === d.getMonth() + 1);
        return {
            month: MONTH_LABELS[d.getMonth()],
            revenue: row?.revenue ?? 0,
        };
    });
    /* ── Headcount by department ── */
    const headcountAgg = await Employee.aggregate([
        { $match: { isDeleted: { $ne: true }, status: 'active', department: { $ne: null } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
    ]);
    const departments = await Department.find({
        _id: { $in: headcountAgg.map((h) => h._id) },
    })
        .select('name')
        .lean();
    const deptName = new Map(departments.map((d) => [String(d._id), d.name]));
    const headcountByDepartment = headcountAgg.map((h) => ({
        name: deptName.get(String(h._id)) ?? 'Unassigned',
        value: h.count,
    }));
    /* ── Attendance trend (last 8 weeks) ── */
    const eightWeeksAgo = startOfDay(new Date(now.getTime() - 8 * 7 * 24 * 3600 * 1000));
    const attendanceWeekly = await Attendance.aggregate([
        { $match: { date: { $gte: eightWeeksAgo, $lte: todayEnd } } },
        {
            $group: {
                _id: { week: { $isoWeek: '$date' }, year: { $isoWeekYear: '$date' } },
                present: {
                    $sum: {
                        $cond: [{ $in: ['$status', ['present', 'late', 'half_day']] }, 1, 0],
                    },
                },
                total: { $sum: 1 },
            },
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
        { $limit: 8 },
    ]);
    const attendanceTrendData = attendanceWeekly.map((w, i) => ({
        week: `W${i + 1}`,
        rate: w.total > 0 ? Math.round((w.present / w.total) * 100) : 0,
    }));
    /* ── Leave distribution by type (this month) ── */
    const leavesAgg = await LeaveRequest.aggregate([
        {
            $match: {
                status: 'approved',
                startDate: { $gte: monthStart, $lte: todayEnd },
            },
        },
        { $group: { _id: '$leaveTypeId', count: { $sum: 1 } } },
    ]);
    const leaveTypes = await LeaveType.find({
        _id: { $in: leavesAgg.map((l) => l._id) },
    })
        .select('name')
        .lean();
    const ltName = new Map(leaveTypes.map((t) => [String(t._id), t.name]));
    const leaveDistribution = leavesAgg.map((l) => ({
        type: ltName.get(String(l._id)) ?? 'Other',
        count: l.count,
    }));
    /* ── Top performers (this month) ── */
    const topTargets = await SalesTarget.find({
        'period.year': now.getFullYear(),
        'period.month': now.getMonth() + 1,
        isDeleted: { $ne: true },
    })
        .sort({ achievedValue: -1 })
        .limit(5)
        .populate('employeeId', 'firstName lastName designation')
        .lean();
    const topPerformers = topTargets
        .filter((t) => t.employeeId && typeof t.employeeId === 'object')
        .map((t) => {
        const emp = t.employeeId;
        return {
            name: `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || 'Unknown',
            role: emp.designation ?? '—',
            achieved: t.achievedValue ?? 0,
            target: t.targetValue ?? 0,
        };
    });
    /* ── Field stats today ── */
    const [activeAgents, visitsToday, ordersToday, collectionToday] = await Promise.all([
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
        PaymentCollection.aggregate([
            { $match: { status: 'collected', collectedAt: { $gte: todayStart, $lte: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
    ]);
    const fieldStats = {
        activeAgents,
        visitsToday,
        ordersToday,
        collectionToday: collectionToday[0]?.total ?? 0,
    };
    /* ── Health indicators ── */
    const pendingLeaves = await LeaveRequest.countDocuments({ status: 'pending' });
    // Average leave approval lag (days) over last 30 days
    const recentApproved = await LeaveRequest.find({
        status: 'approved',
        updatedAt: { $gte: new Date(now.getTime() - 30 * 24 * 3600 * 1000) },
    })
        .select('createdAt updatedAt')
        .limit(200)
        .lean();
    const lagDays = recentApproved.length > 0
        ? recentApproved.reduce((sum, r) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const created = new Date(r.createdAt).getTime();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updated = new Date(r.updatedAt).getTime();
            return sum + Math.max(0, (updated - created) / (24 * 3600 * 1000));
        }, 0) / recentApproved.length
        : 0;
    res.json({
        success: true,
        data: {
            kpis: {
                totalRevenue,
                revenueChange,
                activeEmployees,
                employeeChange,
                attendanceRate,
                taskCompletion,
            },
            revenueTrend,
            headcountByDepartment,
            attendanceTrend: attendanceTrendData,
            leaveDistribution,
            topPerformers,
            fieldStats,
            healthIndicators: {
                taskCompletion,
                leaveApprovalLagDays: Math.round(lagDays * 10) / 10,
                pendingLeaves,
            },
        },
    });
}
//# sourceMappingURL=dashboard.controller.js.map