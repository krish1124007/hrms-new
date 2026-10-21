import { useEffect, useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { employeesApi } from '@/lib/systemcore.api';

/**
 * Pick employees by ticking them — current (active) staff only, searchable.
 * `value` may hold ids that are not on screen (another search, or people who
 * have since left); they stay selected until unticked.
 */
export function EmployeeChecklist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}): ReactElement {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', 'checklist', debounced],
    queryFn: () => employeesApi.list({ status: 'active', limit: 100, search: debounced || undefined }),
  });
  const employees = data?.data ?? [];
  const selected = new Set(value);

  const toggle = (id: string, on: boolean): void => {
    onChange(on ? [...value, id] : value.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
        {isLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : employees.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">No active employees found.</p>
        ) : (
          employees.map((e) => (
            <label
              key={e._id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.has(e._id)}
                onChange={(ev) => toggle(e._id, ev.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate">
                {e.firstName} {e.lastName}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.employeeId}</span>
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}
