import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { Brand } from './Brand';
import { RefreshButton } from '@/components/RefreshButton';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { HelpButton } from '@/features/help/HelpButton';

// Top bar. Below lg it shows the clickable brand + refresh (and, on tablet /
// landscape, a hamburger to open the sidebar drawer). On lg+ the pinned sidebar
// carries the brand, so this shows the page title instead.
export function TopBar({ title, onMenuClick }: { title?: string; onMenuClick?: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/90 px-4 backdrop-blur safe-t md:px-8">
      <div className="flex items-center gap-1 lg:hidden">
        <button
          onClick={onMenuClick}
          aria-label="Izbornik"
          className="hidden h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:flex lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" aria-label="Početna">
          <Brand />
        </Link>
        <RefreshButton />
      </div>
      <h1 className="hidden text-lg font-semibold text-foreground lg:block">{title}</h1>
      <div className="flex items-center gap-1">
        <HelpButton />
        <NotificationsBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
