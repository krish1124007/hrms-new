import type { ReactNode, ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, idx: number) => ReactNode;
  className?: string;
  width?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  rowKey,
  onRowClick,
}: DataTableProps<T>): ReactElement {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8">
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                    col.className,
                  )}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={rowKey ? rowKey(row) : i}
                className={cn(
                  'border-b border-border transition-colors last:border-0',
                  onRowClick ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/20',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                    {col.cell(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  onPageChange,
}: {
  page: number;
  pages: number;
  onPageChange: (p: number) => void;
}): ReactElement | null {
  if (pages <= 1) return null;
  const range: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  for (let i = start; i <= end; i++) range.push(i);

  return (
    <div className="mt-4 flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        Page {page} of {pages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="rounded-md border border-input px-3 py-1 text-xs disabled:opacity-40"
        >
          Previous
        </button>
        {range.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              'rounded-md border border-input px-3 py-1 text-xs',
              p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === pages}
          className="rounded-md border border-input px-3 py-1 text-xs disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
