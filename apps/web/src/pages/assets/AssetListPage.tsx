import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Laptop, CheckCircle2, Wrench, Archive } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
import { useAssets, useAssetStats } from '@/hooks/use-assets';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  type Asset,
  type AssetCategory,
  type AssetStatus,
} from '@/lib/assets.api';
import { formatCurrency, formatDate } from '@/lib/format';

const STATUS_VARIANT: Record<AssetStatus, 'success' | 'default' | 'warning' | 'secondary' | 'destructive'> = {
  available: 'success',
  assigned: 'default',
  maintenance: 'warning',
  retired: 'secondary',
  lost: 'destructive',
};

const categoryLabel = (c: AssetCategory): string =>
  ASSET_CATEGORIES.find((x) => x.value === c)?.label ?? c;

export default function AssetListPage(): ReactElement {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'' | AssetCategory>('');
  const [status, setStatus] = useState<'' | AssetStatus>('');

  const { data, isLoading } = useAssets({
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
  });
  const { data: stats } = useAssetStats();

  const columns: DataTableColumn<Asset>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (a) => (
        <Link
          to={`/assets/${a._id}`}
          className="font-mono text-xs font-semibold text-primary hover:underline"
        >
          {a.assetCode}
        </Link>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      cell: (a) => (
        <div>
          <Link to={`/assets/${a._id}`} className="font-medium text-foreground hover:underline">
            {a.name}
          </Link>
          {a.serialNumber && (
            <p className="text-xs text-muted-foreground">SN: {a.serialNumber}</p>
          )}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (a) => <Badge variant="outline">{categoryLabel(a.category)}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (
        <Badge variant={STATUS_VARIANT[a.status]} className="capitalize">
          {a.status}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      cell: (a) =>
        a.assignedTo ? (
          <div className="text-sm">
            <p className="font-medium">
              {a.assignedTo.firstName} {a.assignedTo.lastName}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {a.assignedTo.employeeId}
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'value',
      header: 'Value',
      cell: (a) =>
        a.currentValue != null
          ? formatCurrency(a.currentValue)
          : a.purchasePrice != null
            ? formatCurrency(a.purchasePrice)
            : '—',
    },
    {
      key: 'purchase',
      header: 'Purchased',
      cell: (a) => (a.purchaseDate ? formatDate(a.purchaseDate) : '—'),
    },
  ];

  const s = stats?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assets"
        description="Track laptops, phones, and equipment assigned to employees"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Assets' }]}
        actions={
          <Button size="sm" asChild>
            <Link to="/assets/new">
              <Plus className="size-4" /> New Asset
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total" value={s?.total ?? 0} icon={Laptop} />
        <StatCard
          label="Available"
          value={s?.byStatus.available ?? 0}
          icon={CheckCircle2}
        />
        <StatCard label="Assigned" value={s?.byStatus.assigned ?? 0} icon={Laptop} />
        <StatCard
          label="In Maintenance"
          value={s?.byStatus.maintenance ?? 0}
          icon={Wrench}
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
            placeholder="Search by name, code, serial number..."
            className="pl-9"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as AssetCategory | '');
            setPage(1);
          }}
          className="sm:w-44"
        >
          <option value="">All categories</option>
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AssetStatus | '');
            setPage(1);
          }}
          className="sm:w-40"
        >
          <option value="">All statuses</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      <DataTable<Asset>
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(a) => a._id}
        emptyTitle="No assets yet"
        emptyDescription="Add your first asset to start tracking equipment"
      />
      {data?.pagination && (
        <Pagination
          page={data.pagination.page}
          pages={data.pagination.pages}
          onPageChange={setPage}
        />
      )}

      {s && s.total > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm">
          <Archive className="size-4 text-muted-foreground" />
          <div>
            <span className="text-muted-foreground">Purchase value:</span>{' '}
            <span className="font-semibold">{formatCurrency(s.totalPurchaseValue)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Current book value:</span>{' '}
            <span className="font-semibold">{formatCurrency(s.totalCurrentValue)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
