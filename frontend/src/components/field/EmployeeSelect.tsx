import type { ReactElement } from 'react';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCanPickEmployees, useFieldReps, useNoFieldAccess } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import type { FieldEmployeeRef, NoFieldAccessReason } from '@/lib/field.api';

const NO_ACCESS_LABEL: Record<NoFieldAccessReason, string> = {
  no_permission: 'no field access',
  no_login: 'no login',
};

/**
 * "For whom" on a field form. '' means the signed-in employee (the field is
 * left out of the request). Someone without an employee record of their own
 * (e.g. the seeded admin) must pick a person. Without `employees.view` there
 * is no list to pick from, so it shows "Myself" only.
 *
 * The server decides who may be picked: direct reports for `field.view`,
 * anyone for `field.manage` — a refusal comes back as a toast. People whose
 * login cannot use Field Visits (no Field Employee role, or no login) are
 * listed but cannot be chosen: the server would refuse them
 * (EMPLOYEE_NO_FIELD_ACCESS).
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
  const noAccess = useNoFieldAccess(canPick);
  const { profile, noProfile } = useMyEmployeeProfile();
  const selfOption = !noProfile;
  // The signed-in employee shows as "Myself".
  const shown = selfOption && profile && value === profile._id ? '' : value;
  const listed = people.some((p) => p._id === shown);
  const choices = people.filter((p) => p._id !== profile?._id || !selfOption);
  const flagged = choices.filter((p) => noAccess[p._id]).length;
  const selectedReason = shown ? noAccess[shown] : undefined;

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
        {choices.map((p) => {
          const reason = noAccess[p._id];
          return (
            // The one already on the record stays selectable, so an unrelated edit still saves.
            <option key={p._id} value={p._id} disabled={!!reason && p._id !== shown}>
              {p.firstName} {p.lastName}
              {p.employeeId ? ` (${p.employeeId})` : ''}
              {reason ? ` — ${NO_ACCESS_LABEL[reason]}` : ''}
            </option>
          );
        })}
      </Select>
      {!canPick && !selfOption && (
        <p className="text-xs text-destructive">You need access to the employee list to choose someone.</p>
      )}
      {selectedReason ? (
        <p className="text-xs text-destructive">
          This person cannot use Field Visits yet. Give them the Field Employee role first (Employees → their profile
          → App access).
        </p>
      ) : (
        flagged > 0 && (
          <p className="text-xs text-muted-foreground">
            People marked “no field access” need the Field Employee role first (Employees → their profile → App
            access).
          </p>
        )
      )}
    </div>
  );
}
