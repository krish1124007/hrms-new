import { useState, type ImgHTMLAttributes, type ReactElement } from 'react';
import { cn } from '@/lib/utils';

/**
 * Image primitive with sane defaults for a SaaS dashboard:
 *
 *  - **`loading="lazy"`** by default → offscreen images don't block the
 *    initial paint. Set `eager` explicitly for above-the-fold hero images.
 *  - **`decoding="async"`** → hands decode off the main thread.
 *  - **Width/height ratio preserved** during load → no CLS jump.
 *  - **Fallback + error state** — gracefully degrades to a placeholder
 *    when the S3 URL is dead or the user is offline.
 *  - **Optional low-quality blur placeholder** (`placeholder` prop).
 *
 * This is a drop-in `<img>` replacement — just swap the tag name.
 */

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'loading'> {
  src: string;
  alt: string;
  /** Override lazy loading for above-the-fold images. */
  eager?: boolean;
  /** Optional low-quality placeholder shown while loading (data URI or thumb URL). */
  placeholder?: string;
  /** Shown when the image errors out. Defaults to a neutral icon block. */
  fallback?: ReactElement | string;
  /** Explicit aspect ratio (e.g. 16/9) — prevents CLS during load. */
  aspectRatio?: number;
}

export function Image({
  src,
  alt,
  eager,
  placeholder,
  fallback,
  aspectRatio,
  className,
  style,
  ...rest
}: Props): ReactElement {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  if (status === 'error') {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md bg-muted text-xs text-muted-foreground',
          className,
        )}
        style={{
          aspectRatio: aspectRatio ?? undefined,
          ...style,
        }}
        role="img"
        aria-label={alt}
      >
        {typeof fallback === 'string' ? fallback : fallback ?? '🖼️'}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setStatus('loaded')}
      onError={() => setStatus('error')}
      className={cn(
        'transition-opacity duration-300',
        status === 'loading' && 'opacity-0',
        status === 'loaded' && 'opacity-100',
        className,
      )}
      style={{
        aspectRatio: aspectRatio ?? undefined,
        ...(status === 'loading' && placeholder
          ? { backgroundImage: `url(${placeholder})`, backgroundSize: 'cover' }
          : {}),
        ...style,
      }}
      {...rest}
    />
  );
}
