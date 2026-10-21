import { useEffect, type ReactElement } from 'react';
import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBrowserLocation, type BrowserFix } from '@/hooks/use-browser-location';

/**
 * Asks the browser for a GPS fix when shown and reports it upward. The
 * server compares the check-in fix with the client's pin and flags a
 * mismatch; it never rejects a check-in for it.
 */
export function LocationCapture({ onFix }: { onFix: (fix: BrowserFix | undefined) => void }): ReactElement {
  const loc = useBrowserLocation();
  const { request, fix } = loc;

  useEffect(() => {
    request();
  }, [request]);
  useEffect(() => {
    onFix(fix);
  }, [fix, onFix]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      {loc.status === 'locating' && (
        <>
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          Finding your location…
        </>
      )}
      {loc.status === 'ok' && loc.fix && (
        <>
          <MapPin className="size-4 text-success" />
          <span className="font-mono text-xs">
            {loc.fix.lat.toFixed(5)}, {loc.fix.lng.toFixed(5)}
          </span>
          <span className="text-xs text-muted-foreground">±{loc.fix.accuracy} m</span>
        </>
      )}
      {loc.status === 'error' && <span className="text-xs text-destructive">{loc.message}</span>}
      {loc.status !== 'locating' && (
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={request}>
          <Crosshair className="mr-1 size-3" />
          {loc.status === 'ok' ? 'Refresh' : 'Use my location'}
        </Button>
      )}
    </div>
  );
}
