import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  HandCoins,
  Loader2,
  Receipt,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/hooks/use-notifications';
import type { Notification } from '@/lib/notifications.api';

/**
 * Map backend NotificationType → icon + tint. Unknown types fall back to a
 * generic bell so a future server-side type doesn't crash the UI.
 */
const ICON_FOR: Record<string, { icon: typeof Bell; cls: string }> = {
  leave_request:       { icon: CalendarCheck, cls: 'text-amber-500 bg-amber-500/10' },
  expense_request:     { icon: Receipt,       cls: 'text-pink-500 bg-pink-500/10' },
  task_assigned:       { icon: ClipboardList, cls: 'text-blue-500 bg-blue-500/10' },
  attendance_anomaly:  { icon: Clock,         cls: 'text-orange-500 bg-orange-500/10' },
  payment_due:         { icon: HandCoins,     cls: 'text-violet-500 bg-violet-500/10' },
  system_alert:        { icon: ShieldAlert,   cls: 'text-destructive bg-destructive/10' },
  approval_request:    { icon: UserCheck,     cls: 'text-emerald-500 bg-emerald-500/10' },
};

const FALLBACK = { icon: Bell, cls: 'text-muted-foreground bg-muted' };

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'just now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function NotificationDropdown(): ReactElement {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const ref = useRef<HTMLDivElement>(null);

  // The list query handles its own polling. Unread count uses a cheap
  // dedicated endpoint that polls more aggressively for the badge.
  const query = useNotifications(false);
  const unreadQuery = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items: Notification[] = query.data?.data ?? [];
  const unreadCount =
    unreadQuery.data ??
    query.data?.meta?.unreadCount ??
    items.filter((n) => !n.isRead).length;
  const visible = tab === 'unread' ? items.filter((n) => !n.isRead) : items;

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-background">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 origin-top-right rounded-xl border border-border bg-popover text-popover-foreground shadow-elevated animate-(--animate-scale-up)">
          <div className="border-b border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                >
                  <CheckCircle2 className="size-3" />
                  Mark all as read
                </button>
              )}
            </div>
            <div className="flex gap-1 rounded-md bg-muted p-0.5">
              {(['all', 'unread'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                    tab === t
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                  {t === 'unread' && unreadCount > 0 && (
                    <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {query.isLoading ? (
              <li className="flex items-center justify-center p-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </li>
            ) : query.isError ? (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <ShieldAlert className="size-7 text-destructive/50" />
                <span>Couldn&apos;t load notifications.</span>
                <button
                  onClick={() => query.refetch()}
                  className="text-xs text-primary hover:underline"
                >
                  Try again
                </button>
              </li>
            ) : visible.length === 0 ? (
              <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Bell className="size-8 text-muted-foreground/40" />
                <span>{tab === 'unread' ? 'No unread notifications.' : "You're all caught up."}</span>
              </li>
            ) : (
              visible.map((n) => {
                const meta = ICON_FOR[n.type] ?? FALLBACK;
                const Icon = meta.icon;
                const onClick = (): void => {
                  if (!n.isRead) markRead.mutate(n._id);
                  if (n.link) {
                    setOpen(false);
                    // Cross-router safe: link is an in-app path stored server-side.
                    window.location.assign(n.link);
                  }
                };
                return (
                  <li
                    key={n._id}
                    onClick={onClick}
                    className={cn(
                      'cursor-pointer border-b border-border p-3 last:border-b-0 transition-colors hover:bg-accent',
                      !n.isRead && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
                          meta.cls,
                        )}
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{n.title}</p>
                          {!n.isRead && (
                            <div className="size-2 shrink-0 rounded-full bg-primary" />
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.message}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-border p-2">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="block w-full rounded-md py-2 text-center text-xs font-medium text-primary hover:bg-accent"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
