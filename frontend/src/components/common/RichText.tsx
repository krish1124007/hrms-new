import { useMemo, type ReactElement } from 'react';
import { cn } from '@/lib/utils';
import { looksLikeHtml, markdownToSafeHtml, sanitizeHtml } from '@/lib/rich-text';

/**
 * Renders user-authored rich text safely. `format="markdown"` treats the
 * source as Markdown (HR policies); `format="html"` as HTML (notices) — and
 * plain text in either keeps its line breaks.
 */
export function RichText({
  source,
  format,
  className,
}: {
  source: string;
  format: 'markdown' | 'html';
  className?: string;
}): ReactElement {
  const html = useMemo(() => {
    if (format === 'markdown') return markdownToSafeHtml(source);
    return looksLikeHtml(source) ? sanitizeHtml(source) : null;
  }, [source, format]);

  if (html === null) {
    return <div className={cn('whitespace-pre-wrap', className)}>{source}</div>;
  }
  return (
    <div
      className={cn(
        // No typography plugin: give the common elements readable defaults.
        '[&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:italic',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base',
        '[&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2',
        '[&_table]:w-full [&_td]:border [&_td]:px-2 [&_th]:border [&_th]:px-2 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
