import { useMemo, useState } from 'react';
import {
  TrendingUp,
  ReceiptText,
  Users,
  Moon,
  BarChart3,
  Table as TableIcon,
  FileSpreadsheet,
  FileText,
  Download,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { formatEur, cn } from '@/lib/utils';
import { usePremises } from '@/features/settings/api';
import { useAnalytics, buildQuery, PAYMENT_LABEL, CATEGORY_LABEL, type AnalyticsFilters } from './api';
import { MonthlyRevenueChart, PaymentDonut, HBarList } from './charts';

type Preset = 'month' | 'quarter' | 'year' | 'all' | 'custom';

function presetRange(preset: Preset): { from?: string; to?: string } {
  const now = new Date();
  const y = now.getFullYear();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = iso(now);
  switch (preset) {
    case 'month':
      return { from: `${y}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
    case 'quarter': {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      return { from: `${y}-${String(qStart + 1).padStart(2, '0')}-01`, to: today };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today };
    default:
      return {};
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'Mjesec' },
  { key: 'quarter', label: 'Kvartal' },
  { key: 'year', label: 'Godina' },
  { key: 'all', label: 'Sve' },
];

export function AnalyticsPage() {
  const { data: premises } = usePremises();
  const [preset, setPreset] = useState<Preset>('year');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [premiseId, setPremiseId] = useState<number | ''>('');
  const [payment, setPayment] = useState('all');
  const [view, setView] = useState<'charts' | 'table'>('charts');

  const filters: AnalyticsFilters = useMemo(() => {
    const range = preset === 'custom' ? { from: custom.from || undefined, to: custom.to || undefined } : presetRange(preset);
    return {
      ...range,
      premise_id: premiseId || undefined,
      payment_method: payment !== 'all' ? payment : undefined,
    };
  }, [preset, custom, premiseId, payment]);

  const { data: a, isLoading } = useAnalytics(filters);
  const qs = buildQuery(filters);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Analitika</h2>
        <div className="flex rounded-lg border border-border p-0.5">
          <ViewBtn active={view === 'charts'} onClick={() => setView('charts')} icon={<BarChart3 className="h-4 w-4" />} />
          <ViewBtn active={view === 'table'} onClick={() => setView('table')} icon={<TableIcon className="h-4 w-4" />} />
        </div>
      </div>

      {/* Filters */}
      <Card className="space-y-3 p-4">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={cn(
                'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                preset === p.key ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPreset('custom')}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              preset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted hover:text-foreground',
            )}
          >
            Prilagođeno
          </button>
        </div>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="h-10 rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
            />
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="h-10 rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Select value={premiseId} onChange={(e) => setPremiseId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Svi prostori</option>
            {premises?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="all">Sva plaćanja</option>
            {Object.entries(PAYMENT_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {/* Exports */}
      <div className="flex gap-2">
        <ExportLink href={`/api/analytics/export.xlsx${qs}`} icon={<FileSpreadsheet className="h-4 w-4" />} label="Excel" />
        <ExportLink href={`/api/analytics/export.csv${qs}`} icon={<Download className="h-4 w-4" />} label="CSV" />
        <ExportLink href={`/api/analytics/export.pdf${qs}`} icon={<FileText className="h-4 w-4" />} label="PDF" newTab />
      </div>

      {isLoading || !a ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Promet" value={formatEur(a.kpis.revenue)} tone="primary" />
            <Kpi icon={<ReceiptText className="h-4 w-4" />} label="Računa" value={String(a.kpis.invoice_count)} />
            <Kpi icon={<Users className="h-4 w-4" />} label="Gosti" value={String(a.kpis.unique_guests)} />
            <Kpi icon={<Moon className="h-4 w-4" />} label="Noćenja" value={String(a.kpis.total_nights)} />
          </div>

          {view === 'charts' ? (
            <ChartsView a={a} />
          ) : (
            <TableView a={a} />
          )}
        </>
      )}
    </div>
  );
}

function ChartsView({ a }: { a: NonNullable<ReturnType<typeof useAnalytics>['data']> }) {
  return (
    <div className="space-y-4">
      <Section title="Promet po mjesecu">
        <MonthlyRevenueChart data={a.by_month} />
      </Section>

      {a.by_payment.length > 0 && (
        <Section title="Po načinu plaćanja">
          <PaymentDonut data={a.by_payment.map((p) => ({ ...p, label: PAYMENT_LABEL[p.method] ?? p.method }))} />
        </Section>
      )}

      <Section title="Promet po prostoru">
        <HBarList data={a.by_premise.map((p) => ({ label: p.premise, sub: `(${p.code})`, value: p.revenue }))} />
      </Section>

      <Section title="Po poreznoj kategoriji">
        <HBarList data={a.by_category.map((c) => ({ label: CATEGORY_LABEL[c.category] ?? c.category, value: c.revenue }))} />
      </Section>

      <Section title="Najbolji gosti">
        <HBarList
          data={a.top_guests.map((g) => ({ label: g.guest, sub: `${g.count}×`, value: g.revenue }))}
          emptyLabel="Nema evidentiranih gostiju."
        />
      </Section>
    </div>
  );
}

function TableView({ a }: { a: NonNullable<ReturnType<typeof useAnalytics>['data']> }) {
  return (
    <div className="space-y-4">
      <DataTable title="Promet po mjesecu" head={['Mjesec', 'Promet', 'Računa']} rows={a.by_month.map((m) => [m.month, formatEur(m.revenue), String(m.count)])} />
      <DataTable title="Po načinu plaćanja" head={['Način', 'Promet', 'Računa']} rows={a.by_payment.map((p) => [PAYMENT_LABEL[p.method] ?? p.method, formatEur(p.revenue), String(p.count)])} />
      <DataTable title="Promet po prostoru" head={['Prostor', 'Promet', 'Računa']} rows={a.by_premise.map((p) => [`${p.premise} (${p.code})`, formatEur(p.revenue), String(p.count)])} />
      <DataTable title="Najbolji gosti" head={['Gost', 'Promet', 'Računa']} rows={a.top_guests.map((g) => [g.guest, formatEur(g.revenue), String(g.count)])} />
    </div>
  );
}

function DataTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <Card className="p-0">
      <p className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              {head.map((h, i) => (
                <th key={i} className={cn('px-4 py-2 font-medium', i > 0 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={head.length} className="px-4 py-4 text-center text-muted">
                  Nema podataka.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  {r.map((c, j) => (
                    <td key={j} className={cn('px-4 py-2', j > 0 && 'text-right tnum')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </Card>
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

function ViewBtn({ active, onClick, icon }: { active: boolean; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex h-8 w-9 items-center justify-center rounded-md transition-colors', active ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground')}
    >
      {icon}
    </button>
  );
}

function ExportLink({ href, icon, label, newTab }: { href: string; icon: React.ReactNode; label: string; newTab?: boolean }) {
  return (
    <a
      href={href}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-surface-2"
    >
      {icon} {label}
    </a>
  );
}
