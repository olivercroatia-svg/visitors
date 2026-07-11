import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, ReceiptText, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatEur, formatDate, cn } from '@/lib/utils';
import { useInvoices } from './api';
import { InvoiceStatusBadge } from './badges';

const FILTERS = [
  { key: 'all', label: 'Svi' },
  { key: 'issued', label: 'Izdani' },
  { key: 'draft', label: 'Nacrti' },
  { key: 'cancelled', label: 'Stornirani' },
];

export function InvoicesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const { data: invoices, isLoading } = useInvoices({ status, q });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Računi</h2>
        <Link
          to="/racuni/novi"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" /> Novi
        </Link>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pretraži po broju ili gostu…"
          className="pl-10"
        />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={cn(
              'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              status === f.key ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <Card className="p-6 text-center text-sm text-muted">Učitavanje…</Card>}

      {invoices?.length === 0 && !isLoading && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <ReceiptText className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">{q || status !== 'all' ? 'Nema rezultata.' : 'Još nemate računa.'}</p>
          {!q && status === 'all' && (
            <Link
              to="/racuni/novi"
              className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" /> Izradi prvi račun
            </Link>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {invoices?.map((inv) => (
          <button
            key={inv.id}
            onClick={() => navigate(`/racuni/${inv.id}`)}
            className="w-full text-left"
          >
            <Card className="flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {inv.number_full ?? 'Nacrt'}
                  </span>
                  {inv.doc_type === 'storno' && (
                    <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                      STORNO
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted">
                  {inv.guest_name_cache || 'Krajnji potrošač'}
                  {inv.issue_date && ` · ${formatDate(inv.issue_date)}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tnum text-sm font-semibold text-foreground">
                  {formatEur(Number(inv.total))}
                </span>
                <InvoiceStatusBadge status={inv.status} fiscal={inv.fiscal_status} />
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-2" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
