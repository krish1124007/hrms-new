import { useState, type ReactElement } from 'react';
import { useDebounced } from '@/hooks/use-debounced';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useFieldClients } from '@/hooks/use-field';
import { formatCurrency } from '@/lib/format';

interface ClientPickerProps {
  value: string;
  onChange: (id: string, label: string) => void;
  /** Shown while `value` is not among the current search results. */
  selectedLabel?: string;
  id?: string;
  label?: string;
  required?: boolean;
  /** Show each client's outstanding balance (payments). */
  showOutstanding?: boolean;
  disabled?: boolean;
}

/**
 * Choose an active client: a search box over `GET /field/clients?search=`
 * (50 at a time, never the whole list) and a select of the matches.
 */
export function ClientPicker({
  value,
  onChange,
  selectedLabel,
  id = 'client',
  label = 'Client',
  required,
  showOutstanding,
  disabled,
}: ClientPickerProps): ReactElement {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const { data, isFetching } = useFieldClients({
    search: q || undefined,
    status: 'active',
    sort: 'name',
    limit: 50,
  });
  const clients = data?.data ?? [];
  const inResults = clients.some((c) => c._id === value);

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className={required ? "after:ml-0.5 after:text-destructive after:content-['*']" : undefined}
      >
        {label}
      </Label>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Search clients"
          placeholder="Search by name, phone, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={disabled}
        />
        <Select
          id={id}
          value={value}
          disabled={disabled}
          aria-required={required || undefined}
          onChange={(e) => {
            const c = clients.find((x) => x._id === e.target.value);
            onChange(e.target.value, c ? c.name : '');
          }}
        >
          <option value="">{isFetching && clients.length === 0 ? 'Loading…' : '— Select client —'}</option>
          {value && !inResults && <option value={value}>{selectedLabel || 'Selected client'}</option>}
          {clients.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
              {c.company ? ` (${c.company})` : ''}
              {showOutstanding && c.outstandingAmount > 0 ? ` — ${formatCurrency(c.outstandingAmount)} due` : ''}
            </option>
          ))}
        </Select>
      </div>
      {data && data.pagination?.total > clients.length && (
        <p className="text-xs text-muted-foreground">
          Showing {clients.length} of {data.pagination.total} — type to narrow the list.
        </p>
      )}
    </div>
  );
}
