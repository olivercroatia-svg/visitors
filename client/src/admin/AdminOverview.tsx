import { useNavigate } from 'react-router-dom';
import { Building2, ReceiptText, TrendingUp, Activity, ShieldCheck, AlertTriangle, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatEur, formatDate, cn } from '@/lib/utils';
import { useAdminStats, useTenants, useHealth } from './api';

export function AdminOverview() {
  const { data: stats } = useAdminStats();
  const { data: tenants } = useTenants();
  const { data: health } = useHealth();
  const navigate = useNavigate();

  return (
    <div className="space-y-5">
      {/* Platform KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Building2 className="h-4 w-4" />} label="Korisnici" value={String(stats?.tenants ?? 0)} tone="primary" />
        <Kpi icon={<ReceiptText className="h-4 w-4" />} label="Računi" value={String(stats?.invoices ?? 0)} />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Promet (svi)" value={formatEur(stats?.revenue ?? 0)} />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Aktivni (7d)" value={String(stats?.active_7d ?? 0)} />
      </div>

      {/* Fiscal health */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Zdravlje fiskalizacije</h3>
        <div className="grid grid-cols-3 gap-3">
          <HealthStat label="Fiskalizirano" value={stats?.fiscalized ?? 0} tone="success" icon={<ShieldCheck className="h-4 w-4" />} />
          <HealthStat label="Na čekanju" value={stats?.pending_fiscal ?? 0} tone={stats?.pending_fiscal ? 'warning' : 'neutral'} icon={<AlertTriangle className="h-4 w-4" />} />
          <HealthStat label="Greške" value={stats?.failed_fiscal ?? 0} tone={stats?.failed_fiscal ? 'danger' : 'neutral'} icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
        {health && health.problem_requests.length > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-border pt-3">
            {health.problem_requests.slice(0, 5).map((p) => (
              <div key={p.invoice_id} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{p.number_full}</span>
                <span className="truncate text-muted">{p.last_error ?? 'na čekanju'} · {p.attempts}×</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Tenants table */}
      <Card className="p-0">
        <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Korisnici platforme</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-4 py-2.5 font-medium">Naziv</th>
                <th className="px-4 py-2.5 font-medium">Vlasnik</th>
                <th className="px-4 py-2.5 font-medium">Tip</th>
                <th className="px-4 py-2.5 text-right font-medium">Računa</th>
                <th className="px-4 py-2.5 text-right font-medium">Promet</th>
                <th className="px-4 py-2.5 font-medium">Zadnja prijava</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {tenants?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/admin/korisnici/${t.id}`)}
                  className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {t.name}
                    {t.pending_fiscal > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warning" />}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{t.owner_email}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={t.vat_status === 'obveznik' ? 'info' : 'neutral'}>
                      {t.type === 'pausalni_obrt' ? 'Obrt' : 'Iznajmljivač'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right tnum">{t.invoice_count}</td>
                  <td className="px-4 py-2.5 text-right tnum font-medium text-foreground">{formatEur(t.revenue)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{t.last_login_at ? formatDate(t.last_login_at) : '—'}</td>
                  <td className="px-2 text-muted-2"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'primary' }) {
  return (
    <Card className="p-4">
      <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2', tone === 'primary' ? 'text-primary' : 'text-muted')}>
        {icon}
      </div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground tnum">{value}</p>
    </Card>
  );
}

function HealthStat({ label, value, tone, icon }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' | 'neutral'; icon: React.ReactNode }) {
  const color = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-muted' }[tone];
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className={cn('mb-1 flex items-center gap-1.5', color)}>
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold text-foreground tnum">{value}</p>
    </div>
  );
}
