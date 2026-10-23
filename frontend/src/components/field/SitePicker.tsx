import { useState, type ReactElement } from 'react';
import { useDebounced } from '@/hooks/use-debounced';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useSites } from '@/hooks/use-field';

interface SitePickerProps {
  value: string;
  onChange: (id: string, name: string) => void;
  /** Shown while `value` is not among the current search results. */
  selectedLabel?: string;
  id?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  /** The empty choice's text, e.g. "Any site" in a filter. */
  emptyLabel?: string;
}

/**
 * Choose a site: a search box over `GET /field/sites?search=` (50 at a time,
 * never the whole list) and a select of the matches.
 */
export function SitePicker({
  value,
  onChange,
  selectedLabel,
  id = 'site',
  label = 'Site',
  required,
  disabled,
  emptyLabel = '— Select a site —',
}: SitePickerProps): ReactElement {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const { data, isFetching } = useSites({ search: q || undefined, limit: 50 }, { enabled: !disabled });
  const sites = data?.data ?? [];
  const inResults = sites.some((s) => s._id === value);

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
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder="Search by name or city…"
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
            const s = sites.find((x) => x._id === e.target.value);
            onChange(e.target.value, s ? s.name : '');
          }}
        >
          <option value="">{isFetching && sites.length === 0 ? 'Loading…' : emptyLabel}</option>
          {value && !inResults && <option value={value}>{selectedLabel || 'Selected site'}</option>}
          {sites.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name}
              {s.address?.city ? ` — ${s.address.city}` : ''}
            </option>
          ))}
        </Select>
      </div>
      {data && (data.pagination?.total ?? 0) > sites.length && (
        <p className="text-xs text-muted-foreground">
          Showing {sites.length} of {data.pagination.total} — type to narrow the list.
        </p>
      )}
    </div>
  );
}
