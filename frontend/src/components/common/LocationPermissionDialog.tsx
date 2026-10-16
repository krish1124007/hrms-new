import { type ReactElement } from 'react';
import { MapPinOff, Smartphone, Lock, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Why the location fix failed — mirrors GeolocationPositionError codes plus 'unsupported'. */
export type LocationFailureReason = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

interface Props {
  open: boolean;
  reason: LocationFailureReason;
  onClose: () => void;
  onRetry: () => void;
  retrying?: boolean;
}

const REASON_COPY: Record<LocationFailureReason, { title: string; description: string }> = {
  denied: {
    title: 'Location Access Blocked',
    description:
      'This site does not have permission to use your location. Allow location access in your browser, then try again.',
  },
  unavailable: {
    title: 'Turn On Device Location',
    description:
      "Your device's location (GPS) appears to be turned off, so your position could not be determined. Turn it on and try again.",
  },
  timeout: {
    title: 'Could Not Get Your Location',
    description:
      'Getting your location took too long. Make sure device location (GPS) is on and you have a clear signal, then try again.',
  },
  unsupported: {
    title: 'Location Not Supported',
    description:
      'This browser does not support location access. Please use a modern browser such as Chrome to check in.',
  },
};

export function LocationPermissionDialog({
  open,
  reason,
  onClose,
  onRetry,
  retrying = false,
}: Props): ReactElement {
  const copy = REASON_COPY[reason];
  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MapPinOff className="size-5 text-destructive" />
          {copy.title}
        </DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-3 text-sm">
        {reason === 'denied' && (
          <div className="flex gap-3 rounded-md border border-border bg-muted/40 p-3">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              <p className="font-medium">Allow location for this site</p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">On Mobile/Android:</strong> Tap the lock/tune icon next to the address bar → <span className="font-medium">Permissions</span> → <span className="font-medium">Reset Permissions</span>. Then reload the page and tap Allow. (Or check Android Settings → Apps → Chrome → Permissions).
              </p>
              <p className="text-muted-foreground">
                <strong className="text-foreground">On Desktop:</strong> Tap the lock/tune icon next to the address bar → <span className="font-medium">Location</span> → <span className="font-medium">Allow</span>, then reload.
              </p>
            </div>
          </div>
        )}
        {reason !== 'unsupported' && (
          <div className="flex gap-3 rounded-md border border-border bg-muted/40 p-3">
            <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="font-medium">Turn on device location (GPS)</p>
              <p className="mt-1 text-muted-foreground">
                Swipe down from the top of your phone screen and tap the{' '}
                <span className="font-medium">Location</span> toggle, or go to{' '}
                <span className="font-medium">Settings → Location</span> and turn it on.
              </p>
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        {reason !== 'unsupported' && (
          <Button onClick={onRetry} loading={retrying}>
            <RefreshCw className="mr-2 size-4" />
            Try Again
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
