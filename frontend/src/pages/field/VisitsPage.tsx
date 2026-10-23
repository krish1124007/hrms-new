import { type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { VisitFlagBadges, VisitStatusBadge } from '@/components/field/FieldBits';
import { SitePicker } from '@/components/field/SitePicker';
import { useCanPickEmployees, useFieldReps, useVisits } from '@/hooks/use-field';
import { isNoEmployeeProfileError } from '@/lib/api-error';
import { personName, type Visit, type VisitStatus } from '@/lib/field.api';
import { formatMinutes, VISIT_STATUS_LABEL, VISIT_STATUSES } from '@/lib/field-visits';
import { formatDate, formatTime } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function when(v: Visit): ReactElement {
  if (v.checkIn?.at) {
    return (
      <div className="whitespace-nowrap text-xs">
        <div>{formatDate(v.checkIn.at)}</div>
        <div className="text-muted-foreground">
          {formatTime(v.checkIn.at)} – {v.checkOut?.at ? formatTime(v.checkOut.at) : 'open'}
        </div>
      </div>
    );
  }
  return (
    <div className="whitespace-nowrap text-xs">
      <div>{v.plannedDate ? formatDate(v.plannedDate) : formatDate(v.createdAt)}</div>
      <div className="text-muted-foreground">{v.status === 'planned' ? 'planned' : 'not started'}</div>
    </div>
  );
}

/**
 * Every visit the signed-in user may see (their own and their team's, or
 * everyone's with `field.manage`), filtered by status, day range, employee
 * and site — all kept in the URL, so a filtered list can be shared.
 */
export default function VisitsPage(): ReactElement {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canPick = useCanPickEmployees();
  const { data: people = [] } = useFieldReps(canPick);

  const status = (VISIT_STATUSES as string[]).includes(params.get('status') ?? '') ? (params.get('status') as VisitStatus) : '';
  const from = DATE_KEY.test(params.get('from') ?? '') ? (params.get('from') as string) : '';
  const to = DATE_KEY.test(params.get('to') ?? '') ? (params.get('to') as string) : '';
  const employeeId = params.get('employeeId') ?? '';
  const siteId = params.get('siteId') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const set = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  const { data, isLoading, error, refetch } = useVisits({
    page,
    limit: 20,
    status: status || undefined,
    from: from || undefined,
    to: to || undefined,
    employeeId: employeeId || undefined,
    siteId: siteId || undefined,
  });
  const filtered = !!(status || from || to || employeeId || siteId);

  const columns: DataTableColumn<Visit>[] = [
    { key: 'when', header: 'When', cell: when },
    {
      key: 'employee',
      header: 'Employee',
      cell: (v) => (
        <div className="text-xs">
          <div className="font-medium">{personName(v.employee)}</div>
          {v.employee?.employeeId && <div className="text-muted-foreground">{v.employee.employeeId}</div>}
        </div>
      ),
    },
    {
      key: 'site',
      header: 'Site',
      cell: (v) => (
        <div className="text-xs">
          <div className="font-medium">{v.site?.name ?? '—'}</div>
          <div className="text-muted-foreground">{v.purpose}</div>
        </div>
      ),
    },
    { key: 'status', header: 'Status', cell: (v) => <VisitStatusBadge status={v.status} /> },
    { key: 'duration', header: 'Time on site', cell: (v) => <span className="text-xs">{formatMinutes(v.durationMinutes)}</span> },
    {
      key: 'report',
      header: 'Report',
      cell: (v) =>
        v.report ? (
          <span className="line-clamp-2 max-w-[220px] text-xs">{v.report.notes || 'Filed'}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{v.status === 'completed' ? 'Not filed' : '—'}</span>
        ),
    },
    { key: 'flags', header: 'Flags', cell: (v) => <VisitFlagBadges flags={v.flags} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visits"
        description="Check-ins and check-outs at sites, with the work report and anything flagged"
        icon={MapPin}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Visits' }]}
      />

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[10rem_10rem_10rem_14rem_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="visits-status">Status</Label>
          <Select id="visits-status" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any status</option>
            {VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {VISIT_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visits-from">From</Label>
          <Input id="visits-from" type="date" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="visits-to">To</Label>
          <Input id="visits-to" type="date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </div>
        {canPick ? (
          <div className="space-y-1.5">
            <Label htmlFor="visits-employee">Employee</Label>
            <Select id="visits-employee" value={employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
              <option value="">Everyone I can see</option>
              {employeeId && !people.some((p) => p._id === employeeId) && <option value={employeeId}>Selected employee</option>}
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div />
        )}
        <SitePicker id="visits-site" emptyLabel="Any site" value={siteId} onChange={(id) => set({ siteId: id })} />
        <div className="flex items-end">
          {filtered && (
            <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="field visits" />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(v) => v._id}
            onRowClick={(v) => navigate(`/field/visits/${v._id}`)}
            emptyTitle={filtered ? 'No visits match' : 'No visits yet'}
            emptyDescription={
              filtered
                ? 'Try a wider date range or clear the filters.'
                : 'Visits appear here when someone checks in at a site from the mobile app, or one is planned.'
            }
          />
          <Pagination
            page={page}
            pages={data?.pagination?.pages ?? 1}
            onPageChange={(p) => set({ page: p > 1 ? String(p) : '' })}
          />
        </>
      )}
    </div>
  );
}
