import { useQuery } from '@tanstack/react-query';
import { employeesApi, type Employee } from '@/lib/systemcore.api';

/** Statuses of people who still work here — the ones a picker offers. */
export const CURRENT_EMPLOYEE_STATUSES: ReadonlyArray<Employee['status']> = ['active', 'onNotice'];

/** The API's page-size cap for `GET /employees`. */
const PAGE_SIZE = 100;

/**
 * Every employee matching `params`, read page by page (the API returns at
 * most 100 per page — asking for more is a 400). Soft-deleted employees are
 * never listed by the API.
 */
export async function fetchAllEmployees(params: Record<string, unknown> = {}): Promise<Employee[]> {
  const first = await employeesApi.list({ ...params, page: 1, limit: PAGE_SIZE, sort: 'firstName' });
  const pages = first.pagination?.pages ?? 1;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      employeesApi.list({ ...params, page: i + 2, limit: PAGE_SIZE, sort: 'firstName' }),
    ),
  );
  return [first, ...rest].flatMap((r) => r.data ?? []);
}

const byName = (a: Employee, b: Employee): number =>
  `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);

/**
 * Employees for a picker: by default only people who still work here (`active`
 * or `onNotice`) — never inactive, exited or deleted ones, so nobody allocates
 * leave to, assigns an asset to, or reports to an ex-employee.
 *
 * `includeFormer` adds inactive / resigned / terminated employees too — for
 * filters over history (e.g. last month's attendance of someone who left).
 */
export function useActiveEmployees(opts: { includeFormer?: boolean; enabled?: boolean } = {}) {
  const includeFormer = opts.includeFormer ?? false;
  return useQuery({
    queryKey: ['employees', 'picker', includeFormer ? 'all' : 'current'],
    queryFn: async (): Promise<Employee[]> => {
      if (includeFormer) return (await fetchAllEmployees()).sort(byName);
      const lists = await Promise.all(
        CURRENT_EMPLOYEE_STATUSES.map((status) => fetchAllEmployees({ status })),
      );
      return lists.flat().sort(byName);
    },
    enabled: opts.enabled ?? true,
    staleTime: 60_000,
  });
}

/** Whether an employee still works here (`active` or `onNotice`). */
export function isCurrentEmployee(e: Pick<Employee, 'status'>): boolean {
  return CURRENT_EMPLOYEE_STATUSES.includes(e.status);
}
