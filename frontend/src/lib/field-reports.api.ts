import { api } from './axios';
import { filenameFromDisposition, withReadableBlobError } from './backups.api';
import type { ExpenseClaim, ExpenseClaimStatus } from './expense-claims.api';
import type {
  FieldSettings,
  Report,
  VehicleRate,
  VehicleType,
  VisitFlags,
  VisitOutcome,
  VisitStatus,
} from './field.api';
import type { RouteLeg, RoutePoint, RoutePointKind } from './field-route';

/*
 * Field Visits — team status, day routes, travel allowance and reports
 * (`/api/v1/field/{team,route,travel,reports}`). Tracking is only at
 * check-in/check-out points: there is no live location feed. These types are
 * the server's response shapes exactly (field-team, field-travel and
 * field-reports controllers).
 */

type Ok<T> = { success: boolean; data: T };

export type { RouteLeg, RoutePoint, RoutePointKind, VehicleType };

/** An employee as these endpoints list them (`employeeId` is the employee code, `''` when unset). */
export interface FieldEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
}

/** A site as the reports list it. */
export interface FieldSiteRef {
  _id: string;
  name: string;
  type: string;
}

/* ── Team status ── */

export type TeamMemberStatus = 'at_site' | 'between_sites' | 'day_ended' | 'not_started';

export interface TeamStatusRow {
  employee: FieldEmployeeRef;
  status: TeamMemberStatus;
  /** The visit in progress, checked in that day. */
  currentVisit: { _id: string; site: { _id: string; name: string }; since: string } | null;
  /** The day's latest check-in/out point that has a GPS fix. */
  lastPoint: RoutePoint | null;
  visitsToday: number;
  kmToday: number;
}

/* ── Routes ── */

/** `GET /field/route/:employeeId` — the day's points, the measured legs and their total. */
export interface DayRoute {
  date: string;
  points: RoutePoint[];
  legs: RouteLeg[];
  /** The legs' sum in km, two decimals. */
  totalKm: number;
  /** Some leg is a straight-line estimate. */
  estimated: boolean;
}

/* ── Travel allowance ── */

/** A vehicle and its ₹/km rate from the field settings (`0` = not set yet). */
export type FieldVehicle = VehicleRate;

/** `GET /field/travel/day` — the signed-in employee's route on a day and the day's travel claim. */
export interface TravelDay extends DayRoute {
  /** A travel claim needs at least one completed visit checked in that day. */
  hasCompletedVisit: boolean;
  /** The live claim for the day, else the newest (e.g. a rejected one); `km` is its claimed km. */
  claim: { _id: string; status: ExpenseClaimStatus; km: number; amount: number } | null;
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

/** The longest range (days, both ends included) a summary / exceptions / sites report covers. */
export const MAX_REPORT_DAYS = 92;

/** A visit's check-in or check-out in the daily report. */
export interface DailyReportPunch {
  at: string;
  location: { lat: number; lng: number } | null;
  /** Metres from the site's pin. */
  distanceM: number | null;
}

export interface DailyReportVisitReport {
  notes: string;
  outcome: VisitOutcome | null;
  nextAction: string | null;
  followUpDate: string | null;
  /** Signed URLs. */
  photos: string[];
  documents: Array<{ url: string; name: string }>;
  peopleMet: Array<{ name: string; designation?: string; phone?: string }>;
  checklist: Report['checklist'] | null;
  submittedAt: string | null;
}

export interface DailyReportVisit {
  _id: string;
  site: FieldSiteRef | null;
  purpose: string;
  status: VisitStatus;
  /** `YYYY-MM-DD` when the visit was planned. */
  plannedDate: string | null;
  checkIn: DailyReportPunch | null;
  checkOut: DailyReportPunch | null;
  durationMinutes: number | null;
  flags: VisitFlags;
  report: DailyReportVisitReport | null;
}

/**
 * `GET /field/reports/daily` — the visits checked in that day (by time),
 * then that day's plans still unvisited; and the day's route.
 */
export interface DailyReport extends DayRoute {
  employee: FieldEmployeeRef;
  visits: DailyReportVisit[];
}

export interface SummaryRow {
  /** Employee id, site id or the purpose itself. */
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

/** One exception: a flag on a visit, or a missed plan (dated on its planned day). */
export interface ExceptionRow {
  visitId: string;
  employee: FieldEmployeeRef | null;
  site: FieldSiteRef | null;
  date: string;
  type: ExceptionType;
  detail: string;
}

export interface SiteReportRow {
  site: FieldSiteRef;
  visits: number;
  lastVisitAt: string;
  /** The people who visited, by name. */
  employees: FieldEmployeeRef[];
  employeeCount: number;
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

  /** The signed-in employee's route and km on a day, and any travel claim already made for it. */
  travelDay: async (date: string): Promise<Ok<TravelDay>> =>
    (await api.get('/field/travel/day', { params: { date } })).data,

  /** 201 the expense claim (category populated) with its `travel` breakdown. */
  createTravelClaim: async (input: TravelClaimInput): Promise<Ok<ExpenseClaim>> =>
    (await api.post('/field/travel/claims', input)).data,

  /** The vehicle types and their ₹/km rates, from the field settings. */
  vehicles: async (): Promise<FieldVehicle[]> => {
    const res = (await api.get('/field/settings')).data as Ok<FieldSettings>;
    return res.data.vehicles;
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
