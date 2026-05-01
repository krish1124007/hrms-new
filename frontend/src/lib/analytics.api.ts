import { api } from './axios';

export interface AnalyticsKPIs {
  totalRevenue: number;
  revenueChange: number;
  activeEmployees: number;
  employeeChange: number;
  attendanceRate: number;
  taskCompletion: number;
}

export interface AnalyticsData {
  kpis: AnalyticsKPIs;
  revenueTrend: Array<{ month: string; revenue: number }>;
  headcountByDepartment: Array<{ name: string; value: number }>;
  attendanceTrend: Array<{ week: string; rate: number }>;
  leaveDistribution: Array<{ type: string; count: number }>;
  topPerformers: Array<{ name: string; role: string; achieved: number; target: number }>;
  fieldStats: {
    activeAgents: number;
    visitsToday: number;
    ordersToday: number;
    collectionToday: number;
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
