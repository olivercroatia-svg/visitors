import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, FileSpreadsheet, BookText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { downloadFile } from '@/lib/download';
import { formatEur, formatDate, cn } from '@/lib/utils';

interface KprEntry {
  rb: number;
  date: string;
  number_full: string;
  description: string;
  cash: number;
  cashless: number;
  total: number;
  cumulative: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

// Flat-rate tax is paid quarterly, so the quarters are the shortcut worth having.
// The range always stays inside the selected year — Rb and Kumulativ are counted
// from 1 January regardless, so a filtered view is a window into the year's book,
// not a book of its own.
type Period = 'year' | 'q1' | 'q2' | 'q3' | 'q4' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'year', label: 'Cijela godina' },
  { key: 'q1', label: 'Q1' },
  { key: 'q2', label: 'Q2' },
  { key: 'q3', label: 'Q3' },
  { key: 'q4', label: 'Q4' },
  { key: 'custom', label: 'Prilagođeno' },
];

const QUARTERS: Record<string, [string, string]> = {
  q1: ['01-01', '03-31'],
  q2: ['04-01', '06-30'],
  q3: ['07-01', '09-30'],
  q4: ['10-01', '12-31'],
};

export function KprPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [period, setPeriod] = useState<Period>('year');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });

  // Quarters are derived from the selected year, so changing the year keeps the quarter.
  const range = useMemo<{ from?: string; to?: string }>(() => {
    if (period === 'year') return {};
    if (period === 'custom') return { from: custom.from || undefined, to: custom.to || undefined };
    const [from, to] = QUARTERS[period];
    return { from: `${year}-${from}`, to: `${year}-${to}` };
  }, [period, custom, year]);

  // One query string, reused by the table and all three exports.
  const qs = useMemo(() => {
    const p = new URLSearchParams({ year: String(year) });
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return `?${p.toString()}`;
  }, [year, range]);

  const { data } = useQuery<{ year: number; entries: KprEntry[] }>({
    queryKey: ['kpr', year, range.from, range.to],
    queryFn: () => api.get(`/kpr${qs}`),
  });
  const entries = data?.entries ?? [];
  const totals = entries.reduce(
    (a, e) => ({ cash: a.cash + e.cash, cashless: a.cashless + e.cashless, total: a.total + e.total }),
    { cash: 0, cashless: 0, total: 0 },
  );
  const { showError } = useToast();

  const fileStem =
    range.from && range.to ? `kpr-${range.from}_${range.to}` : `kpr-${year}`;

  async function save(kind: 'xlsx' | 'csv') {
    try {
      await downloadFile(`/kpr/${kind}${qs}`, `${fileStem}.${kind}`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Preuzimanje nije uspjelo.');
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/obveze" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Porezne obveze
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Knjiga prometa</h2>
        <div className="w-28">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}.
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Razdoblje */}
      <div className="space-y-2">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                period === p.key
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted hover:bg-surface-2',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              Od
              <input
                type="date"
                value={custom.from}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted">
              Do
              <input
                type="date"
                value={custom.to}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm text-foreground"
              />
            </label>
          </div>
        )}

        {(range.from || range.to) && (
          <p className="text-xs text-muted">
            Redni broj i kumulativ i dalje se računaju od 1. siječnja {year}.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <a
          href={`/api/kpr/pdf${qs}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <FileText className="h-4 w-4" /> PDF
        </a>
        <button
          onClick={() => save('xlsx')}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </button>
        <button
          onClick={() => save('csv')}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <BookText className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">
            {range.from || range.to
              ? 'Nema prometa u odabranom razdoblju.'
              : `Nema prometa za ${year}. godinu.`}
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-3 py-2.5 font-medium">Rb</th>
                  <th className="px-3 py-2.5 font-medium">Datum</th>
                  <th className="px-3 py-2.5 font-medium">Broj</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gotovina</th>
                  <th className="px-3 py-2.5 text-right font-medium">Bezgot.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ukupno</th>
                  <th className="px-3 py-2.5 text-right font-medium">Kumulativ</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.rb} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 text-muted">{e.rb}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatDate(e.date)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-foreground">{e.number_full}</td>
                    <td className="px-3 py-2.5 text-right tnum">{formatEur(e.cash)}</td>
                    <td className="px-3 py-2.5 text-right tnum">{formatEur(e.cashless)}</td>
                    <td className="px-3 py-2.5 text-right tnum font-medium text-foreground">{formatEur(e.total)}</td>
                    <td className="px-3 py-2.5 text-right tnum text-muted">{formatEur(e.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold text-foreground">
                  <td className="px-3 py-2.5" colSpan={3}>
                    UKUPNO
                  </td>
                  <td className="px-3 py-2.5 text-right tnum">{formatEur(totals.cash)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{formatEur(totals.cashless)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{formatEur(totals.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
