import { useEffect, useState, type ReactElement } from 'react';
import { Menu, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from '@/providers/ThemeProvider';
import { Button } from '@/components/ui/button';
import { NotificationDropdown } from './NotificationDropdown';
import { CommandPalette } from '@/components/common/CommandPalette';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps): ReactElement {
  const { resolved, toggle } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);

  // ⌘K / Ctrl+K → open search
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <button
          onClick={onMenuClick}
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden h-9 flex-1 max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:flex"
        >
          <Search className="size-4" />
          <span>Search…</span>
          <kbd className="ml-auto inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>

        <div className="flex-1 sm:hidden" />

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          <NotificationDropdown />

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(true)}
            className="sm:hidden"
            aria-label="Search"
          >
            <Search className="size-4" />
          </Button>
        </div>
      </header>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
