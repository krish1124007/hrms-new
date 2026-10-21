import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { getUserId } from '../lib/async-context.js';
import { ForbiddenError } from '../lib/errors.js';
import { hasPermission } from '../lib/access.js';
import { endOfBusinessDay, startOfBusinessDay } from '../lib/business-day.js';
/**
 * GET /api/v1/team/overview
 *
 * Manager-view aggregate. Returns one envelope with:
 *   - direct reports (resolved by `Employee.reportingManager === me`)
 *   - today's per-member presence (mapped to mobile's TeamMemberStatus shape)
 *   - rolled-up counts (present / late / absent / on_leave / not_checked_in)
 *   - pending approvals awaiting *me* (currentStep.approverId === my user id)
 *   - avg attendance rate over the current month
 *
 * Designed to fit in one round-trip from the mobile TeamDashboardScreen.
 * Heavy filters / pagination stay on the per-domain endpoints.
 */
/** Business-timezone day label — must match attendance, or the team view
 *  reports a different "today" than the attendance screens. */
const startOfDay = (d) => startOfBusinessDay(d);
/** The label of the 1st of the business month `d` falls in. */
const startOfMonth = (d) => {
    const today = startOfBusinessDay(d);
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
};
/** Map server attendance enum → mobile-friendly status string. */
function mapStatus(att) {
    if (!att)
        return 'not_checked_in';
    // A row approved leave wrote, with no punch on it, is a day off on leave —
    // whatever status it carries: `half_day` for a half day, `absent` for
    // unpaid leave. Punched in as well, they are at work: the status says how.
    if (att.leaveRequestId && !att.checkIn?.time)
        return 'on_leave';
    switch (att.status) {
        case 'present':
        case 'half_day':
            return 'present';
        case 'late':
            return 'late';
        case 'absent':
            return 'absent';
        case 'on_leave':
            return 'on_leave';
        case 'holiday':
        case 'weekend':
            return 'off';
        default:
            return att.checkIn?.time ? 'present' : 'not_checked_in';
    }
}
export async function teamOverview(req, res) {
    const userId = getUserId();
    if (!userId)
        throw new ForbiddenError('Not authenticated');
    // Find the manager's own employee record. Some users (the seeded admin)
    // don't have one: HR (`attendance.manage`) then sees every active employee
    // so the screen still has data; anyone else has no team.
    const me = await Employee.findOne({ userId }).lean().exec();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let reportFilter = null;
    if (me)
        reportFilter = { reportingManager: me._id };
    else if (hasPermission(req.user, 'attendance.manage'))
        reportFilter = { status: 'active' };
    const reports = reportFilter
        ? await Employee.find(reportFilter)
            .select('firstName lastName profileImage designation status userId')
            .populate('designation', 'name')
            .lean()
            .exec()
        : [];
    const reportIds = reports.map((r) => r._id);
    if (reportIds.length === 0) {
        // Empty team — return a complete shape so the mobile screen renders
        // its empty state, not an error toast.
        res.json({
            success: true,
            data: {
                total: 0,
                present: 0,
                late: 0,
                absent: 0,
                onLeave: 0,
                notCheckedIn: 0,
                pendingApprovals: 0,
                avgAttendanceRate: 0,
                members: [],
            },
        });
        return;
    }
    const today = startOfDay(new Date());
    const monthStart = startOfMonth(new Date());
    const [todayAtt, monthAtt] = await Promise.all([
        // Today's row, punched or not (leave and day-close write rows with no
        // check-in), anywhere within the business day.
        Attendance.find({
            employeeId: { $in: reportIds },
            date: { $gte: today, $lte: endOfBusinessDay(today) },
        })
            .select('employeeId status checkIn leaveRequestId')
            .lean()
            .exec(),
        Attendance.aggregate([
            {
                // Aggregations skip the soft-delete query hook: exclude deleted rows here.
                $match: {
                    employeeId: { $in: reportIds },
                    date: { $gte: monthStart, $lte: endOfBusinessDay(today) },
                    isDeleted: { $ne: true },
                },
            },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attByEmp = new Map();
    for (const a of todayAtt)
        attByEmp.set(String(a.employeeId), a);
    const members = reports.map((r) => {
        const att = attByEmp.get(String(r._id));
        const status = mapStatus(att);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const designation = r.designation?.name;
        const checkInTime = att?.checkIn?.time
            ? new Date(att.checkIn.time).toISOString()
            : undefined;
        return {
            _id: String(r._id),
            firstName: r.firstName,
            lastName: r.lastName,
            avatar: r.profileImage,
            designation,
            status,
            checkInTime,
        };
    });
    let present = 0;
    let late = 0;
    let absent = 0;
    let onLeave = 0;
    let notCheckedIn = 0;
    for (const m of members) {
        if (m.status === 'present')
            present += 1;
        else if (m.status === 'late')
            late += 1;
        else if (m.status === 'absent')
            absent += 1;
        else if (m.status === 'on_leave')
            onLeave += 1;
        else if (m.status === 'not_checked_in')
            notCheckedIn += 1;
    }
    // Avg attendance rate from this-month aggregate. Days that are
    // weekends/holidays are excluded from the denominator so we don't
    // dilute the headline number.
    let presentDays = 0;
    let countableDays = 0;
    for (const row of monthAtt) {
        if (row._id === 'present' || row._id === 'late' || row._id === 'half_day') {
            presentDays += row.count;
            countableDays += row.count;
        }
        else if (row._id === 'absent' || row._id === 'on_leave') {
            countableDays += row.count;
        }
    }
    const avgAttendanceRate = countableDays > 0 ? Math.round((presentDays / countableDays) * 100) : 0;
    // Optional: leaves-this-month — single count query keeps the payload light.
    const leavesThisMonth = await LeaveRequest.countDocuments({
        employeeId: { $in: reportIds },
        status: { $in: ['approved', 'pending'] },
        startDate: { $gte: monthStart, $lte: today },
    }).exec();
    res.json({
        success: true,
        data: {
            total: members.length,
            present,
            late,
            absent,
            onLeave,
            notCheckedIn,
            avgAttendanceRate,
            leavesThisMonth,
            members,
        },
    });
}
//# sourceMappingURL=team.controller.js.map