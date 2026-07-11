import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  TrendingUp,
  CalendarClock,
  Calculator,
  BookText,
  Globe,
  ChevronRight,
  Info,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatEur, formatDate, cn } from '@/lib/utils';
import { useCompliance, useSaveComplianceSettings, type ComplianceOverview } from './api';
import { VatWizard } from './VatWizard';

export function CompliancePage() {
  const { data: c, isLoading } = useCompliance();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (isLoading || !c) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">Porezne obveze</h2>

      <Semafor level={c.level} issueCount={c.issues.length} />

      {c.issues.length > 0 && (
        <div className="space-y-2">
          {c.issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </div>
      )}

      <ThresholdGuard c={c} />
      <VatStatusCard c={c} onChange={() => setWizardOpen(true)} />
      <ReverseChargeCard c={c} />
      <TaxCalendar c={c} />

      {/* Quick tools */}
      <div className="grid grid-cols-2 gap-3">
        <ToolLink to="/kalkulatori" icon={<Calculator className="h-5 w-5" />} label="Kalkulatori" />
        <ToolLink to="/kpr" icon={<BookText className="h-5 w-5" />} label="Knjiga prometa" />
      </div>

      <VatWizard open={wizardOpen} onClose={() => setWizardOpen(false)} current={c.vat.status} />
    </div>
  );
}

function Semafor({ level, issueCount }: { level: ComplianceOverview['level']; issueCount: number }) {
  const map = {
    ok: { bg: 'bg-success-soft', text: 'text-success', icon: ShieldCheck, title: 'Sve je uredno', desc: 'Nema otvorenih poreznih rizika.' },
    warning: { bg: 'bg-warning-soft', text: 'text-warning', icon: ShieldAlert, title: 'Provjerite obveze', desc: `${issueCount} ${issueCount === 1 ? 'stavka traži' : 'stavki traži'} vašu pažnju.` },
    danger: { bg: 'bg-danger-soft', text: 'text-danger', icon: AlertTriangle, title: 'Hitno djelovanje', desc: `${issueCount} ${issueCount === 1 ? 'rizik' : 'rizika'} može dovesti do prekršaja.` },
  }[level];
  const Icon = map.icon;
  return (
    <Card className={cn('flex items-center gap-4 border-transparent p-5', map.bg)}>
      <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-surface', map.text)}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className={cn('text-sm font-semibold', map.text)}>{map.title}</p>
        <p className="text-xs text-foreground/70">{map.desc}</p>
      </div>
    </Card>
  );
}

function IssueRow({ issue }: { issue: ComplianceOverview['issues'][number] }) {
  const tone = issue.severity === 'danger' ? 'text-danger' : 'text-warning';
  const bg = issue.severity === 'danger' ? 'bg-danger-soft' : 'bg-warning-soft';
  const inner = (
    <Card className={cn('flex items-start gap-3 border-transparent p-3.5', bg)}>
      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', tone)}>{issue.title}</p>
        <p className="text-xs text-foreground/70">{issue.detail}</p>
      </div>
      {issue.link && <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />}
    </Card>
  );
  return issue.link ? <Link to={issue.link}>{inner}</Link> : inner;
}

function ThresholdGuard({ c }: { c: ComplianceOverview }) {
  const { pct, revenue_ytd, value, projected_year_end, projected_cross_date } = c.threshold;
  const barColor = pct >= 95 ? 'bg-danger' : pct >= 85 ? 'bg-warning' : 'bg-primary';
  const willCross = projected_year_end >= value;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Čuvar praga PDV-a</h3>
        </div>
        <span className="text-sm font-semibold text-foreground tnum">{pct}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="tnum">{formatEur(revenue_ytd)}</span>
        <span className="tnum">{formatEur(value)}</span>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-xs text-muted">
          Projekcija do kraja godine: <b className="text-foreground tnum">{formatEur(projected_year_end)}</b>.{' '}
          {willCross && projected_cross_date
            ? `Ovim tempom prelazite prag oko ${formatDate(projected_cross_date)} — prelazak znači ulazak u sustav PDV-a i gubitak paušala.`
            : 'Ovim tempom ostajete ispod praga.'}
        </p>
      </div>
    </Card>
  );
}

