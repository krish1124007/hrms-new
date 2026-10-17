import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Calendar,
  Clock,
  FileText,
  LayoutDashboard,
  Search,
  Users,
  Briefcase,
  ClipboardList,
  MapPin,
} from 'lucide-react';
import { visibleNavLeaves } from '@/config/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissions } from '@/hooks/use-permissions';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResult {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon: typeof Search;
  to: string;
}

const QUICK_ACTION_ICONS: Record<string, typeof Search> = {
  Dashboard: LayoutDashboard,
  Employees: Users,
  Departments: Building2,
  Attendance: Clock,
  Leaves: Calendar,
  Projects: Briefcase,
  Documents: FileText,
  Tasks: ClipboardList,
  Locations: MapPin,
};

/** Shortcuts shown before the user types — only those they can open are listed. */
const QUICK_LINKS = ['/dashboard', '/employees', '/attendance'];

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

  // Page results: exactly the sidebar destinations this user can see.
  const pageResults = useMemo<SearchResult[]>(
    () =>
      visibleNavLeaves({ roleSlug, hasAny }).map(({ item, parentLabel }) => {
        const iconKey = Object.keys(QUICK_ACTION_ICONS).find((k) =>
          item.label.toLowerCase().includes(k.toLowerCase()),
        );
        return {
          id: `page-${item.to}`,
          label: item.label,
          description: parentLabel,
          category: 'Pages',
          icon: iconKey ? QUICK_ACTION_ICONS[iconKey] : item.icon,
          to: item.to,
        };
      }),
    [roleSlug, hasAny],
  );

  const quickLinks = useMemo(
    () =>
      QUICK_LINKS.map((to) => pageResults.find((r) => r.to === to)).filter(
        (r): r is SearchResult => r !== undefined,
      ),
    [pageResults],
  );

  const handleSelect = (to: string): void => {
    navigate(to);
    onOpenChange(false);
  };

  // Group results by category
  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const item of pageResults) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [pageResults]);

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
                  placeholder="Search pages..."
                  className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-96 overflow-y-auto p-2">
                <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                  No results found.
                </Command.Empty>

                {!query && quickLinks.length > 0 && (
                  <Command.Group
                    heading="Recent"
                    className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {quickLinks.map((item) => (
                      <Command.Item
                        key={`recent-${item.to}`}
                        value={`recent ${item.to}`}
                        onSelect={() => handleSelect(item.to)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-foreground"
                      >
                        <item.icon className="size-4 text-muted-foreground" />
                        {/* Section name ("Attendance") reads better than the leaf ("Dashboard"). */}
                        <span>{item.description ?? item.label}</span>
                        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          Recent
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {Object.entries(grouped).map(([category, items]) => (
                  <Command.Group
                    key={category}
                    heading={category}
                    className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.description ?? ''} ${item.category}`}
                        onSelect={() => handleSelect(item.to)}
                        className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-foreground"
                      >
                        <item.icon className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate">{item.label}</span>
                          {item.description && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.category}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
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
