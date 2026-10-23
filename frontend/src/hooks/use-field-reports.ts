import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { saveBlob } from '@/lib/backups.api';
import {
  fieldReportsApi,
  type FieldReportKind,
  type ReportFormat,
  type ReportParams,
  type TravelClaimInput,
} from '@/lib/field-reports.api';

/*
 * Mutation failures are toasted once, by the global handler
 * (`lib/query-client.ts`) — never again here.
 */

/** How often the team map asks for fresh status (there is no live feed). */
export const TEAM_POLL_MS = 60_000;

/** Team status on an IST day; polled every minute while `poll` is on (today). */
export function useTeamStatus(date: string, opts: { poll?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field', 'team-status', date],
    queryFn: () => fieldReportsApi.teamStatus(date),
    refetchInterval: opts.poll ? TEAM_POLL_MS : false,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}

export function useDayRoute(employeeId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['field', 'route', employeeId, date],
    queryFn: () => fieldReportsApi.dayRoute(employeeId as string, date),
    enabled: !!employeeId,
  });
}

export function useTravelDay(date: string, enabled = true) {
  return useQuery({
    queryKey: ['field', 'travel-day', date],
    queryFn: () => fieldReportsApi.travelDay(date),
    enabled,
  });
}

export function useFieldVehicles() {
  return useQuery({
    queryKey: ['field', 'settings', 'vehicles'],
    queryFn: () => fieldReportsApi.vehicles(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTravelClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TravelClaimInput) => fieldReportsApi.createTravelClaim(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['field', 'travel-day'] });
      void qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Travel claim submitted for approval');
    },
  });
}

export function useDailyReport(params: ReportParams['daily'] | null) {
  return useQuery({
    queryKey: ['field', 'reports', 'daily', params],
    queryFn: () => fieldReportsApi.daily(params as ReportParams['daily']),
    enabled: !!params,
  });
}

export function useSummaryReport(params: ReportParams['summary'] | null) {
  return useQuery({
    queryKey: ['field', 'reports', 'summary', params],
    queryFn: () => fieldReportsApi.summary(params as ReportParams['summary']),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
}

export function useExceptionsReport(params: ReportParams['exceptions'] | null) {
  return useQuery({
    queryKey: ['field', 'reports', 'exceptions', params],
    queryFn: () => fieldReportsApi.exceptions(params as ReportParams['exceptions']),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
}

export function useSitesReport(params: ReportParams['sites'] | null) {
  return useQuery({
    queryKey: ['field', 'reports', 'sites', params],
    queryFn: () => fieldReportsApi.sites(params as ReportParams['sites']),
    enabled: !!params,
    placeholderData: keepPreviousData,
  });
}

export type ReportDownload = {
  [K in FieldReportKind]: { kind: K; params: ReportParams[K]; format: ReportFormat };
}[FieldReportKind];

/** Fetch a report file (Excel/PDF) and hand it to the browser as a download. */
export function useDownloadFieldReport() {
  return useMutation({
    mutationFn: async (req: ReportDownload) => {
      const file = await fieldReportsApi.download(req.kind, req.params as never, req.format);
      saveBlob(file);
      return file;
    },
  });
}
