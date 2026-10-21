import { useRef, useState, type ReactElement } from 'react';
import { Camera, ImageOff, Loader2, MapPinOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUploadFieldPhoto } from '@/hooks/use-field';
import type { OrderStatus, PaymentCollectionStatus, VisitStatus } from '@/lib/field.api';

/* ── Status badges ── */

const ORDER_STATUS: Record<OrderStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' | 'default' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  draft: { label: 'Pending', variant: 'secondary' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  processing: { label: 'Confirmed', variant: 'default' },
  shipped: { label: 'Confirmed', variant: 'default' },
  delivered: { label: 'Delivered', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }): ReactElement {
  const s = ORDER_STATUS[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const VISIT_STATUS: Record<VisitStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  scheduled: { label: 'Planned', variant: 'secondary' },
  in_progress: { label: 'In progress', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

export function VisitStatusBadge({ status }: { status: VisitStatus }): ReactElement {
  const s = VISIT_STATUS[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const PAYMENT_STATUS: Record<PaymentCollectionStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' | 'default' }> = {
  collected: { label: 'Collected', variant: 'secondary' },
  deposited: { label: 'Deposited', variant: 'default' },
  verified: { label: 'Verified', variant: 'success' },
  bounced: { label: 'Bounced', variant: 'destructive' },
};

export function PaymentStatusBadge({ status }: { status: PaymentCollectionStatus }): ReactElement {
  const s = PAYMENT_STATUS[status] ?? { label: status, variant: 'secondary' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

/** "Away from client" — the check-in was farther than the allowed radius from the client's pin. */
export function LocationMismatchBadge({ distanceM }: { distanceM?: number }): ReactElement {
  const d =
    distanceM == null ? null : distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;
  return (
    <Badge variant="destructive" title="The check-in location was far from the client's saved location">
      <MapPinOff className="mr-1 size-3" />
      {d ? `${d} from client` : 'Away from client'}
    </Badge>
  );
}

/* ── Photos ── */

/** Thumbnails of signed photo URLs; each opens full size in a new tab. Expired links show a placeholder. */
export function PhotoStrip({ urls, size = 40 }: { urls: string[]; size?: number }): ReactElement | null {
  const [broken, setBroken] = useState<Record<string, true>>({});
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {urls.map((u, i) =>
        broken[u] ? (
          <span
            key={`${u}-${i}`}
            className="flex items-center justify-center rounded border border-border bg-muted text-muted-foreground"
            style={{ width: size, height: size }}
            title="Photo link expired — reload the page"
          >
            <ImageOff className="size-4" />
          </span>
        ) : (
          <a key={`${u}-${i}`} href={u} target="_blank" rel="noreferrer noopener" title="Open photo">
            <img
              src={u}
              alt={`Visit photo ${i + 1}`}
              loading="lazy"
              className="rounded border border-border object-cover"
              style={{ width: size, height: size }}
              onError={() => setBroken((b) => ({ ...b, [u]: true }))}
            />
          </a>
        ),
      )}
    </div>
  );
}

/**
 * Take or pick one photo and upload it to `POST /field/uploads/photo`.
 * `onChange` receives the returned signed URL (attach it within its TTL) or
 * '' when removed.
 */
export function PhotoInput({
  value,
  onChange,
  label = 'Photo',
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadFieldPhoto();
  const [preview, setPreview] = useState<string>('');

  const pick = (file: File | undefined): void => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That photo is larger than 10 MB');
      return;
    }
    upload.mutate(file, {
      onSuccess: (res) => {
        onChange(res.data.url);
        setPreview(URL.createObjectURL(file));
      },
    });
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {value && preview ? (
          <div className="relative">
            <img src={preview} alt="Selected photo" className="size-16 rounded border border-border object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 rounded-full bg-background p-0.5 shadow"
              onClick={() => {
                onChange('');
                setPreview('');
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Camera className="mr-1 size-3" />}
          {value ? 'Replace photo' : 'Add photo'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          capture="environment"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
      <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or HEIC, up to 10 MB.</p>
    </div>
  );
}
