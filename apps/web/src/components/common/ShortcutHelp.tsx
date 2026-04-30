import { useEffect, useState, type ReactElement } from 'react';
import { Keyboard } from 'lucide-react';
import { Dialog, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import { useShortcut, listShortcuts, displayCombo } from '@/hooks/use-shortcut';

/**
 * Shortcut help overlay — press `?` (or Shift+/) to see every keyboard
 * shortcut currently registered.
 *
 * The list is sourced from the global shortcut registry that `useShortcut()`
 * populates — so it stays in sync with what's actually bound, without
 * anyone having to maintain a separate docs page.
 *
 * Group names (e.g. "Navigation", "CRM") let us organise the list; pass
 * `{ group: 'Navigation' }` when registering each shortcut.
 */
export function ShortcutHelp(): ReactElement {
  const [open, setOpen] = useState(false);
  // Force re-render when the registry changes (rare — only on mount/unmount of components)
  const [, tick] = useState(0);

  useShortcut('?', () => setOpen(true), { label: 'Show keyboard shortcuts', group: 'Help' });

  useEffect(() => {
    // Re-render on open so the list is fresh
    if (open) tick((n) => n + 1);
  }, [open]);

  const shortcuts = listShortcuts();
  const grouped = shortcuts.reduce<Record<string, typeof shortcuts>>((acc, s) => {
    (acc[s.group] ??= []).push(s);
    return acc;
  }, {});

  return (
    <Dialog open={open} onClose={() => setOpen(false)} size="md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Keyboard className="h-5 w-5" />
          Keyboard shortcuts
        </DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-muted-foreground">No shortcuts registered on this page.</p>
          ) : (
            Object.entries(grouped).map(([group, entries]) => (
              <section key={group}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </h3>
                <ul className="space-y-1">
                  {entries.map((s) => (
                    <li key={s.combo} className="flex items-center justify-between">
                      <span className="text-sm">{s.label}</span>
                      <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs">
                        {displayCombo(s.combo)}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
