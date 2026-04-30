import { api } from './axios';

/**
 * Dashboard aggregates (tenant-scoped).
 *
 * All endpoints are cached 30-60s server-side (see dashboard.routes.ts),
 * so aggressive React Query refetch is safe.
 */

interface ApiOk<T> {
  success: true;
  data: T;
}

export interface OverviewData {
  employees?: { total: number; active: number; newThisMonth: number };
  attendance?: {
    presentToday: number;
    absentToday: number;
    lateToday: number;
    averageThisWeek: number;
  };
  leaves?: { pendingRequests: number; onLeaveToday: number };
  payroll?: { lastProcessedMonth: string; totalPayroll: number };
  crm?: { openDeals: number; totalRevenue: number; newLeadsThisMonth: number };
  projects?: { active: number; overdue: number; completedThisMonth: number };
  tasks?: { myPending: number; myOverdue: number; completedThisWeek: number };
  fieldSales?: { activeAgents: number; visitsToday: number; ordersToday: number };
}

export interface AttendanceDay {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

export interface BirthdayRow {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  dob: string;
}

export interface UpcomingLeaveRow {
  _id: string;
  employee?: { _id: string; firstName: string; lastName: string; avatar?: string };
  startDate: string;
  endDate: string;
  leaveType?: string;
}

export interface ActivityRow {
  _id: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: { firstName: string; lastName: string; avatar?: string };
  ip?: string;
  createdAt: string;
}

export const dashboardApi = {
  overview: async (): Promise<OverviewData> => {
    const { data } = await api.get<ApiOk<OverviewData>>('/dashboard/overview');
    return data.data;
  },
  attendanceTrend: async (): Promise<AttendanceDay[]> => {
    const { data } = await api.get<ApiOk<AttendanceDay[]>>('/dashboard/attendance-trend');
    return data.data;
  },
  upcoming: async (): Promise<{ birthdays: BirthdayRow[]; leaves: UpcomingLeaveRow[] }> => {
    const { data } = await api.get<ApiOk<{ birthdays: BirthdayRow[]; leaves: UpcomingLeaveRow[] }>>(
      '/dashboard/upcoming',
    );
    return data.data;
  },
  recentActivity: async (): Promise<ActivityRow[]> => {
    const { data } = await api.get<ApiOk<ActivityRow[]>>('/dashboard/recent-activity');
    return data.data;
  },
};
