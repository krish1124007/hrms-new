import { useEffect, useRef, useState, type ReactElement } from 'react';
import { AlertTriangle, Camera, ImageOff, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUploadFieldPhoto } from '@/hooks/use-field';
import type { VisitFlags, VisitStatus } from '@/lib/field.api';
import { activeFlags, VISIT_STATUS_LABEL } from '@/lib/field-visits';
import { cn } from '@/lib/utils';

/* ── Status and flags ── */

const VISIT_STATUS_VARIANT: Record<VisitStatus, 'success' | 'warning' | 'secondary' | 'destructive'> = {
  planned: 'secondary',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'secondary',
  missed: 'destructive',
};

export function VisitStatusBadge({ status }: { status: VisitStatus }): ReactElement {
  return (
    <Badge variant={VISIT_STATUS_VARIANT[status] ?? 'secondary'}>{VISIT_STATUS_LABEL[status] ?? status}</Badge>
  );
}

/**
 * A visit's exception flags as badges (`list` of the raised ones). Renders
 * nothing — or `emptyText` — when no flag is raised.
 */
export function VisitFlagBadges({
  flags,
  emptyText,
  className,
}: {
  flags: Partial<VisitFlags> | undefined;
  emptyText?: string;
  className?: string;
}): ReactElement | null {
  const raised = activeFlags(flags);
  if (raised.length === 0) {
    return emptyText ? <span className="text-xs text-muted-foreground">{emptyText}</span> : null;
  }
  return (
    <ul aria-label="Flags" className={cn('flex flex-wrap gap-1', className)}>
      {raised.map((f) => (
        <li key={f.key}>
          <Badge variant={f.serious ? 'destructive' : 'warning'} title={f.hint}>
            {f.serious && <AlertTriangle className="mr-1 size-3" aria-hidden />}
            {f.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/* ── Photos ── */

/** Thumbnails of signed photo URLs; each opens full size in a new tab. Expired links show a placeholder. */
export function PhotoStrip({
  urls,
  size = 40,
  alt = 'Photo',
}: {
  urls: string[];
  size?: number;
  /** Each image is named "{alt} {n}". */
  alt?: string;
}): ReactElement | null {
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
              alt={`${alt} ${i + 1}`}
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
 * `onChange` receives the upload's storage key (what request bodies carry)
 * or '' when removed.
 */
export function PhotoInput({
  value,
  onChange,
  label = 'Photo',
}: {
  value: string;
  onChange: (key: string) => void;
  label?: string;
}): ReactElement {
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadFieldPhoto();
  const [preview, setPreview] = useState<string>('');

  // Each preview is an object URL holding the picked file in memory: free
  // the old one when it is replaced or removed, and the last one on unmount.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  // The form was reset from outside (dialog closed, submitted): drop the preview.
  useEffect(() => {
    if (!value) setPreview('');
  }, [value]);

  const pick = (file: File | undefined): void => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That photo is larger than 10 MB');
      return;
    }
    upload.mutate(file, {
      onSuccess: (res) => {
        onChange(res.data.key);
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
