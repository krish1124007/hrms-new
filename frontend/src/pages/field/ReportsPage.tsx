import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, FileSpreadsheet, FileText, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EstimatedBadge } from '@/components/field/RouteMap';
import {
  useDailyReport,
  useDownloadFieldReport,
  useExceptionsReport,
  useSitesReport,
  useSummaryReport,
  useTeamStatus,
  type ReportDownload,
} from '@/hooks/use-field-reports';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import type {
  DailyReport,
  ExceptionRow,
  ExceptionType,
  FieldEmployeeRef,
  FieldReportKind,
  ReportFormat,
  SiteReportRow,
  SummaryGroupBy,
  SummaryRow,
} from '@/lib/field-reports.api';
import { visitLink } from '@/lib/field-links';
import { formatKm } from '@/lib/field-route';
import { apiErrorMessage } from '@/lib/api-error';
import { formatDate, formatDateTime, formatTime, todayIST } from '@/lib/format';

const TABS: Array<{ value: FieldReportKind; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'summary', label: 'Summary' },
  { value: 'exceptions', label: 'Exceptions' },
  { value: 'sites', label: 'Sites' },
];

const GROUP_BY: Array<{ value: SummaryGroupBy; label: string }> = [
  { value: 'employee', label: 'Employee' },
  { value: 'site', label: 'Site' },
  { value: 'purpose', label: 'Purpose' },
];

const EXCEPTION_LABEL: Record<ExceptionType, string> = {
  away_from_site: 'Away from site',
  no_gps: 'No GPS',
  no_selfie: 'No selfie',
  short_visit: 'Short visit',
  auto_closed: 'Auto-closed',
  missed_plan: 'Missed plan',
  synced_late: 'Synced late',
};

const personName = (e?: FieldEmployeeRef | null): string => (e ? `${e.firstName} ${e.lastName}`.trim() : '—');
const dayLabel = (date: string): string =>
  formatDate(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00+05:30` : date);

/** `200` minutes → `3 h 20 m`. */
function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} m` : `${m} m`;
}

