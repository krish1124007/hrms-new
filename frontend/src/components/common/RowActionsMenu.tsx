import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

/** Approximate height of one item, to open the menu upwards near the bottom edge. */
const ITEM_HEIGHT = 34;

/**
 * The "⋯" menu at the end of a table row. Fixed-positioned from the button so
 * the table's `overflow: hidden` cannot clip it; clicks never reach the row.
 */
export function RowActionsMenu({
  actions,
  label = 'More actions',
}: {
  actions: RowAction[];
  label?: string;
}): ReactElement | null {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return undefined;
    const close = (): void => setPos(null);
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const toggle = (e: React.MouseEvent): void => {
    e.stopPropagation();
    if (open || !buttonRef.current) {
      setPos(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const height = actions.length * ITEM_HEIGHT + 8;
    const below = rect.bottom + 4 + height <= window.innerHeight;
    setPos({
      top: below ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setPos(null);
                action.onSelect();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent',
                action.destructive && 'text-destructive',
              )}
            >
              <action.icon className="size-4 shrink-0" />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
