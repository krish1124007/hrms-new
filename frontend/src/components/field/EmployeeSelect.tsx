import type { ReactElement } from 'react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCanPickEmployees, useFieldReps } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import type { FieldEmployeeRef } from '@/lib/field.api';

/**
 * "For whom" on a field form. '' means the signed-in employee (the field is
 * left out of the request). Someone without an employee record of their own
 * (e.g. the seeded admin) must pick a person. Without `employees.view` there
 * is no list to pick from, so it shows "Myself" only.
 *
 * The server decides who may be picked: direct reports for `field.view`,
 * anyone for `field.manage` — a refusal comes back as a toast.
 */
export function EmployeeSelect({
  value,
  onChange,
  id = 'field-employee',
  label = 'Employee',
  current,
}: {
  value: string;
  onChange: (employeeId: string) => void;
  id?: string;
  label?: string;
  /** The person already on the record, shown even when the picker cannot list them. */
  current?: FieldEmployeeRef | null;
}): ReactElement {
  const canPick = useCanPickEmployees();
  const { data: people = [], isLoading } = useFieldReps(canPick);
  const { profile, noProfile } = useMyEmployeeProfile();
  const selfOption = !noProfile;
  // The signed-in employee shows as "Myself".
  const shown = selfOption && profile && value === profile._id ? '' : value;
  const listed = people.some((p) => p._id === shown);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {!selfOption ? ' *' : ''}
      </Label>
      <Select id={id} value={shown} onChange={(e) => onChange(e.target.value)} disabled={!canPick && selfOption}>
        {selfOption ? (
          <option value="">{profile ? `Myself (${profile.firstName} ${profile.lastName})` : 'Myself'}</option>
        ) : (
          <option value="">{isLoading ? 'Loading…' : '— Select an employee —'}</option>
        )}
        {shown && !listed && (
          <option value={shown}>{current ? `${current.firstName} ${current.lastName}` : 'Selected employee'}</option>
        )}
        {people
          .filter((p) => p._id !== profile?._id || !selfOption)
          .map((p) => (
            <option key={p._id} value={p._id}>
              {p.firstName} {p.lastName}
              {p.employeeId ? ` (${p.employeeId})` : ''}
            </option>
          ))}
      </Select>
      {!canPick && !selfOption && (
        <p className="text-xs text-destructive">You need access to the employee list to choose someone.</p>
      )}
    </div>
  );
}
