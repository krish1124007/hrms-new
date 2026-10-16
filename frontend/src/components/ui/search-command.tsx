import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { useEffect, type ReactElement } from 'react';
import { NAV_GROUPS, type NavItem } from '@/config/navigation';

/**
 * Flatten one nav group to leaf rows only — parents without `to` are
 * expansion targets in the sidebar, not destinations. For search, we want
 * every linkable row including children, with the parent label as a crumb
 * so "Attendance / Records" beats a context-less "Records".
 */
function flattenGroup(
  items: NavItem[],
  parentLabel?: string,
): Array<{ item: NavItem; label: string; crumb?: string }> {
  const out: Array<{ item: NavItem; label: string; crumb?: string }> = [];
  for (const it of items) {
    if (it.hidden) continue;
    if (it.to) {
      out.push({ item: it, label: it.label, crumb: parentLabel });
    }
    if (it.children && it.children.length > 0) {
      for (const child of it.children) {
        if (child.hidden || !child.to) continue;
        out.push({ item: child, label: child.label, crumb: it.label });
      }
    }
  }
  return out;
}

interface SearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchCommand({ open, onOpenChange }: SearchCommandProps): ReactElement | null {
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="flex h-full flex-col">
          <div className="flex items-center border-b border-border px-4">
            <Command.Input
              autoFocus
              placeholder="Search pages, employees, customers…"
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {NAV_GROUPS.map((group) => {
              const rows = flattenGroup(group.items);
              if (rows.length === 0) return null;
              return (
                <Command.Group
                  key={group.title}
                  heading={group.title}
                  className="mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {rows.map(({ item, label, crumb }) => (
                    <Command.Item
                      key={item.to}
                      // Search haystack includes parent + label + group so
                      // "attendance records" matches "Records" under Attendance.
                      value={`${crumb ? crumb + ' ' : ''}${label} ${group.title}`}
                      onSelect={() => {
                        navigate(item.to!);
                        onOpenChange(false);
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-foreground"
                    >
                      <item.icon className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{label}</span>
                      {crumb && (
                        <span className="text-xs text-muted-foreground">{crumb}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span>↑↓ to navigate</span>
            <span>↵ to select</span>
            <span>Esc to close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
