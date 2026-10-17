import { useEffect, useState, type ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isSessionFresh, refreshSessionUser } from '@/lib/session-refresh';
import { useAuthStore } from '@/stores/auth.store';

interface RequireAuthProps {
  children: ReactElement;
  /** Shown while the persisted session is re-read from the server. */
  fallback: ReactElement;
}

/**
 * Guards the signed-in part of the app. Signed-out visitors go to /login; for
 * a signed-in user the persisted role and permissions are first refreshed
 * from /auth/me (once per page load), so route guards and the sidebar never
 * act on access the server has since changed.
 */
export function RequireAuth({ children, fallback }: RequireAuthProps): ReactElement {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?._id ?? '');
  const location = useLocation();
  const [checkedFor, setCheckedFor] = useState<string | null>(null);

  const fresh = checkedFor === userId || isSessionFresh(userId);

  useEffect(() => {
    if (!isAuthenticated || isSessionFresh(userId)) return;
    let cancelled = false;
    void refreshSessionUser().then(() => {
      if (!cancelled) setCheckedFor(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!fresh) return fallback;
  return children;
}