function VatStatusCard({ c, onChange }: { c: ComplianceOverview; onChange: () => void }) {
  const isPayer = c.vat.status === 'obveznik';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Status u sustavu PDV-a</p>
          <div className="mt-1">
            <Badge tone={isPayer ? 'info' : 'success'}>{isPayer ? 'Obveznik PDV-a' : 'Nije obveznik'}</Badge>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onChange}>
          Promijeni
        </Button>
      </div>
      {c.vat.pending_change && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-info-soft p-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-xs text-foreground/80">
            Zakazana promjena: postajete{' '}
            <b>{c.vat.pending_change.to_status === 'obveznik' ? 'obveznik PDV-a' : 'izvan sustava PDV-a'}</b> od{' '}
            {formatDate(c.vat.pending_change.effective_date)}.
          </p>
        </div>
      )}
    </Card>
  );
}

function ReverseChargeCard({ c }: { c: ComplianceOverview }) {
  const save = useSaveComplianceSettings();
  const { showSuccess, showError } = useToast();
  const [usesForeign, setUsesForeign] = useState(c.reverse_charge.uses_foreign_platforms);
  const [hasVatId, setHasVatId] = useState(c.reverse_charge.has_vat_id);
  useEffect(() => {
    setUsesForeign(c.reverse_charge.uses_foreign_platforms);
    setHasVatId(c.reverse_charge.has_vat_id);
  }, [c.reverse_charge]);

  async function persist(next: { usesForeign: boolean; hasVatId: boolean }) {
    try {
      await save.mutateAsync({
        uses_foreign_platforms: next.usesForeign,
        has_vat_id: next.hasVatId,
        beds_count: c.profile.beds_count,
        flat_tax_per_bed_eur: c.profile.flat_tax_per_bed_eur,
      });
      showSuccess('Spremljeno.');
    } catch (err) {
      showError('Greška pri spremanju.');
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Provizije stranih platformi</h3>
      </div>
      <div className="space-y-2.5">
        <Toggle
          label="Plaćam proviziju Bookingu / Airbnbu"
          checked={usesForeign}
          onChange={(v) => {
            setUsesForeign(v);
            persist({ usesForeign: v, hasVatId });
          }}
        />
        {usesForeign && (
          <Toggle
            label="Imam PDV ID broj (HR + OIB)"
            checked={hasVatId}
            onChange={(v) => {
              setHasVatId(v);
              persist({ usesForeign, hasVatId: v });
            }}
          />
        )}
      </div>
      {c.reverse_charge.warning && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <p className="text-xs text-foreground/80">
            Za provizije stranim platformama obično trebate <b>PDV ID broj</b> te obračunati i platiti 25% PDV-a
            na proviziju (mjesečni PDV i PDV-S obrazac do 20. u mjesecu). Ovo je čest previd — provjerite s
            knjigovođom.
          </p>
        </div>
      )}
    </Card>
  );
}

function TaxCalendar({ c }: { c: ComplianceOverview }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Porezni kalendar</h3>
      </div>
      {c.obligations.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nema obveza u sljedećih 120 dana.</p>
      ) : (
        <div className="space-y-1">
          {c.obligations.map((o) => {
            const urgent = o.days_until <= 7;
            const soon = o.days_until <= 21;
            return (
              <div key={o.key} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{o.title}</p>
                  <p className="truncate text-xs text-muted">{o.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-foreground">{formatDate(o.due_date)}</p>
                  <span
                    className={cn(
                      'text-[11px] font-medium',
                      urgent ? 'text-danger' : soon ? 'text-warning' : 'text-muted',
                    )}
                  >
                    za {o.days_until} {o.days_until === 1 ? 'dan' : 'dana'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-2">{c.calendar_disclaimer}</p>
    </Card>
  );
}

function ToolLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to}>
      <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-surface-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
      </Card>
    </Link>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-sm text-foreground">{label}</span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}
