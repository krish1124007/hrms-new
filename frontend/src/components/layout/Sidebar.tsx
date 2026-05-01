import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { NAV_GROUPS, type NavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { getRoleBadge } from '@/lib/permissions';

const COLLAPSED_KEY = 'opencore.sidebar.collapsed';
const EXPANDED_KEY = 'opencore.sidebar.expanded';

interface SidebarProps {
  enabledModules?: string[];
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

/**
 * Two-level sidebar.
 *
 * - Top level: groups (Main / HR / Sales & CRM / …) separated by small
 *   section headers.
 * - Each group holds a mix of leaves (NavLink) and parent items
 *   (expandable accordion). One level of nesting only — we never render
 *   children-of-children.
 * - Expansion state is persisted per parent label so the user's choice
 *   survives reloads. Auto-expands when any child route is active.
 * - Collapsed sidebar hides labels and shows only the first-level icon
 *   as a tooltip target; parent accordions collapse themselves when the
 *   sidebar is collapsed (a fly-out would be nicer but adds positioning
 *   complexity — defer until we see demand).
 */
export function Sidebar({
  enabledModules,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps): ReactElement {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(COLLAPSED_KEY) === '1',
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(EXPANDED_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  const { user, logout } = useAuth();
  const { hasAny } = usePermissions();
  const roleBadge = getRoleBadge(user);
  const location = useLocation();
  const navigate = useNavigate();

  const navGroups = NAV_GROUPS;

  /**
   * Pick exactly ONE leaf to highlight: the longest `to` that the current
   * pathname matches (exact, or as a path-segment prefix `/foo/`). This
   * prevents `/employees` from also lighting up when we're on
   * `/employees/org-chart` — only the deepest match wins.
   */
  const activePath = useMemo(() => {
    const path = location.pathname;
    const allLeaves: string[] = [];
    navGroups.forEach((g) =>
      g.items.forEach((it) => {
        if (it.to) allLeaves.push(it.to);
        if (it.children) it.children.forEach((c) => c.to && allLeaves.push(c.to));
      }),
    );
    let best = '';
    for (const to of allLeaves) {
      if (path === to || path.startsWith(to + '/')) {
        if (to.length > best.length) best = to;
      }
    }
    return best;
  }, [location.pathname, navGroups]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(expanded));
  }, [expanded]);

  const isItemEnabled = (item: NavItem): boolean => {
    if (item.hidden) return false;
    if (item.module && enabledModules && !enabledModules.includes(item.module)) {
      return false;
    }
    // Hide self-service items (My-*) from admin / HR roles — they're not
    // employees in the workforce sense and would just see empty data.
    if (item.excludeRoles && user?.role?.slug && item.excludeRoles.includes(user.role.slug)) {
      return false;
    }
    if (item.permissions && item.permissions.length > 0) {
      return hasAny(item.permissions);
    }
    return true;
  };

  /** A parent is "effectively active" when its actively-matched leaf is one of its children. */
  const isChildActive = (children: NavItem[] | undefined): boolean => {
    if (!children || !activePath) return false;
    return children.some((c) => c.to === activePath);
  };

  // Auto-expand any parent whose child is currently active. Runs whenever
  // the path changes. Doesn't collapse anything — user choices stick.
  useEffect(() => {
    const toOpen: Record<string, true> = {};
    navGroups.forEach((g) =>
      g.items.forEach((it) => {
        if (it.children && isChildActive(it.children) && !expanded[it.label]) {
          toOpen[it.label] = true;
        }
      }),
    );
    if (Object.keys(toOpen).length > 0) {
      setExpanded((prev) => ({ ...prev, ...toOpen }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleExpand = (label: string): void => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 272 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card lg:sticky lg:top-0 lg:h-screen',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          'transition-transform lg:transition-none',
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link to="/dashboard" className="flex items-center gap-2 overflow-hidden">
            <img
              src="/logo.png"
              alt="DD HRMS"
              className="size-9 shrink-0 rounded-lg object-cover"
            />
            {!collapsed && (
              <span className="whitespace-nowrap text-sm font-semibold tracking-tight">
                DD HRMS
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:flex"
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            // Filter group items; drop any parent whose children all fail
            // the permission check so we never render an empty accordion.
            const visibleItems = group.items
              .filter(isItemEnabled)
              .map((item) =>
                item.children
                  ? { ...item, children: item.children.filter(isItemEnabled) }
                  : item,
              )
              .filter((item) => !item.children || item.children.length > 0);

            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="mb-5">
                {!collapsed && (
                  <h4 className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </h4>
                )}
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <SidebarNode
                      key={item.to ?? item.label}
                      item={item}
                      collapsed={collapsed}
                      expanded={expanded[item.label] ?? false}
                      onToggle={() => toggleExpand(item.label)}
                      onNavigate={(to) => {
                        navigate(to);
                        onMobileClose?.();
                      }}
                      activePath={activePath}
                      isChildActive={isChildActive}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <button
              type="button"
              onClick={() => {
                navigate('/profile');
                onMobileClose?.();
              }}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left hover:bg-accent"
              title="View profile"
            >
              <Avatar name={user?.firstName ?? user?.email ?? 'User'} size="sm" online />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.firstName ?? user?.email ?? 'Guest'}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium',
                        roleBadge.className,
                      )}
                    >
                      {roleBadge.label}
                    </span>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.email ?? ''}
                    </p>
                  </div>
                </div>
              )}
            </button>
            {!collapsed && (
              <button
                onClick={() => logout()}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </button>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}

// ─── Node rendering ───────────────────────────────────────────────

interface NodeProps {
  item: NavItem;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (to: string) => void;
  activePath: string;
  isChildActive: (children?: NavItem[]) => boolean;
}

/**
 * One sidebar row. Two flavours:
 *   1. Leaf  — `item.to` is set → renders a button that navigates.
 *   2. Parent — `item.children` is set → renders a button that toggles
 *      expansion, then the children below.
 *
 * Active state is driven by the parent-computed `activePath` so only ONE
 * leaf highlights at a time — even when multiple `to` values share a prefix.
 */
function SidebarNode({
  item,
  collapsed,
  expanded,
  onToggle,
  onNavigate,
  activePath,
  isChildActive,
}: NodeProps): ReactElement {
  const hasChildren = !!(item.children && item.children.length > 0);
  const childActive = isChildActive(item.children);
  const forceOpen = collapsed ? false : expanded || childActive;

  if (!hasChildren) {
    const isActive = item.to === activePath;
    return (
      <li>
        <button
          type="button"
          onClick={() => onNavigate(item.to!)}
          aria-current={isActive ? 'page' : undefined}
          className={cn(
            'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
          title={collapsed ? item.label : undefined}
        >
          <item.icon className="size-4 shrink-0" />
          {!collapsed && <span className="truncate text-left">{item.label}</span>}
        </button>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={forceOpen}
        className={cn(
          'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          childActive
            ? 'bg-primary/5 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{item.label}</span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                forceOpen ? 'rotate-180' : 'rotate-0',
                childActive && 'text-primary/70',
              )}
            />
          </>
        )}
      </button>

      {!collapsed && (
        <AnimatePresence initial={false}>
          {forceOpen && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="relative ml-4 mt-1 border-l border-border pl-3">
                {item.children!.map((child) => {
                  const childIsActive = child.to === activePath;
                  return (
                    <li key={child.to} className="py-0.5">
                      <button
                        type="button"
                        onClick={() => onNavigate(child.to!)}
                        aria-current={childIsActive ? 'page' : undefined}
                        className={cn(
                          'group flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                          childIsActive
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <child.icon className="size-3.5 shrink-0" />
                        <span className="truncate text-left">{child.label}</span>
                      </button>
                    </li>
                  );
                })}
              </div>
            </motion.ul>
          )}
        </AnimatePresence>
      )}
    </li>
  );
}
