import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateEmployeeStatus } from '@/hooks/use-systemcore';
import type { Employee, EmployeeStatusInput } from '@/lib/systemcore.api';
import { businessDayKey, todayKey } from '@/lib/business-day';

type Status = Employee['status'];

const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'onNotice', label: 'On notice' },
  { value: 'resigned', label: 'Resigned' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'inactive', label: 'Inactive' },
];

const LABEL: Record<Status, string> = {
  active: 'active',
  onNotice: 'on notice',
  resigned: 'resigned',
  terminated: 'terminated',
  inactive: 'inactive',
};

const formatDay = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', dateStyle: 'medium' });

/** What saving will do, in words — scheduled or at once. */
function outcome(status: Status, exitDate: string, today: string): string {
  const future = !!exitDate && exitDate > today;
  switch (status) {
    case 'active':
      return 'The employee is active and can sign in. Any scheduled exit is cleared.';
    case 'onNotice':
      return future
        ? `On notice from now; on ${formatDay(exitDate)} they become resigned and their login is turned off.`
        : 'On notice: they keep working and signing in. Add a last working day to schedule the exit.';
    default:
      return future
        ? `Scheduled: they stay active until ${formatDay(exitDate)}, then become ${LABEL[status]} and their login is turned off.`
        : `Applies now: they become ${LABEL[status]} and their login is turned off.`;
  }
}

/** Where the dialog starts: a scheduled exit as scheduled; else leaving for someone working, reactivating for someone gone. */
function initialStatus(e: Employee): Status {
  if (e.exitDate && e.exitStatus) return e.status === 'onNotice' ? 'onNotice' : e.exitStatus;
  return e.status === 'active' || e.status === 'onNotice' ? 'resigned' : 'active';
}

interface EmployeeStatusDialogProps {
  employee: Employee | null;
  onClose: () => void;
}

/**
 * Change an employee's status — resign, terminate, deactivate, put on notice
 * or reactivate. A future exit date schedules the change: the nightly job
 * applies it on that day.
 */
export function EmployeeStatusDialog({ employee, onClose }: EmployeeStatusDialogProps): ReactElement {
  const update = useUpdateEmployeeStatus();
  const today = todayKey();
  const [status, setStatus] = useState<Status>('resigned');
  const [exitDate, setExitDate] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!employee) return;
    setStatus(initialStatus(employee));
    setExitDate(employee.exitDate ? businessDayKey(employee.exitDate) : '');
    setReason(employee.exitReason ?? '');
  }, [employee]);

  const leaving = status !== 'active';

  const submit = (): void => {
    if (!employee) return;
    const body: EmployeeStatusInput = { status };
    if (leaving && exitDate) body.exitDate = exitDate;
    if (leaving && reason.trim()) body.reason = reason.trim();
    update.mutate({ id: employee._id, body }, { onSuccess: onClose });
  };

  return (
    <Dialog open={!!employee} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>
          Change status{employee ? ` — ${employee.firstName} ${employee.lastName}` : ''}
        </DialogTitle>
        <DialogDescription>
          Currently {employee ? LABEL[employee.status] : '—'}
          {employee?.exitStatus && employee.exitDate
            ? ` · ${LABEL[employee.exitStatus]} on ${formatDay(businessDayKey(employee.exitDate))}`
            : ''}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div>
          <Label htmlFor="emp-status">New status</Label>
          <Select
            id="emp-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="mt-1"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {leaving && (
          <>
            <div>
              <Label htmlFor="emp-exit-date">
                {status === 'onNotice' ? 'Last working day' : 'Exit date'}
              </Label>
              <Input
                id="emp-exit-date"
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                A future date schedules the exit; blank or today applies it now.
              </p>
            </div>
            <div>
              <Label htmlFor="emp-exit-reason">Reason</Label>
              <Textarea
                id="emp-exit-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </>
        )}
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {outcome(status, exitDate, today)}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={leaving && status !== 'onNotice' ? 'destructive' : 'default'}
          onClick={submit}
          loading={update.isPending}
        >
          Save status
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
