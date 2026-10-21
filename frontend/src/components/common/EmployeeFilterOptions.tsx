import type { ReactElement } from 'react';
import type { Employee } from '@/lib/systemcore.api';
import { isCurrentEmployee } from '@/hooks/use-employee-picker';

type Option = Pick<Employee, '_id' | 'firstName' | 'lastName' | 'employeeId' | 'status'>;

/**
 * `<option>`s for an employee *filter* over history (attendance, overtime):
 * people who still work here first, then ex-employees in their own group — so
 * their past records stay reachable without them being offered as current
 * staff. Pickers that assign something use `useActiveEmployees()` alone.
 */
export function EmployeeFilterOptions({ employees }: { employees: Option[] }): ReactElement {
  const current = employees.filter(isCurrentEmployee);
  const former = employees.filter((e) => !isCurrentEmployee(e));
  const option = (e: Option): ReactElement => (
    <option key={e._id} value={e._id}>
      {e.firstName} {e.lastName}
      {e.employeeId ? ` (${e.employeeId})` : ''}
    </option>
  );
  return (
    <>
      {current.map(option)}
      {former.length > 0 && <optgroup label="Former employees">{former.map(option)}</optgroup>}
    </>
  );
}
