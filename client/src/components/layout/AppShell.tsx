import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { TopBar } from './TopBar';
import { fullNav } from './nav';

function titleForPath(pathname: string): string {
  const match = fullNav.find((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to)));
  return match?.label ?? 'Visitors';
}

// App layout: pinned sidebar + top bar on web (lg+); on tablet / landscape the
// sidebar collapses into a hamburger drawer; on mobile portrait the bottom nav
// takes over. Content is bottom-padded so the FAB never covers it.
export function AppShell() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <TopBar title={titleForPath(pathname)} onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
