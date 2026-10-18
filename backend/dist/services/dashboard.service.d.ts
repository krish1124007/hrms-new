export interface DashboardData {
    employees?: {
        total: number;
        active: number;
        newThisMonth: number;
    };
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
    leaves?: {
        pendingRequests: number;
        onLeaveToday: number;
    };
    payroll?: {
        lastProcessedMonth: string;
        totalPayroll: number;
    };
    projects?: {
        active: number;
        overdue: number;
        completedThisMonth: number;
    };
    tasks?: {
        myPending: number;
        myOverdue: number;
        completedThisWeek: number;
    };
    fieldSales?: {
        activeAgents: number;
        visitsToday: number;
        ordersToday: number;
    };
}
/**
 * Attendance rate over the business days `from`..`to` (day labels,
 * inclusive): present-ish rows of active employees on the company's working
 * days, over active employees × those working days. A working day is
 * `classifyDay`'s verdict with the default shift week (Mon–Sat), the
 * configured week-off rule and the company-wide public holidays. 0 when
 * there is nobody active or no working day yet.
 */
export declare function attendanceRateBetween(from: Date, to: Date): Promise<number>;
/** `attendanceRateBetween` from the 1st of the business month through the business day of `now`. */
export declare function monthToDateAttendanceRate(now?: Date): Promise<number>;
/**
 * Returns aggregated dashboard data. Only modules present in `enabledModules`
 * are queried — this keeps the response fast and relevant.
 *
 * @param userId - The current user's id (needed for task widgets)
 */
export declare function getDashboardData(enabledModules: string[], userId?: string): Promise<DashboardData>;
//# sourceMappingURL=dashboard.service.d.ts.map