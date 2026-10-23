import { api } from './axios';
import { filenameFromDisposition, withReadableBlobError } from './backups.api';
import type { ExpenseClaim, ExpenseClaimStatus } from './expense-claims.api';
import type { RoutePointKind } from './field-route';

/*
 * Field Visits — team status, day routes, travel allowance and reports
 * (`/api/v1/field/{team,route,travel,reports}`). Tracking is only at
 * check-in/check-out points: there is no live location feed.
 */

type Ok<T> = { success: boolean; data: T };

export type { RoutePointKind };

export interface FieldEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
}

export interface FieldSiteRef {
  _id: string;
  name: string;
  type?: string;
}

/* ── Team status ── */

export type TeamMemberStatus = 'at_site' | 'between_sites' | 'day_ended' | 'not_started';

/** A check-in/out point of the day: day attendance in/out or a visit in/out. */
export interface RoutePoint {
  lat: number;
  lng: number;
  at: string;
  kind: RoutePointKind;
  siteName?: string;
}

export interface TeamStatusRow {
  employee: FieldEmployeeRef;
  status: TeamMemberStatus;
  currentVisit?: { _id: string; site: { _id: string; name: string }; since: string } | null;
  lastPoint?: RoutePoint | null;
  visitsToday: number;
  kmToday: number;
}

/* ── Routes ── */

export interface RouteLeg {
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  /** Straight line × 1.3 because road distance was unavailable. */
  estimated: boolean;
}

export interface DayRoute {
  date: string;
  points: RoutePoint[];
  legs: RouteLeg[];
  totalKm: number;
  estimated: boolean;
}

/* ── Travel allowance ── */

export type VehicleType = 'bike' | 'car' | 'other';

export interface FieldVehicle {
  type: VehicleType;
  label: string;
  ratePerKm: number;
}

export interface TravelDay {
  date: string;
  totalKm: number;
  estimated: boolean;
  legs: RouteLeg[];
  hasCompletedVisit: boolean;
  claim?: { _id: string; status: ExpenseClaimStatus; km: number; amount: number } | null;
}

export interface TravelClaimInput {
  date: string;
  vehicleType: VehicleType;
  /** Omitted → the server's calculated km. */
  km?: number;
  /** Required when `km` differs from the calculated km by more than 5 %. */
  reason?: string;
}

/* ── Reports ── */

export type FieldReportKind = 'daily' | 'summary' | 'exceptions' | 'sites';
export type ReportFormat = 'xlsx' | 'pdf';
export type SummaryGroupBy = 'employee' | 'site' | 'purpose';

export interface DailyReportVisit {
  _id: string;
  site?: FieldSiteRef | null;
  purpose?: string;
  status: string;
  checkIn?: { at: string } | null;
  checkOut?: { at: string } | null;
  durationMinutes?: number | null;
  flags?: Partial<Record<string, boolean>>;
  report?: {
    notes?: string;
    outcome?: string;
    nextAction?: string;
    followUpDate?: string;
    photos?: string[];
    documents?: { url: string; name: string }[];
    peopleMet?: { name: string; designation?: string }[];
  } | null;
}

export interface DailyReport {
  date: string;
  employee?: FieldEmployeeRef;
  visits: DailyReportVisit[];
  points?: RoutePoint[];
  legs?: RouteLeg[];
  totalKm: number;
  estimated?: boolean;
}

export interface SummaryRow {
  key: string;
  label: string;
  visits: number;
  completed: number;
  missed: number;
  minutesOnSite: number;
  km: number;
}

export type ExceptionType =
  | 'away_from_site'
  | 'no_gps'
  | 'no_selfie'
  | 'short_visit'
  | 'auto_closed'
  | 'missed_plan'
  | 'synced_late';

export interface ExceptionRow {
  visitId?: string;
  employee?: FieldEmployeeRef | null;
  site?: FieldSiteRef | null;
  date: string;
  type: ExceptionType;
  detail?: string;
}

export interface SiteReportRow {
  site: FieldSiteRef;
  visits: number;
  lastVisitAt?: string | null;
  /** The people who visited (or just how many, depending on the server). */
  employees: FieldEmployeeRef[] | number;
}

export interface ReportRange {
  from: string;
  to: string;
}

export interface ReportParams {
  daily: { employeeId: string; date: string };
  summary: ReportRange & { groupBy: SummaryGroupBy };
  exceptions: ReportRange;
  sites: ReportRange;
}

export interface ReportFile {
  blob: Blob;
  filename: string;
}

const reportUrl = (kind: FieldReportKind): string => `/field/reports/${kind}`;

/** `field-summary_2026-10-01_2026-10-23.xlsx` when the server names no file. */
function fallbackFilename(kind: FieldReportKind, params: Record<string, string>, format: ReportFormat): string {
  const span = 'date' in params ? params.date : `${params.from}_${params.to}`;
  return `field-${kind}_${span}.${format}`;
}

export const fieldReportsApi = {
  /** Everyone in scope (self + direct reports, or all with `field.manage`) on an IST day. */
  teamStatus: async (date?: string): Promise<Ok<TeamStatusRow[]>> =>
    (await api.get('/field/team/status', { params: date ? { date } : undefined })).data,

  /** One employee's check-in/out points on an IST day and the measured legs between them. */
  dayRoute: async (employeeId: string, date: string): Promise<Ok<DayRoute>> =>
    (await api.get(`/field/route/${encodeURIComponent(employeeId)}`, { params: { date } })).data,

  /** The signed-in employee's km on a day and any travel claim already made for it. */
  travelDay: async (date: string): Promise<Ok<TravelDay>> =>
    (await api.get('/field/travel/day', { params: { date } })).data,

  createTravelClaim: async (input: TravelClaimInput): Promise<Ok<ExpenseClaim>> =>
    (await api.post('/field/travel/claims', input)).data,

  /** The vehicle types and their ₹/km rates, from the field settings. */
  vehicles: async (): Promise<FieldVehicle[]> => {
    const res = (await api.get('/field/settings')).data as Ok<{ vehicles?: FieldVehicle[] }>;
    return res.data?.vehicles ?? [];
  },

  daily: async (params: ReportParams['daily']): Promise<Ok<DailyReport>> =>
    (await api.get(reportUrl('daily'), { params })).data,
  summary: async (params: ReportParams['summary']): Promise<Ok<SummaryRow[]>> =>
    (await api.get(reportUrl('summary'), { params })).data,
  exceptions: async (params: ReportParams['exceptions']): Promise<Ok<ExceptionRow[]>> =>
    (await api.get(reportUrl('exceptions'), { params })).data,
  sites: async (params: ReportParams['sites']): Promise<Ok<SiteReportRow[]>> =>
    (await api.get(reportUrl('sites'), { params })).data,

  /** A report as an Excel workbook or a PDF (`?format=`), fetched with the caller's credentials. */
  download: async <K extends FieldReportKind>(
    kind: K,
    params: ReportParams[K],
    format: ReportFormat,
  ): Promise<ReportFile> => {
    const res = await api
      .get<Blob>(reportUrl(kind), { params: { ...params, format }, responseType: 'blob' })
      .catch(withReadableBlobError);
    return {
      blob: res.data,
      filename:
        filenameFromDisposition(res.headers?.['content-disposition']) ??
        fallbackFilename(kind, params as unknown as Record<string, string>, format),
    };
  },
};
