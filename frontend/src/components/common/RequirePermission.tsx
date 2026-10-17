import { useEffect, type ReactElement, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';

interface RequirePermissionProps {
  /** The user needs at least one of these (an empty list lets everyone in). */
  anyOf: string[];
  children: ReactNode;
}

const DENIED_TOAST_ID = 'route-permission-denied';

/**
 * Route guard: renders `children` when the signed-in user holds any of
 * `anyOf`, otherwise sends them to the dashboard with a toast. The API
 * enforces the same permissions — this only keeps people off pages whose
 * every request would 403.
 */
export function RequirePermission({ anyOf, children }: RequirePermissionProps): ReactElement {
  const { hasAny } = usePermissions();
  const allowed = hasAny(anyOf);

  useEffect(() => {
    if (allowed) return;
    // Deferred a tick: on a hard load straight onto a guarded URL this effect
    // runs before the root <Toaster> (a later sibling) has subscribed, and an
    // immediate toast would be dropped. Not cleared on unmount — the redirect
    // unmounts this guard right away. The fixed id keeps StrictMode's double
    // effect to a single toast.
    setTimeout(() => {
      toast.error('You do not have access to that page', { id: DENIED_TOAST_ID });
    }, 0);
  }, [allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
