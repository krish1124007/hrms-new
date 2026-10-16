import { useState, type ReactElement, type MouseEvent } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RejectionReasonProps {
  /** The message the approver typed. Nothing renders when it is blank. */
  reason?: string | null;
  /** Heading on the popup. */
  title?: string;
  /** Prefix on the inline preview. */
  label?: string;
}

/**
 * One-line "Reason: …" preview that opens the full message in a dialog.
 *
 * Table cells clip long text, which left both admins and employees looking at
 * half a rejection message. The preview stays inside the row; the dialog holds
 * a reason of any length (it wraps, preserves line breaks, and scrolls).
 */
export function RejectionReason({
  reason,
  title = 'Rejection reason',
  label = 'Reason',
}: RejectionReasonProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const text = reason?.trim();
  if (!text) return null;

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
        title="Click to read the full reason"
        className="flex max-w-xs items-start gap-1 text-left text-xs text-destructive hover:underline"
      >
        <AlertCircle className="mt-0.5 size-3 shrink-0" />
        <span className="line-clamp-1">
          <span className="font-medium">{label}:</span> {text}
        </span>
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">
            {text}
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
