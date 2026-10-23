import { api } from './axios';

export interface AnalyticsKPIs {
  activeEmployees: number;
  employeeChange: number;
  attendanceRate: number;
  taskCompletion: number;
}

export interface AnalyticsData {
  kpis: AnalyticsKPIs;
  headcountByDepartment: Array<{ name: string; value: number }>;
  attendanceTrend: Array<{ week: string; rate: number }>;
  leaveDistribution: Array<{ type: string; count: number }>;
  /** Field visit figures for today; absent when the server sends none. */
  fieldStats?: {
    activeAgents?: number;
    visitsToday?: number;
  };
  healthIndicators: {
    taskCompletion: number;
    leaveApprovalLagDays: number;
    openTickets: number;
    pendingLeaves: number;
  };
}

export async function getAnalytics(): Promise<AnalyticsData> {
  const { data } = await api.get<{ success: true; data: AnalyticsData }>('/dashboard/analytics');
  return data.data;
}