/** Field Visits reports: a day's timeline, a summary, exceptions and sites — each downloadable. */
export default function ReportsPage(): ReactElement {
  const today = todayIST();
  const [tab, setTab] = useState<FieldReportKind>('daily');
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [groupBy, setGroupBy] = useState<SummaryGroupBy>('employee');
  const [date, setDate] = useState(today);
  const [employeeId, setEmployeeId] = useState('');

  const { profile } = useMyEmployeeProfile();
  const team = useTeamStatus(today);
  const people = useMemo(
    () =>
      (team.data?.data ?? [])
        .map((r) => r.employee)
        .sort((a, b) => personName(a).localeCompare(personName(b))),
    [team.data],
  );
  // Start the daily report on the user's own day, or the only person they can see.
  useEffect(() => {
    if (employeeId) return;
    const own = people.find((p) => p._id === profile?._id);
    const first = own ?? (people.length === 1 ? people[0] : undefined);
    if (first) setEmployeeId(first._id);
  }, [employeeId, people, profile?._id]);

  const rangeError = !from || !to ? 'Pick both dates' : from > to ? '"From" must not be after "To"' : null;
  const range = rangeError ? null : { from, to };

  const request: ReportDownload | null =
    tab === 'daily'
      ? employeeId && date
        ? { kind: 'daily', params: { employeeId, date }, format: 'xlsx' }
        : null
      : range
        ? tab === 'summary'
          ? { kind: 'summary', params: { ...range, groupBy }, format: 'xlsx' }
          : { kind: tab, params: range, format: 'xlsx' }
        : null;

  const download = useDownloadFieldReport();
  const downloading = download.isPending ? download.variables?.format : undefined;
  const startDownload = (format: ReportFormat): void => {
    if (request) download.mutate({ ...request, format } as ReportDownload);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Field reports"
        description="Visits, time on site, km and exceptions — download any report as Excel or PDF"
        icon={BarChart3}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Reports' }]}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as FieldReportKind)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!request || (download.isPending && downloading !== 'xlsx')}
              loading={downloading === 'xlsx'}
              onClick={() => startDownload('xlsx')}
            >
              {downloading !== 'xlsx' && <FileSpreadsheet className="size-4" />}
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!request || (download.isPending && downloading !== 'pdf')}
              loading={downloading === 'pdf'}
              onClick={() => startDownload('pdf')}
            >
              {downloading !== 'pdf' && <FileText className="size-4" />}
              PDF
            </Button>
          </div>
        </div>
      </Tabs>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          {tab === 'daily' ? (
            <>
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label htmlFor="report-employee">Employee</Label>
                <Select id="report-employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">{team.isLoading ? 'Loading…' : '— Select an employee —'}</option>
                  {people.map((p) => (
                    <option key={p._id} value={p._id}>
                      {personName(p)}
                      {p.employeeId ? ` (${p.employeeId})` : ''}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-date">Day</Label>
                <Input
                  id="report-date"
                  type="date"
                  className="w-40"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="report-from">From</Label>
                <Input
                  id="report-from"
                  type="date"
                  className="w-40"
                  max={today}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-invalid={!!rangeError}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-to">To</Label>
                <Input
                  id="report-to"
                  type="date"
                  className="w-40"
                  max={today}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={!!rangeError}
                />
              </div>
              {tab === 'summary' && (
                <div className="space-y-1.5">
                  <Label htmlFor="report-group">Group by</Label>
                  <Select
                    id="report-group"
                    className="w-40"
                    value={groupBy}
                    onChange={(e) => setGroupBy(e.target.value as SummaryGroupBy)}
                  >
                    {GROUP_BY.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              {rangeError && <p className="w-full text-sm text-destructive">{rangeError}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {tab === 'daily' && (
        <DailyTab params={employeeId && date ? { employeeId, date } : null} noPeople={!team.isLoading && people.length === 0} />
      )}
      {tab === 'summary' && <SummaryTab params={range ? { ...range, groupBy } : null} groupBy={groupBy} />}
      {tab === 'exceptions' && <ExceptionsTab params={range} />}
      {tab === 'sites' && <SitesTab params={range} />}
    </div>
  );
}

/* ── Daily ── */

function DailyTab({
  params,
  noPeople,
}: {
  params: { employeeId: string; date: string } | null;
  noPeople: boolean;
}): ReactElement {
  const q = useDailyReport(params);
  if (!params) {
    return (
      <EmptyState
        icon={BarChart3}
        title={noPeople ? 'No one to report on' : 'Pick an employee'}
        description={
          noPeople
            ? 'Reports cover you and the people who report to you (everyone, with field management access).'
            : 'Choose someone and a day to see their visits, reports and km.'
        }
      />
    );
  }
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the daily report"
        description={apiErrorMessage(q.error)}
        action={
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            <RotateCw className="size-4" /> Retry
          </Button>
        }
      />
    );
  }
  return q.data ? <DailyTimeline report={q.data.data} /> : <></>;
}

function DailyTimeline({ report }: { report: DailyReport }): ReactElement {
  const visits = report.visits ?? [];
  const completed = visits.filter((v) => v.status === 'completed').length;
  const minutes = visits.reduce((s, v) => s + (v.durationMinutes ?? 0), 0);
  const estimated = !!report.estimated || (report.legs ?? []).some((l) => l.estimated);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Stat label="Visits" value={String(visits.length)} />
        <Stat label="Completed" value={String(completed)} />
        <Stat label="Time on site" value={formatMinutes(minutes)} />
        <div className="rounded-lg border border-border bg-card px-3 py-2">
          <div className="text-xs text-muted-foreground">Distance</div>
          <div className="flex items-center gap-2 font-semibold">
            {formatKm(report.totalKm ?? 0)}
            {estimated && <EstimatedBadge />}
          </div>
        </div>
      </div>
      {visits.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No visits"
          description={`${report.employee ? personName(report.employee) : 'This person'} has no visits on ${dayLabel(report.date)}.`}
        />
      ) : (
        <ol className="space-y-3">
          {visits.map((v, i) => {
            const flags = Object.entries(v.flags ?? {})
              .filter(([, on]) => on)
              .map(([k]) => k);
            return (
              <li key={v._id} className="rounded-lg border border-border bg-card p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <Link to={visitLink(v._id)} className="font-semibold text-primary hover:underline">
                      {v.site?.name ?? 'Unknown site'}
                    </Link>
                    {v.purpose && <span className="text-muted-foreground">· {v.purpose}</span>}
                    <Badge variant={v.status === 'completed' ? 'success' : v.status === 'missed' ? 'destructive' : 'secondary'}>
                      {v.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {v.checkIn?.at ? formatTime(v.checkIn.at) : '—'} – {v.checkOut?.at ? formatTime(v.checkOut.at) : 'open'}
                    {v.durationMinutes != null ? ` · ${formatMinutes(v.durationMinutes)}` : ''}
                  </span>
                </div>
                {flags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {flags.map((f) => (
                      <Badge key={f} variant="warning">
                        {flagLabel(f)}
                      </Badge>
                    ))}
                  </div>
                )}
                {v.report && (
                  <div className="mt-2 space-y-1 text-muted-foreground">
                    {v.report.notes && <p className="whitespace-pre-line text-foreground">{v.report.notes}</p>}
                    <p className="text-xs">
                      {[
                        v.report.outcome && `Outcome: ${v.report.outcome.replace(/_/g, ' ')}`,
                        v.report.nextAction && `Next: ${v.report.nextAction}`,
                        v.report.peopleMet?.length && `Met ${v.report.peopleMet.map((p) => p.name).join(', ')}`,
                        v.report.photos?.length && `${v.report.photos.length} photo${v.report.photos.length === 1 ? '' : 's'}`,
                        v.report.documents?.length &&
                          `${v.report.documents.length} document${v.report.documents.length === 1 ? '' : 's'}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const FLAG_LABEL: Record<string, string> = {
  awayFromSite: 'Away from site',
  noGps: 'No GPS',
  noSelfie: 'No selfie',
  shortVisit: 'Short visit',
  autoClosed: 'Auto-closed',
  syncedLate: 'Synced late',
  capturedOffline: 'Captured offline',
};
const flagLabel = (f: string): string => FLAG_LABEL[f] ?? f;

/* ── Summary ── */

function SummaryTab({
  params,
  groupBy,
}: {
  params: { from: string; to: string; groupBy: SummaryGroupBy } | null;
  groupBy: SummaryGroupBy;
}): ReactElement {
  const q = useSummaryReport(params);
  const columns: DataTableColumn<SummaryRow>[] = [
    { key: 'label', header: GROUP_BY.find((g) => g.value === groupBy)?.label ?? 'Group', cell: (r) => r.label || '—' },
    { key: 'visits', header: 'Visits', cell: (r) => r.visits },
    { key: 'completed', header: 'Completed', cell: (r) => r.completed },
    { key: 'missed', header: 'Missed', cell: (r) => r.missed },
    { key: 'minutes', header: 'Time on site', cell: (r) => formatMinutes(r.minutesOnSite) },
    { key: 'km', header: 'Km', cell: (r) => formatKm(r.km ?? 0) },
  ];
  return (
    <DataTable
      columns={columns}
      data={params ? (q.data?.data ?? []) : []}
      loading={!!params && q.isLoading}
      error={q.error}
      onRetry={() => void q.refetch()}
      rowKey={(r) => r.key}
      emptyTitle="Nothing in this range"
      emptyDescription="No visits were recorded between these dates."
    />
  );
}

/* ── Exceptions ── */

function ExceptionsTab({ params }: { params: { from: string; to: string } | null }): ReactElement {
  const q = useExceptionsReport(params);
  const columns: DataTableColumn<ExceptionRow>[] = [
    { key: 'date', header: 'Date', cell: (r) => dayLabel(r.date) },
    { key: 'employee', header: 'Employee', cell: (r) => personName(r.employee) },
    { key: 'site', header: 'Site', cell: (r) => r.site?.name ?? '—' },
    {
      key: 'type',
      header: 'Exception',
      cell: (r) => <Badge variant="warning">{EXCEPTION_LABEL[r.type] ?? r.type}</Badge>,
    },
    { key: 'detail', header: 'Detail', cell: (r) => r.detail || '—' },
    {
      key: 'visit',
      header: '',
      cell: (r) =>
        r.visitId ? (
          <Link to={visitLink(r.visitId)} className="text-xs font-medium text-primary hover:underline">
            View visit
          </Link>
        ) : null,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={params ? (q.data?.data ?? []) : []}
      loading={!!params && q.isLoading}
      error={q.error}
      onRetry={() => void q.refetch()}
      rowKey={(r) => `${r.visitId ?? r.employee?._id ?? ''}:${r.date}:${r.type}`}
      emptyTitle="No exceptions"
      emptyDescription="Every visit in this range was at its site, with GPS and a selfie, and on time."
    />
  );
}

/* ── Sites ── */

function SitesTab({ params }: { params: { from: string; to: string } | null }): ReactElement {
  const q = useSitesReport(params);
  const columns: DataTableColumn<SiteReportRow>[] = [
    { key: 'site', header: 'Site', cell: (r) => r.site?.name ?? '—' },
    { key: 'type', header: 'Type', cell: (r) => r.site?.type ?? '—' },
    { key: 'visits', header: 'Visits', cell: (r) => r.visits },
    { key: 'last', header: 'Last visit', cell: (r) => (r.lastVisitAt ? formatDateTime(r.lastVisitAt) : '—') },
    {
      key: 'employees',
      header: 'Visited by',
      cell: (r) =>
        Array.isArray(r.employees)
          ? r.employees.map(personName).join(', ') || '—'
          : `${r.employees} ${r.employees === 1 ? 'person' : 'people'}`,
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={params ? (q.data?.data ?? []) : []}
      loading={!!params && q.isLoading}
      error={q.error}
      onRetry={() => void q.refetch()}
      rowKey={(r) => r.site?._id ?? r.site?.name ?? ''}
      emptyTitle="No site visits"
      emptyDescription="No site was visited between these dates."
    />
  );
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
