import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** What will happen — name the thing and say whether it can be undone. */
  description?: ReactNode;
  /** The confirm button's text, e.g. "Delete site". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button (default) — for deletes and other one-way actions. */
  destructive?: boolean;
  /** Spinner on the confirm button while the action runs. */
  loading?: boolean;
  /**
   * For the most dangerous actions: the confirm button stays disabled until
   * this exact text is typed (e.g. `RESET 2026`).
   */
  typeToConfirm?: string;
}

/**
 * The one confirmation prompt for destructive actions — instead of acting
 * on the first click or behind a native `confirm()`.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  loading = false,
  typeToConfirm,
}: ConfirmDialogProps): ReactElement {
  const [typed, setTyped] = useState('');
  // Every opening starts with an empty box.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const blocked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm;

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      {typeToConfirm !== undefined && (
        <DialogBody className="space-y-2">
          <Label htmlFor="confirm-typed">
            Type <span className="font-mono font-semibold text-foreground">{typeToConfirm}</span> to confirm
          </Label>
          <Input
            id="confirm-typed"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
        </DialogBody>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          onClick={onConfirm}
          disabled={blocked}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
