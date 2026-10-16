export interface DashboardData {
    employees?: {
        total: number;
        active: number;
        newThisMonth: number;
    };
    attendance?: {
        presentToday: number;
        absentToday: number;
        lateToday: number;
        averageThisWeek: number;
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
 * Returns aggregated dashboard data. Only modules present in `enabledModules`
 * are queried — this keeps the response fast and relevant.
 *
 * @param userId - The current user's id (needed for task widgets)
 */
export declare function getDashboardData(enabledModules: string[], userId?: string): Promise<DashboardData>;
//# sourceMappingURL=dashboard.service.d.ts.map