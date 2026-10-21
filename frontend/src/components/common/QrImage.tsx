import { useEffect, useState, type ReactElement } from 'react';
import QRCode from 'qrcode';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A QR code rendered in the browser (`qrcode` package). Nothing is sent to a
 * third party — the attendance codes are secrets — and it works offline, so
 * printing does not depend on another host being up.
 */
export function QrImage({
  value,
  size = 400,
  alt,
  className,
}: {
  value: string;
  /** Pixel width of the generated image. */
  size?: number;
  alt: string;
  className?: string;
}): ReactElement {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return <p className="text-sm text-destructive">Could not draw this QR code.</p>;
  }
  if (!src) {
    return (
      <div className={cn('flex items-center justify-center', className)} style={{ width: size, height: size }}>
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  return <img src={src} alt={alt} width={size} height={size} className={className} />;
}
