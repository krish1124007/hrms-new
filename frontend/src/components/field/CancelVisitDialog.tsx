import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCancelVisit } from '@/hooks/use-field';
import type { Visit } from '@/lib/field.api';

/** Cancel a planned or open visit, with the reason (`POST /field/visits/:id/cancel`). */
export function CancelVisitDialog({
  visit,
  onClose,
}: {
  visit: Pick<Visit, '_id' | 'site'> | null;
  onClose: () => void;
}): ReactElement {
  const cancel = useCancelVisit();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visit) setReason('');
  }, [visit]);

  return (
    <Dialog open={visit !== null} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>Cancel the visit to {visit?.site.name ?? 'the site'}?</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-1.5">
        <Label htmlFor="cancel-reason">Reason *</Label>
        <Textarea id="cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-xs text-muted-foreground">A cancelled visit stays on record and cannot be reopened.</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Keep visit
        </Button>
        <Button
          variant="destructive"
          disabled={!reason.trim()}
          loading={cancel.isPending}
          onClick={() => visit && cancel.mutate({ id: visit._id, reason: reason.trim() }, { onSuccess: onClose })}
        >
          Cancel visit
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
