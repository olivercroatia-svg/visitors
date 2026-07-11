import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, BookText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { formatEur, formatDate } from '@/lib/utils';

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

export function KprPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const { data } = useQuery<{ year: number; entries: KprEntry[] }>({
    queryKey: ['kpr', year],
    queryFn: () => api.get(`/kpr?year=${year}`),
  });
  const entries = data?.entries ?? [];
  const totals = entries.reduce(
    (a, e) => ({ cash: a.cash + e.cash, cashless: a.cashless + e.cashless, total: a.total + e.total }),
    { cash: 0, cashless: 0, total: 0 },
  );

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

      <div className="flex gap-2">
        <a
          href={`/api/kpr/pdf?year=${year}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <FileText className="h-4 w-4" /> PDF
        </a>
        <a
          href={`/api/kpr/csv?year=${year}`}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2"
        >
          <Download className="h-4 w-4" /> Excel / CSV
        </a>
      </div>

      {entries.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <BookText className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">Nema prometa za {year}. godinu.</p>
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
