import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BedDouble, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { useObjects, useOpenMessages } from '@/features/evisitor/api';
import { useStays } from './api';
import { StayStatusBadge } from './badges';

const STATUS_FILTERS = [
  { value: '', label: 'Svi statusi' },
  { value: 'checked_in', label: 'Prijavljeni' },
  { value: 'checked_out', label: 'Odjavljeni' },
  { value: 'draft', label: 'Nacrti' },
  { value: 'cancelled', label: 'Poništeni' },
];

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace('T', ' ');
}

export function StaysPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [objectId, setObjectId] = useState('');
  const [q, setQ] = useState('');

  const objects = useObjects();
  const messages = useOpenMessages();
  const stays = useStays({
    status: status || undefined,
    object_id: objectId ? Number(objectId) : undefined,
    q: q.trim() || undefined,
  });

  const openMessages = messages.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">Boravci</h2>
        <Button onClick={() => navigate('/boravci/prijava')}>
          <Plus className="h-4 w-4" />
          Nova prijava
        </Button>
      </div>

      {/* Ch. 4.4.6: eVisitor's system messages must reach the user, not just a log file. */}
      {openMessages.length > 0 && (
        <Card className="border-danger/40 bg-danger-soft">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-danger">
                eVisitor je vratio {openMessages.length}{' '}
                {openMessages.length === 1 ? 'poruku' : 'poruka'} koje treba riješiti
              </p>
              <ul className="mt-1 space-y-0.5">
                {openMessages.slice(0, 3).map((m) => (
                  <li key={m.id} className="truncate text-xs text-danger/90">
                    {m.stay_id ? (
                      <Link to={`/boravci/${m.stay_id}`} className="underline underline-offset-2">
                        {m.guest_name ? `${m.guest_name}: ` : ''}
                        {m.message}
                      </Link>
                    ) : (
                      m.message
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Traži gosta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={objectId} onChange={(e) => setObjectId(e.target.value)}>
          <option value="">Svi objekti</option>
          {(objects.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>

      {stays.isLoading ? (
        <p className="text-sm text-muted">Učitavanje…</p>
      ) : (stays.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <BedDouble className="h-8 w-8 text-muted" />
            <p className="text-sm text-muted">
              Još nema prijavljenih boravaka. Prijavite prvog gosta u eVisitor.
            </p>
            <Button onClick={() => navigate('/boravci/prijava')}>
              <Plus className="h-4 w-4" />
              Nova prijava
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(stays.data ?? []).map((s) => (
            <Link key={s.id} to={`/boravci/${s.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{s.guest_name}</p>
                    <p className="truncate text-xs text-muted">
                      {s.object_name} · {formatDateTime(s.check_in_at)} →{' '}
                      {formatDateTime(s.check_out_at ?? s.foreseen_check_out_at)}
                    </p>
                    {s.last_error && (
                      <p className="mt-1 truncate text-xs text-danger">{s.last_error}</p>
                    )}
                  </div>
                  <StayStatusBadge status={s.status} evisitor={s.evisitor_status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
