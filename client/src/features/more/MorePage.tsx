import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, ShieldAlert, Moon, Sun } from 'lucide-react';
import { fullNav } from '@/components/layout/nav';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

export function MorePage() {
  const { user, profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { showInfo } = useToast();

  const profileLabel =
    profile?.type === 'pausalni_obrt' ? 'Paušalni obrt' : 'Privatni iznajmljivač';

  async function onLogout() {
    await logout();
    showInfo('Odjavljeni ste.');
    navigate('/prijava', { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* Account */}
      <Card className="flex items-center gap-3 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
          {user?.full_name?.[0]?.toUpperCase() ?? '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{user?.full_name}</p>
          <p className="truncate text-xs text-muted">{user?.email}</p>
          <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
            {profileLabel}
          </span>
        </div>
      </Card>

      {/* Navigation list */}
      <Card className="divide-y divide-border overflow-hidden p-0">
        {fullNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
            >
              <Icon className="h-5 w-5 text-muted" />
              <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-2" />
            </Link>
          );
        })}
        {user?.platform_role === 'admin' && (
          <Link
            to="/admin"
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
          >
            <ShieldAlert className="h-5 w-5 text-accent" />
            <span className="flex-1 text-sm font-medium text-foreground">Administracija</span>
            <ChevronRight className="h-4 w-4 text-muted-2" />
          </Link>
        )}
      </Card>

      {/* Preferences */}
      <Card className="p-0">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5 text-muted" />
          ) : (
            <Moon className="h-5 w-5 text-muted" />
          )}
          <span className="flex-1 text-left text-sm font-medium text-foreground">
            {theme === 'dark' ? 'Svijetla tema' : 'Tamna tema'}
          </span>
        </button>
      </Card>

      <button
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3.5 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
      >
        <LogOut className="h-4 w-4" /> Odjava
      </button>

      <p className="pt-2 text-center text-xs text-muted-2">Visitors · verzija 0.1</p>
    </div>
  );
}
