import { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, LogOut } from 'lucide-react';
import { fullNav } from './nav';
import { Brand } from './Brand';
import { RefreshButton } from '@/components/RefreshButton';
import { useAuth } from '@/features/auth/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

// Sidebar. On lg+ it is always visible; below lg it is an off-canvas drawer
// (opened by the TopBar hamburger) with a backdrop. Carries the account +
// logout in its footer, so both are reachable on web/tablet where there is no
// bottom "Više" tab.
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { showInfo } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Close the drawer on navigation and on Escape (no-op when pinned on lg+).
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function onLogout() {
    await logout();
    showInfo('Odjavljeni ste.');
    navigate('/prijava', { replace: true });
  }

  return (
    <>
      {/* Backdrop (drawer mode only) */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform duration-200',
          'lg:z-30 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/" aria-label="Početna">
            <Brand />
          </Link>
          <RefreshButton />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {fullNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted hover:bg-surface-2 hover:text-foreground',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            );
          })}

          {user?.platform_role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-foreground',
                )
              }
            >
              <ShieldAlert className="h-[18px] w-[18px]" />
              Administracija
            </NavLink>
          )}
        </nav>

        {/* Account + logout */}
        <div className="mt-auto flex items-center gap-3 border-t border-border p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
            {user?.full_name?.[0]?.toUpperCase() ?? '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user?.full_name}</p>
            <p className="truncate text-xs text-muted">{user?.email}</p>
          </div>
          <button
            onClick={onLogout}
            aria-label="Odjava"
            title="Odjava"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </aside>
    </>
  );
}
