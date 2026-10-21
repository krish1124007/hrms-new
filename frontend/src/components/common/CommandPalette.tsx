import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Search, User, type LucideIcon } from 'lucide-react';
import { NAV_ACCESS, visibleNavLeaves } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissions } from '@/hooks/use-permissions';
import { employeesApi } from '@/lib/systemcore.api';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PaletteEntry {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  /** Always an in-app path — entries without one are never built. */
  to: string;
}

/** Shortcuts shown before the user types — only those they can open are listed. */
const QUICK_LINKS = ['/dashboard', '/employees', '/attendance', '/attendance/my', '/leaves'];

/** People search starts at this many characters. */
const MIN_PEOPLE_QUERY = 2;

const GROUP_CLASS =
  'mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground';
const ITEM_CLASS =
  'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-foreground';

/** `value`, but only after it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * ⌘K palette: the sidebar destinations this user can open, plus — for
 * holders of `employees.view` only — a live employee search against
 * `GET /employees?search=`. Nothing here is mock data, and every entry
 * navigates to a route that exists.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps): ReactElement | null {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  // Reset query when closing
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const roleSlug = useAuthStore((st) => st.user?.role?.slug);
  const { hasAny } = usePermissions();
  const canSearchPeople = hasAny(NAV_ACCESS.employees);

  // Page results: exactly the sidebar destinations this user can see.
  const pageResults = useMemo<PaletteEntry[]>(
    () =>
      visibleNavLeaves({ roleSlug, hasAny }).map(({ item, parentLabel }) => ({
        id: `page-${item.to}`,
        label: item.label,
        description: parentLabel,
        icon: item.icon,
        to: item.to,
      })),
    [roleSlug, hasAny],
  );

  const quickLinks = useMemo(
    () =>
      QUICK_LINKS.map((to) => pageResults.find((r) => r.to === to)).filter(
        (r): r is PaletteEntry => r !== undefined,
      ),
    [pageResults],
  );

  const peopleQuery = useDebounced(query.trim(), 250);
  const searchPeople = open && canSearchPeople && peopleQuery.length >= MIN_PEOPLE_QUERY;
  const people = useQuery({
    queryKey: ['command-palette', 'employees', peopleQuery],
    queryFn: () => employeesApi.list({ search: peopleQuery, limit: 5, page: 1 }),
    enabled: searchPeople,
    staleTime: 30_000,
  });
  const peopleResults = useMemo<PaletteEntry[]>(
    () =>
      searchPeople
        ? (people.data?.data ?? []).map((e) => ({
            id: `employee-${e._id}`,
            label: `${e.firstName} ${e.lastName}`,
            description: [e.employeeId, e.designation?.name ?? e.email].filter(Boolean).join(' · '),
            icon: User,
            to: `/employees/${e._id}`,
          }))
        : [],
    [people.data, searchPeople],
  );

  const handleSelect = (to: string): void => {
    navigate(to);
    onOpenChange(false);
  };

  const renderEntry = (item: PaletteEntry, opts: { value: string; forceMount?: boolean }): ReactElement => (
    <Command.Item
      key={item.id}
      value={opts.value}
      forceMount={opts.forceMount}
      data-to={item.to}
      onSelect={() => handleSelect(item.to)}
      className={ITEM_CLASS}
    >
      <item.icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.description && (
          <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
        )}
      </div>
    </Command.Item>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]"
          onClick={() => onOpenChange(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
          >
            <Command className="flex h-full flex-col" shouldFilter>
              <div className="flex items-center gap-2 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder={canSearchPeople ? 'Search pages and employees...' : 'Search pages...'}
                  className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {people.isFetching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-96 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>

                {!query && quickLinks.length > 0 && (
                  <Command.Group heading="Quick links" className={GROUP_CLASS}>
                    {quickLinks.map((item) =>
                      renderEntry(
                        // Section name ("Attendance") reads better than the leaf ("Dashboard").
                        { ...item, id: `quick-${item.to}`, label: item.description ?? item.label, description: undefined },
                        { value: `quick ${item.to}` },
                      ),
                    )}
                  </Command.Group>
                )}

                {peopleResults.length > 0 && (
                  <Command.Group heading="Employees" className={GROUP_CLASS} forceMount>
                    {/* The server already matched these (name, e-mail, ID…), so
                        cmdk must not filter them out again. */}
                    {peopleResults.map((item) => renderEntry(item, { value: item.id, forceMount: true }))}
                  </Command.Group>
                )}

                <Command.Group heading="Pages" className={GROUP_CLASS}>
                  {pageResults.map((item) =>
                    renderEntry(item, { value: `${item.label} ${item.description ?? ''} ${item.to}` }),
                  )}
                </Command.Group>
              </Command.List>

              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
                <span>
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    &uarr;&darr;
                  </kbd>{' '}
                  navigate
                </span>
                <span>
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    &crarr;
                  </kbd>{' '}
                  select
                </span>
                <span>
                  <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
                    esc
                  </kbd>{' '}
                  close
                </span>
              </div>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
