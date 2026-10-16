import type { ReactElement } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Pre-canned skeleton patterns matching the shape of the data we load.
 *
 * Why not spinners? Three reasons:
 *   1. Skeletons communicate shape → reduce perceived load time
 *   2. Layout doesn't jump when data arrives (preserved heights)
 *   3. Works for both cached + fresh loads without flicker
 *
 * Drop into a `useQuery.isLoading` branch:
 *
 *   if (isLoading) return <TableSkeleton rows={8} />;
 */

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }): ReactElement {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardListSkeleton({ count = 3 }: { count?: number }): ReactElement {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }): ReactElement {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 p-6">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DetailSkeleton(): ReactElement {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </CardContent>
      </Card>
    </div>
  );
}

export function InlineSpinnerSkeleton(): ReactElement {
  // For tight spaces (inside buttons, inline stats) where a full skeleton is overkill
  return <Skeleton className="inline-block h-4 w-16 align-middle" />;
}
