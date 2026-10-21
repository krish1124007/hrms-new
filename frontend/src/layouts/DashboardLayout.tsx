import { useState, type ReactElement } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { PageTransition } from '@/components/common/PageTransition';
import { ShortcutHelp } from '@/components/common/ShortcutHelp';
import { useShortcut } from '@/hooks/use-shortcut';
import { usePermissions } from '@/hooks/use-permissions';
import { NAV_ACCESS } from '@/config/navigation';
import { useNavigate } from 'react-router-dom';

export function DashboardLayout(): ReactElement {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { hasAny } = usePermissions();
  const enabledModules: string[] | undefined = undefined;

  // Gmail-style two-key navigation shortcuts. These are the universe of
  // "jump to X" hotkeys; pages can register their own in-context ones.
  // Each is bound only for users whose route guard (same NAV_ACCESS list)
  // would let them in — otherwise it would just bounce them with a toast.
  useShortcut('g d', () => navigate('/dashboard'), { label: 'Go to dashboard', group: 'Navigation' });
  useShortcut('g e', () => navigate('/employees'), {
    label: 'Go to employees',
    group: 'Navigation',
    enabled: hasAny(NAV_ACCESS.employees),
  });
  useShortcut('g s', () => navigate('/settings'), {
    label: 'Go to settings',
    group: 'Navigation',
    enabled: hasAny(NAV_ACCESS.settings),
  });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        enabledModules={enabledModules}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <PageTransition pageKey={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>

        {/* Keyboard shortcut help dialog — bound to `?` via useShortcut */}
        <ShortcutHelp />
      </div>
    </div>
  );
}
