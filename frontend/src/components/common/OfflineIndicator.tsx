import { useEffect, useState, type ReactElement } from 'react';
import { WifiOff } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

/**
 * Persistent banner when the browser reports the connection is offline.
 *
 * - Listens to the native `online` / `offline` events.
 * - On reconnect, bulk-invalidates every React Query so stale data refreshes.
 * - Keeps the banner for 1.2s after reconnect with a "back online" flash so
 *   users see the transition rather than it silently disappearing.
 *
 * Note: `navigator.onLine` is a best-effort signal — some networks report
 * "online" while still being unable to reach our API. The global query
 * error handler (`queryClient.setMutationDefaults`) handles that case by
 * surfacing "network error" toasts regardless of this banner's state.
 */
export function OfflineIndicator(): ReactElement | null {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [showFlash, setShowFlash] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const handleOffline = (): void => {
      setOffline(true);
      setShowFlash(false);
    };
    const handleOnline = (): void => {
      setOffline(false);
      setShowFlash(true);
      // Refresh every cached query — data may have changed while away
      void qc.invalidateQueries();
      const t = setTimeout(() => setShowFlash(false), 1200);
      return () => clearTimeout(t);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [qc]);

  if (!offline && !showFlash) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg',
        offline
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-emerald-600 text-white',
      )}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4" />
      {offline ? 'You\'re offline — changes will sync when you reconnect' : 'Back online'}
    </div>
  );
}
