import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  BookText,
  CheckCircle2,
  FileEdit,
  Star,
  Archive,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { usePolicies, usePolicyStats } from '@/hooks/use-hr-policies';
import {
  POLICY_CATEGORIES,
  POLICY_STATUSES,
  type HrPolicy,
  type PolicyCategory,
  type PolicyStatus,
} from '@/lib/hr-policies.api';
import { formatDate } from '@/lib/format';
import { usePermissions } from '@/hooks/use-permissions';

const STATUS_VARIANT: Record<PolicyStatus, 'default' | 'success' | 'warning' | 'secondary'> = {
  draft: 'warning',
  published: 'success',
  archived: 'secondary',
};

const categoryLabel = (c: PolicyCategory): string =>
  POLICY_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export default function PolicyListPage(): ReactElement {
  const { has } = usePermissions();
  const canManage = has('policies.manage');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'' | PolicyCategory>('');
  const [status, setStatus] = useState<'' | PolicyStatus>('');
  const [mandatory, setMandatory] = useState<'' | 'true' | 'false'>('');

  const { data, isLoading } = usePolicies({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
    ...(mandatory ? { mandatory } : {}),
  });
  const { data: stats } = usePolicyStats();
  const s = stats?.data;

  const columns: DataTableColumn<HrPolicy>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (p) => (
        <Link
          to={`/hr-policies/${p._id}`}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {p.policyCode}
        </Link>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      cell: (p) => (
        <div>
          <Link
            to={`/hr-policies/${p._id}`}
            className="flex items-center gap-1 font-medium hover:underline"
          >
            {p.mandatory && <Star className="size-3 fill-warning text-warning" />}
            {p.title}
          </Link>
          {p.summary && (
            <p className="line-clamp-1 text-xs text-muted-foreground">{p.summary}</p>
          )}
        </div>
      ),
    },
    { key: 'category', header: 'Category', cell: (p) => <Badge variant="outline">{categoryLabel(p.category)}</Badge> },
    { key: 'version', header: 'Version', cell: (p) => <span className="font-mono text-xs">v{p.currentVersion}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <Badge variant={STATUS_VARIANT[p.status]} className="capitalize">
          {p.status}
        </Badge>
      ),
    },
    {
      key: 'acks',
      header: 'Acks',
      cell: (p) =>
        p.status === 'published' && s?.activeEmployees ? (
          <span className="font-mono text-xs">
            {p.acknowledgementCount ?? 0}/{s.activeEmployees}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'effective',
      header: 'Effective',
      cell: (p) => (p.effectiveDate ? formatDate(p.effectiveDate) : '—'),
    },
    {
      key: 'updated',
      header: 'Updated',
      cell: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.updatedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Policies"
        description="Central repository for company policies with versioning and acknowledgements"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'HR Policies' }]}
        actions={
          canManage ? (
            <Button size="sm" asChild>
              <Link to="/hr-policies/new">
                <Plus className="size-4" /> New Policy
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total policies" value={s?.total ?? 0} icon={BookText} />
        <StatCard label="Published" value={s?.byStatus.published ?? 0} icon={CheckCircle2} />
        <StatCard label="Draft" value={s?.byStatus.draft ?? 0} icon={FileEdit} />
        <StatCard label="Mandatory" value={s?.mandatoryPublished ?? 0} icon={Star} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 sm:min-w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by title, code, tag..."
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as PolicyCategory | '');
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">All categories</option>
          {POLICY_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PolicyStatus | '');
            setPage(1);
          }}
          className="sm:w-36"
        >
          <option value="">All statuses</option>
          {POLICY_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </Select>
        <Select
          value={mandatory}
          onChange={(e) => {
            setMandatory(e.target.value as 'true' | 'false' | '');
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">Any</option>
          <option value="true">Mandatory only</option>
          <option value="false">Optional only</option>
        </Select>
      </div>

      <DataTable<HrPolicy>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(p) => p._id}
        emptyTitle="No policies yet"
        emptyDescription="Create your first policy to start building the company handbook"
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}

      {(s?.byStatus.archived ?? 0) > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          <Archive className="size-4" />
          {s?.byStatus.archived} archived polic{(s?.byStatus.archived ?? 0) === 1 ? 'y' : 'ies'} —
          filter by status to view.
        </div>
      )}
    </div>
  );
}
