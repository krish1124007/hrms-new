import type { ReactElement } from 'react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCanManageField, useFieldReps } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * "Record for" — a field manager may book an order, payment or visit for a
 * rep (`employeeId` in the body; the server ignores it for anyone else).
 * Renders nothing for reps. A manager without an employee record of their
 * own must pick a rep; `useRepSelectRequired` tells the form.
 */
export function RepSelect({
  value,
  onChange,
  id = 'rep',
  label = 'Record for',
}: {
  value: string;
  onChange: (employeeId: string) => void;
  id?: string;
  label?: string;
}): ReactElement | null {
  const canManage = useCanManageField();
  const { has } = usePermissions();
  const canList = canManage && has('employees.view');
  const { data: reps = [] } = useFieldReps(canList);
  const { noProfile } = useMyEmployeeProfile({ enabled: canManage });
  if (!canManage || !canList) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {noProfile ? ' *' : ''}
      </Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{noProfile ? '— Select a rep —' : 'Myself'}</option>
        {reps.map((e) => (
          <option key={e._id} value={e._id}>
            {e.firstName} {e.lastName}
            {e.employeeId ? ` (${e.employeeId})` : ''}
          </option>
        ))}
      </Select>
    </div>
  );
}
