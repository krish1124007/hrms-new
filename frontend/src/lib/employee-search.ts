import type { Employee } from './systemcore.api';

/** Client-side filter for an employee picker: name, employee ID or e-mail contains `query`. */
export function matchesEmployee(
  e: Pick<Employee, 'firstName' | 'lastName' | 'employeeId' | 'email'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [`${e.firstName} ${e.lastName}`, e.employeeId, e.email].some((field) =>
    (field ?? '').toLowerCase().includes(q),
  );
}
