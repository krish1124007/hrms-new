import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useFieldSettings, usePlanVisit } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import type { PlanVisitInput } from '@/lib/field.api';
import { todayIST } from '@/lib/format';
import { EmployeeSelect } from './EmployeeSelect';
import { SitePicker } from './SitePicker';

interface FormState {
  siteId: string;
  siteName: string;
  employeeId: string;
  plannedDate: string;
  purpose: string;
  notes: string;
}

/**
 * Plan a visit to a site on a day, for yourself or someone you manage
 * (`POST /field/visits/plan`). Someone planned for by another person is
 * notified by the server.
 */
export function PlanVisitDialog({
  open,
  onClose,
  site,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixes the site (planning from a site's page). */
  site?: { _id: string; name: string } | null;
}): ReactElement {
  const { settings } = useFieldSettings();
  const { noProfile } = useMyEmployeeProfile();
  const plan = usePlanVisit();
  const today = todayIST();
  const blank = (): FormState => ({
    siteId: site?._id ?? '',
    siteName: site?.name ?? '',
    employeeId: '',
    plannedDate: today,
    purpose: '',
    notes: '',
  });
  const [form, setForm] = useState<FormState>(blank);

  useEffect(() => {
    if (open) setForm(blank());
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const needsEmployee = noProfile && !form.employeeId;
  const valid = !!form.siteId && !!form.plannedDate && form.plannedDate >= today && !!form.purpose && !needsEmployee;

  const submit = (): void => {
    if (!valid) return;
    const input: PlanVisitInput = {
      siteId: form.siteId,
      plannedDate: form.plannedDate,
      purpose: form.purpose,
      ...(form.employeeId ? { employeeId: form.employeeId } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };
    plan.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader>
        <DialogTitle>Plan a visit</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <SitePicker
          id="plan-site"
          required
          value={form.siteId}
          selectedLabel={form.siteName}
          disabled={!!site}
          onChange={(siteId, siteName) => setForm((f) => ({ ...f, siteId, siteName }))}
        />
        <EmployeeSelect
          id="plan-employee"
          label="Visit by"
          value={form.employeeId}
          onChange={(employeeId) => setForm((f) => ({ ...f, employeeId }))}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="plan-date">Date *</Label>
            <Input
              id="plan-date"
              type="date"
              min={today}
              value={form.plannedDate}
              onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-purpose">Purpose *</Label>
            <Select
              id="plan-purpose"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            >
              <option value="">— Select —</option>
              {settings.visitPurposes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-notes">Notes for the visit</Label>
          <Textarea
            id="plan-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          The visit shows on the employee&apos;s My day. If it is still not started by the end of that day it is
          marked missed.
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={plan.isPending} disabled={!valid}>
          Plan visit
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
