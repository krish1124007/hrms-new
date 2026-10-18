import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRequestRegularization } from '@/hooks/use-attendance';
import type { RegularizationRequestInput } from '@/lib/attendance.api';
import { businessInstant, todayKey } from '@/lib/business-day';

const DAY_MS = 24 * 60 * 60 * 1000;

interface RegularizationRequestDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * An employee asks for a day's attendance to be corrected: a reason, and —
 * optionally — the check-in and/or check-out time they actually worked.
 * Nothing changes until an approver agrees. A request without times asks
 * the approver to vouch for the day (it is then marked present).
 */
export function RegularizationRequestDialog({ open, onClose }: RegularizationRequestDialogProps): ReactElement {
  const request = useRequestRegularization();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  // A check-out-only request on a night shift: the punch-out was the next
  // morning, after the check-in already recorded the evening before.
  const [nextDay, setNextDay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDate(todayKey());
    setReason('');
    setCheckIn('');
    setCheckOut('');
    setNextDay(false);
    setError(null);
  }, [open]);

  const checkOutOnly = !!checkOut && !checkIn;

  const submit = (): void => {
    if (!date || date > today) {
      setError('Pick today or an earlier day');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Give a reason (at least 3 characters)');
      return;
    }
    const input: RegularizationRequestInput = { date, reason: reason.trim() };
    const inAt = checkIn ? businessInstant(date, checkIn) : null;
    let outAt = checkOut ? businessInstant(date, checkOut) : null;
    // A check-out at or before the check-in is the next morning (a night shift);
    // with no check-in given, the employee says so with the "next day" toggle.
    if (inAt && outAt && outAt.getTime() <= inAt.getTime()) outAt = new Date(outAt.getTime() + DAY_MS);
    else if (!inAt && outAt && nextDay) outAt = new Date(outAt.getTime() + DAY_MS);
    if (inAt) input.checkIn = inAt.toISOString();
    if (outAt) input.checkOut = outAt.toISOString();
    setError(null);
    request.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>Request regularization</DialogTitle>
        <DialogDescription>
          Ask your approver to correct a day — a missed punch, a wrong time, or a day you worked away
          from the office.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div>
          <Label htmlFor="reg-date">Day *</Label>
          <Input
            id="reg-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="reg-in">Check-in time</Label>
            <Input
              id="reg-in"
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="reg-out">Check-out time</Label>
            <Input
              id="reg-out"
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        {checkOutOnly && (
          <label className="flex items-center gap-2 text-sm">
            <input
              id="reg-out-next-day"
              type="checkbox"
              checked={nextDay}
              onChange={(e) => setNextDay(e.target.checked)}
              className="size-4"
            />
            Check-out was the next day (night shift)
          </label>
        )}
        <p className="text-xs text-muted-foreground">
          Both optional. Give only the punch that is wrong or missing — the other one stays as
          recorded. A check-out earlier than the check-in counts as the next morning (night shift).
          With no times, approving marks the day present.
        </p>
        <div>
          <Label htmlFor="reg-reason">Reason *</Label>
          <Textarea
            id="reg-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The biometric device was down"
            className="mt-1"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={request.isPending} disabled={reason.trim().length < 3}>
          Submit request
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
