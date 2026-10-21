import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/api-error';

/**
 * A `StatCard` value from a query: a skeleton while it loads and "Couldn't
 * load" when it failed — never a ₹0 that reads as a real figure.
 */
export function statValue(q: { isLoading: boolean; error: unknown }, value: number | undefined): ReactNode {
  if (q.isLoading) return <Skeleton className="h-8 w-24" aria-label="Loading" />;
  if (q.error) {
    return (
      <span className="text-sm font-medium text-destructive" title={apiErrorMessage(q.error)}>
        Couldn&apos;t load
      </span>
    );
  }
  return value ?? 0;
}
