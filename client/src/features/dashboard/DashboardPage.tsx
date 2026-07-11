import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  TrendingUp,
  ReceiptText,
  CalendarClock,
  ArrowRight,
  AlertTriangle,
  CircleAlert,
  CheckCircle2,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSettings } from './useSettings';
import { useOnboarding } from '@/features/onboarding/useOnboarding';
import { useInvoiceStats } from '@/features/invoices/api';
import { Card } from '@/components/ui/Card';
import { cn, formatEur } from '@/lib/utils';

export function DashboardPage() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const { data: onboardingStatus } = useOnboarding();
  const { data: stats } = useInvoiceStats();

  const threshold = settings?.pdvThresholdEur ?? 60000;
  const revenueYtd = stats?.revenue_ytd ?? 0;
  const pct = Math.min(100, Math.round((revenueYtd / threshold) * 100));

  const firstName = user?.full_name?.split(' ')[0] ?? '';
  const onboarding = onboardingStatus?.steps ?? [];
  const complete = onboardingStatus?.canIssueInvoices ?? false;
  const pendingRequired = onboarding.filter((s) => s.required && !s.done).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Dobar dan{firstName ? `, ${firstName}` : ''} 👋</p>
          <h2 className="text-xl font-semibold text-foreground">Pregled poslovanja</h2>
        </div>
        <Link
          to="/racuni/novi"
          className="hidden h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover md:inline-flex"
        >
          <Plus className="h-4 w-4" /> Novi račun
        </Link>
      </div>

      {/* Porezni semafor */}
      <Semafor complete={complete} pendingCount={pendingRequired} />

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Promet (godina)"
          value={formatEur(revenueYtd)}
          tone="primary"
        />
        <StatCard
          icon={<ReceiptText className="h-4 w-4" />}
          label="Izdano računa"
          value={String(stats?.issued_count ?? 0)}
          tone="neutral"
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Fiskalizirano"
          value={`${stats?.fiscalized_count ?? 0} / ${stats?.issued_count ?? 0}`}
          tone="success"
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4" />}
          label="Na čekanju"
          value={String(stats?.pending_fiscal ?? 0)}
          tone={stats && stats.pending_fiscal > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {/* Pending fiscalization alert */}
      {stats && stats.pending_fiscal > 0 && (
        <Link to="/racuni?status=issued" className="block">
          <Card className="flex items-center gap-3 border-warning/30 bg-warning-soft p-3.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
            <p className="flex-1 text-sm text-foreground/80">
              {stats.pending_fiscal} {stats.pending_fiscal === 1 ? 'račun čeka' : 'računa čeka'} naknadnu
              fiskalizaciju.
            </p>
            <ArrowRight className="h-4 w-4 text-warning" />
          </Card>
        </Link>
      )}

      {/* Prag PDV-a */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Prag za ulazak u sustav PDV-a</h3>
            <p className="text-xs text-muted">Godišnji promet u odnosu na zakonski prag</p>
          </div>
          <span className="text-sm font-semibold tabular-nums text-foreground tnum">
            {pct}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              pct >= 95 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <span className="tnum">{formatEur(revenueYtd)}</span>
          <span className="tnum">{formatEur(threshold)}</span>
        </div>
      </Card>

      {/* Onboarding checklist — each item deep-links to the right settings tab */}
      {!complete && onboarding.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <CircleAlert className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Dovršite postavljanje</h3>
              <p className="text-xs text-muted">
                Obavezne stavke morate ispuniti prije prvog računa — time vas štitimo od pogrešaka.
              </p>
            </div>
          </div>
          <ul className="space-y-1">
            {onboarding.map((step) =>
              step.done ? (
                <li key={step.key} className="flex items-center gap-3 px-1 py-2">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  <span className="text-sm text-muted line-through">{step.label}</span>
                </li>
              ) : (
                <li key={step.key}>
                  <Link
                    to={step.href}
                    className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="h-5 w-5 shrink-0 rounded-full border-2 border-input" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm text-foreground">
                        {step.label}
                        {step.required && (
                          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            obavezno
                          </span>
                        )}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-2" />
                  </Link>
                </li>
              ),
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Semafor({ complete, pendingCount }: { complete: boolean; pendingCount: number }) {
  const bg = complete ? 'bg-success-soft' : 'bg-warning-soft';
  const text = complete ? 'text-success' : 'text-warning';

  return (
    <Card className={cn('flex items-center gap-4 p-5', bg, 'border-transparent')}>
      <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-surface', text)}>
        {complete ? <ShieldCheck className="h-6 w-6" /> : <CircleAlert className="h-6 w-6" />}
      </span>
      <div className="flex-1">
        <p className={cn('text-sm font-semibold', text)}>
          {complete ? 'Sve je uredno' : 'Potrebno je vaše djelovanje'}
        </p>
        <p className="text-xs text-foreground/70">
          {complete
            ? 'Vaš profil je potpun i spremni ste za izdavanje računa.'
            : `${pendingCount} ${pendingCount === 1 ? 'stavka čeka' : 'stavki čeka'} da dovršite postavljanje.`}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Dot on={!complete} tone="warning" />
        <Dot on={false} tone="danger" />
        <Dot on={complete} tone="success" />
      </div>
    </Card>
  );
}

function Dot({ on, tone }: { on: boolean; tone: 'success' | 'warning' | 'danger' }) {
  const color = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-danger';
  return <span className={cn('h-2.5 w-2.5 rounded-full', on ? color : 'bg-black/10 dark:bg-white/10')} />;
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'neutral' | 'warning';
}) {
  const iconTone =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'success'
        ? 'text-success'
        : tone === 'warning'
          ? 'text-warning'
          : 'text-muted';
  return (
    <Card className="p-4">
      <div className={cn('mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2', iconTone)}>
        {icon}
      </div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground tnum">{value}</p>
    </Card>
  );
}
