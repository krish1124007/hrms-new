import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  ShieldAlert,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import {
  useDisciplinaryList,
  useDisciplinaryStats,
  useMyDisciplinary,
} from '@/hooks/use-disciplinary';
import { usePermissions } from '@/hooks/use-permissions';
import {
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_STATUSES,
  DISCIPLINARY_TYPES,
  type DisciplinaryAction,
  type DisciplinarySeverity,
  type DisciplinaryStatus,
  type DisciplinaryType,
} from '@/lib/disciplinary.api';
import { formatDate } from '@/lib/format';

const STATUS_VARIANT: Record<
  DisciplinaryStatus,
  'default' | 'success' | 'warning' | 'secondary' | 'destructive'
> = {
  open: 'warning',
  acknowledged: 'default',
  in_progress: 'default',
  escalated: 'destructive',
  resolved: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

const SEVERITY_VARIANT: Record<DisciplinarySeverity, 'success' | 'default' | 'warning' | 'destructive'> = {
  low: 'success',
  medium: 'default',
  high: 'warning',
  critical: 'destructive',
};

const typeLabel = (t: DisciplinaryType): string =>
  DISCIPLINARY_TYPES.find((x) => x.value === t)?.label ?? t;

export default function DisciplinaryListPage(): ReactElement {
  const { has } = usePermissions();
  const canManage = has('disciplinary.view') || has('disciplinary.manage');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | DisciplinaryType>('');
  const [status, setStatus] = useState<'' | DisciplinaryStatus>('');
  const [severity, setSeverity] = useState<'' | DisciplinarySeverity>('');

  // Manager view — full company list with filters + stats.
  const adminQuery = useDisciplinaryList(
    canManage
      ? {
          page,
          limit: 20,
          ...(search ? { search } : {}),
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(severity ? { severity } : {}),
        }
      : undefined,
  );
  const { data: stats } = useDisciplinaryStats();

  // Self-service view — calls /disciplinary/me, returns only this user's cases.
  const myQuery = useMyDisciplinary();

  const data = canManage ? adminQuery.data : { data: myQuery.data?.data ?? [], pagination: undefined };
  const isLoading = canManage ? adminQuery.isLoading : myQuery.isLoading;
  const s = stats?.data;

  const openCount = (s?.byStatus.open ?? 0) + (s?.byStatus.acknowledged ?? 0) + (s?.byStatus.in_progress ?? 0);
  const escalated = s?.byStatus.escalated ?? 0;
  const resolved = s?.byStatus.resolved ?? 0;
  const critical = s?.bySeverity.critical ?? 0;

  const columns: DataTableColumn<DisciplinaryAction>[] = [
    {
      key: 'case',
      header: 'Case #',
      cell: (a) => (
        <Link
          to={`/disciplinary/${a._id}`}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {a.caseNumber}
        </Link>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'employee',
            header: 'Employee',
            cell: (a: DisciplinaryAction) =>
              a.employee ? (
                <div className="text-sm">
                  <p className="flex items-center gap-1 font-medium">
                    {a.confidential && <Lock className="size-3 text-muted-foreground" />}
                    {a.employee.firstName} {a.employee.lastName}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {a.employee.employeeId}
                  </p>
                </div>
              ) : (
                '—'
              ),
          } satisfies DataTableColumn<DisciplinaryAction>,
        ]
      : []),
    {
      key: 'title',
      header: 'Title',
      cell: (a) => (
        <Link to={`/disciplinary/${a._id}`} className="font-medium hover:underline">
          {a.title}
        </Link>
      ),
    },
    { key: 'type', header: 'Type', cell: (a) => <Badge variant="outline">{typeLabel(a.type)}</Badge> },
    {
      key: 'severity',
      header: 'Severity',
      cell: (a) => (
        <Badge variant={SEVERITY_VARIANT[a.severity]} className="capitalize">
          {a.severity}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (
        <Badge variant={STATUS_VARIANT[a.status]} className="capitalize">
          {a.status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      cell: (a) => <span className="text-xs text-muted-foreground">{formatDate(a.issuedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={canManage ? 'Disciplinary Actions' : 'My Disciplinary Record'}
        description={
          canManage
            ? 'Record warnings, PIPs, and disciplinary actions with audit trails'
            : 'Warnings and disciplinary actions issued to you'
        }
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Disciplinary' }]}
        actions={
          canManage ? (
            <Button size="sm" asChild>
              <Link to="/disciplinary/new">
                <Plus className="size-4" /> New Case
              </Link>
            </Button>
          ) : null
        }
      />

      {canManage && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Open / In progress" value={openCount} icon={Clock} />
          <StatCard label="Escalated" value={escalated} icon={AlertOctagon} />
          <StatCard label="Critical severity" value={critical} icon={ShieldAlert} />
          <StatCard label="Resolved" value={resolved} icon={CheckCircle2} />
        </div>
      )}

      {canManage && (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by case number or title..."
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value as DisciplinaryType | '');
            setPage(1);
          }}
          className="sm:w-48"
        >
          <option value="">All types</option>
          {DISCIPLINARY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value as DisciplinarySeverity | '');
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All severities</option>
          {DISCIPLINARY_SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as DisciplinaryStatus | '');
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All statuses</option>
          {DISCIPLINARY_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </Select>
      </div>
      )}

      <DataTable<DisciplinaryAction>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(a) => a._id}
        emptyTitle={canManage ? 'No disciplinary cases' : 'No disciplinary record'}
        emptyDescription={
          canManage
            ? 'Use this module to issue warnings or document performance concerns'
            : 'You have no warnings or disciplinary actions on file. Keep it up.'
        }
      />
      {canManage && data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
