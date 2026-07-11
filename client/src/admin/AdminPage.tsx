import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, SlidersHorizontal, ScrollText, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { AdminOverview } from './AdminOverview';
import { AdminSettings } from './AdminSettings';

const TABS = [
  { key: 'pregled', label: 'Pregled', icon: LayoutDashboard },
  { key: 'postavke', label: 'Postavke', icon: SlidersHorizontal },
  { key: 'zapisi', label: 'Zapisi', icon: ScrollText },
] as const;

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'pregled';

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-accent" />
        <h2 className="text-xl font-semibold text-foreground">Administracija</h2>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setParams({ tab: t.key }, { replace: true })}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
                active === t.key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {active === 'pregled' && <AdminOverview />}
      {active === 'postavke' && <AdminSettings />}
      {active === 'zapisi' && <AdminAudit />}
    </div>
  );
}

function AdminAudit() {
  const { data } = useQuery<any[]>({ queryKey: ['admin', 'audit'], queryFn: () => api.get('/admin/audit') });
  return (
    <Card className="p-0">
      <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Zadnje aktivnosti</p>
      <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
        {data?.map((a, i) => (
          <div key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-foreground">
                <span className="font-medium">{a.action}</span>
                {a.entity && <span className="text-muted"> · {a.entity}</span>}
              </p>
              <p className="truncate text-xs text-muted">
                {a.tenant_name ? `${a.tenant_name} · ` : ''}
                {a.user_name ?? 'sustav'}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-2">{formatDate(a.created_at)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
