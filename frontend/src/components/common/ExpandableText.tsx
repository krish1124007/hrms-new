import { useEffect, useRef, useState, type ReactElement, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ExpandableTextProps {
  /** The full text. Renders `empty` when blank. */
  text?: string | null;
  /** Heading on the popup. */
  title?: string;
  /** Placeholder when there is no text. */
  empty?: string;
  /** Width cap on the inline preview — matches the surrounding column. */
  className?: string;
}

/**
 * Table-cell text that clips to one line and opens the full value in a dialog.
 *
 * Long free-text columns (leave reasons, descriptions) get cut off mid-word in
 * a table, with no way to read the rest. This keeps the row compact but makes
 * the full text one click away.
 *
 * The click affordance only appears when the text is *actually* clipped —
 * measured from the rendered element, so it stays correct as the column
 * resizes rather than guessing from character count.
 */
export function ExpandableText({
  text,
  title = 'Full text',
  empty = '—',
  className = 'max-w-xs',
}: ExpandableTextProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const previewRef = useRef<HTMLSpanElement>(null);
  const value = text?.trim();

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    // +1 absorbs sub-pixel rounding, which otherwise reports every cell clipped.
    const measure = (): void =>
      setClipped(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  if (!value) return <span className="text-muted-foreground">{empty}</span>;

  const openDialog = (e: MouseEvent): void => {
    // Rows may be clickable — don't trigger the row handler too.
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!clipped}
        title={clipped ? 'Click to read the full text' : undefined}
        className={`block text-left ${className} ${
          clipped ? 'cursor-pointer hover:text-foreground hover:underline' : 'cursor-default'
        }`}
      >
        <span ref={previewRef} className="line-clamp-1 break-words">
          {value}
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">
            {value}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
