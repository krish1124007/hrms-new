import { useState, type ReactElement } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users,
  UserCheck,
  CalendarOff,
  UserPlus,
  Download,
  Upload,
  Plus,
  Search,
  MoreHorizontal,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import {
  useEmployees,
  useEmployeeStats,
  useDepartments,
  useDesignations,
} from '@/hooks/use-systemcore';
import type { Employee } from '@/lib/systemcore.api';

const STATUS_VARIANTS: Record<Employee['status'], 'success' | 'secondary' | 'destructive' | 'warning'> = {
  active: 'success',
  inactive: 'secondary',
  terminated: 'destructive',
  resigned: 'destructive',
  onNotice: 'warning',
};

const TABS: { value: 'all' | Employee['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'onNotice', label: 'On Notice' },
  { value: 'inactive', label: 'Inactive' },
];

export default function EmployeeListPage(): ReactElement {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | Employee['status']>('all');

  const params: Record<string, unknown> = { page, limit: 20 };
  if (search) params.search = search;
  if (department) params.department = department;
  if (designation) params.designation = designation;
  if (statusTab !== 'all') params.status = statusTab;

  const { data, isLoading } = useEmployees(params);
  const { data: statsData } = useEmployeeStats();
  const { data: deptData } = useDepartments({ limit: 100 });
  const { data: desigData } = useDesignations({ limit: 100, department: department || undefined });

  const stats = statsData?.data;

  const columns: DataTableColumn<Employee>[] = [
    {
      key: 'name',
      header: 'Employee',
      cell: (row) => (
        <Link
          to={`/employees/${row._id}`}
          className="flex items-center gap-3 hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            name={`${row.firstName} ${row.lastName}`}
            src={row.profileImage}
            size="sm"
          />
          <div>
            <p className="font-medium text-foreground">
              {row.firstName} {row.lastName}
            </p>
            <p className="text-xs text-muted-foreground">{row.email}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'employeeId',
      header: 'ID',
      cell: (row) => <span className="font-mono text-xs">{row.employeeId}</span>,
    },
    { key: 'department', header: 'Department', cell: (row) => row.department?.name ?? '—' },
    { key: 'designation', header: 'Designation', cell: (row) => row.designation?.name ?? '—' },
    {
      key: 'shift',
      header: 'Shift',
      cell: (row) =>
        row.shift ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: row.shift.color }}
            />
            {row.shift.name}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <Badge variant={STATUS_VARIANTS[row.status] ?? 'secondary'}>{row.status}</Badge>
      ),
    },
    {
      key: 'joiningDate',
      header: 'Joined',
      cell: (row) =>
        row.joiningDate ? new Date(row.joiningDate).toLocaleDateString('en-IN') : '—',
    },
    {
      key: 'actions',
      header: '',
      width: '40px',
      cell: () => (
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <MoreHorizontal className="size-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Manage your workforce"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Employees' }]}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Upload className="size-4" /> Import
            </Button>
            <Button variant="outline" size="sm">
              <Download className="size-4" /> Export
            </Button>
            <Button size="sm" onClick={() => navigate('/employees/new')}>
              <Plus className="size-4" /> Add Employee
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Employees" value={stats?.total ?? 0} icon={Users} />
        <StatCard label="Active" value={stats?.active ?? 0} icon={UserCheck} />
        <StatCard label="New This Month" value={stats?.joiningsThisMonth ?? 0} icon={UserPlus} />
        <StatCard label="Exits This Month" value={stats?.exitsThisMonth ?? 0} icon={CalendarOff} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => {
                setStatusTab(t.value);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                statusTab === t.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setDesignation('');
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {deptData?.data.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select
            value={designation}
            onChange={(e) => {
              setDesignation(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Designations</option>
            {desigData?.data.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(r) => r._id}
        onRowClick={(r) => navigate(`/employees/${r._id}`)}
        emptyTitle="No employees found"
        emptyDescription="Add your first employee to get started"
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
