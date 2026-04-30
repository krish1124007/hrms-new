import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Banknote, IndianRupee, TrendingDown, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { useLoans, useLoanStats } from '@/hooks/use-loans';
import {
  LOAN_STATUSES,
  LOAN_TYPES,
  type Loan,
  type LoanStatus,
  type LoanType,
} from '@/lib/loans.api';
import { formatCurrency, formatDate } from '@/lib/format';

const STATUS_VARIANT: Record<LoanStatus, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  pending: 'warning',
  approved: 'default',
  rejected: 'destructive',
  disbursed: 'default',
  active: 'success',
  closed: 'secondary',
  cancelled: 'secondary',
};

const typeLabel = (t: LoanType): string => LOAN_TYPES.find((x) => x.value === t)?.label ?? t;

export default function LoanListPage(): ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | LoanType>('');
  const [status, setStatus] = useState<'' | LoanStatus>('');

  const { data, isLoading } = useLoans({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  });
  const { data: stats } = useLoanStats();
  const s = stats?.data;

  const columns: DataTableColumn<Loan>[] = [
    {
      key: 'no',
      header: 'Loan #',
      cell: (l) => (
        <Link to={`/loans/${l._id}`} className="font-mono text-xs font-semibold text-primary hover:underline">
          {l.loanNumber}
        </Link>
      ),
    },
    {
      key: 'employee',
      header: 'Employee',
      cell: (l) =>
        l.employee ? (
          <div className="text-sm">
            <p className="font-medium">
              {l.employee.firstName} {l.employee.lastName}
            </p>
            <p className="font-mono text-xs text-muted-foreground">{l.employee.employeeId}</p>
          </div>
        ) : (
          '—'
        ),
    },
    { key: 'type', header: 'Type', cell: (l) => <Badge variant="outline">{typeLabel(l.type)}</Badge> },
    {
      key: 'principal',
      header: 'Principal',
      cell: (l) => <span className="font-medium">{formatCurrency(l.principalAmount)}</span>,
    },
    {
      key: 'tenure',
      header: 'Tenure',
      cell: (l) => `${l.tenureMonths}m @ ${l.interestRate}%`,
    },
    {
      key: 'emi',
      header: 'EMI',
      cell: (l) => formatCurrency(l.emiAmount),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      cell: (l) => (
        <span className={l.outstandingTotal > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
          {formatCurrency(l.outstandingTotal)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (l) => (
        <Badge variant={STATUS_VARIANT[l.status]} className="capitalize">
          {l.status}
        </Badge>
      ),
    },
    {
      key: 'applied',
      header: 'Applied',
      cell: (l) => <span className="text-xs text-muted-foreground">{formatDate(l.appliedAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loans & Advances"
        description="Manage salary advances, personal loans, and EMI schedules"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Loans' }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/loans/new">
              <Plus className="size-4" /> New Loan
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active loans" value={s?.byStatus.active ?? 0} icon={Banknote} />
        <StatCard label="Pending approval" value={s?.byStatus.pending ?? 0} icon={Wallet} />
        <StatCard
          label="Total disbursed"
          value={s?.totalDisbursed ?? 0}
          icon={IndianRupee}
          format={(n) => formatCurrency(n, { compact: true })}
        />
        <StatCard
          label="Total outstanding"
          value={s?.totalOutstanding ?? 0}
          icon={TrendingDown}
          format={(n) => formatCurrency(n, { compact: true })}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by loan number..."
            className="pl-9"
          />
        </div>
        <Select
          value={type}
          onChange={(e) => {
            setType(e.target.value as LoanType | '');
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">All types</option>
          {LOAN_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as LoanStatus | '');
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All statuses</option>
          {LOAN_STATUSES.map((st) => (
            <option key={st.value} value={st.value}>
              {st.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable<Loan>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(l) => l._id}
        emptyTitle="No loans yet"
        emptyDescription="Create the first loan application to get started"
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
