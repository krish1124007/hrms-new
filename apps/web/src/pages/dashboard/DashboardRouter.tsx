import { lazy, Suspense, type ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

const DashboardPage = lazy(() => import('./DashboardPage'));
const EmployeeDashboardPage = lazy(() => import('./EmployeeDashboardPage'));

/**
 * Dashboard root. Picks the right page based on the signed-in user's role:
 *   - employee → EmployeeDashboardPage  (clock in/out, their own data)
 *   - admin / hr_* / manager → DashboardPage  (org-wide KPIs, audit feed)
 *
 * Both pages are lazy-loaded so a regular employee never downloads the
 * recharts/admin bundle. Routing happens client-side; backend endpoints
 * still gate each piece of data with permissions.
 */
export default function DashboardRouter(): ReactElement {
  const { user } = useAuth();
  const isEmployee = user?.role?.slug === 'employee';

  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      {isEmployee ? <EmployeeDashboardPage /> : <DashboardPage />}
    </Suspense>
  );
}
