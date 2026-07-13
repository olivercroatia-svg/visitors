import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useEvisitorMutation } from '@/features/evisitor/api';
import { useStay, useStayMutation } from './api';
import { EvisitorBadge, StayStatusBadge } from './badges';

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fmt(value: string | null): string {
  return value ? value.slice(0, 16).replace('T', ' ') : '—';
}

export function StayDetailPage() {
  const { id } = useParams();
  const stayId = Number(id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const stay = useStay(stayId);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  const [checkOutAt, setCheckOutAt] = useState(nowLocal());

  const checkOut = useStayMutation((at: string) =>
    api.post(`/stays/${stayId}/check-out`, { check_out_at: at }),
  );
  const cancel = useStayMutation((reason: string) =>
    api.post(`/stays/${stayId}/cancel`, { reason }),
  );
  const retry = useStayMutation(() => api.post(`/stays/${stayId}/retry`, {}));
  const ack = useEvisitorMutation((msgId: number) => api.post(`/evisitor/messages/${msgId}/ack`, {}));

  if (stay.isLoading) return <p className="text-sm text-muted">Učitavanje…</p>;
  if (!stay.data) return <p className="text-sm text-muted">Boravak nije pronađen.</p>;

  const s = stay.data;
  const openMessages = s.messages.filter((m) => !m.acknowledged_at);

  const doCheckOut = async () => {
    try {
      await checkOut.mutateAsync(checkOutAt);
      setCheckOutOpen(false);
      showSuccess('Gost je odjavljen.');
      stay.refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Odjava nije uspjela.');
    }
  };

  const doCancel = async () => {
    const ok = await confirm({
      title: 'Poništiti prijavu?',
      message: 'Prijava će biti poništena u eVisitoru. Ova radnja se ne može vratiti.',
      confirmLabel: 'Poništi prijavu',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync('Poništeno iz aplikacije');
      showSuccess('Prijava je poništena.');
      stay.refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Poništenje nije uspjelo.');
    }
  };

  const doRetry = async () => {
    try {
      await retry.mutateAsync(undefined as never);
      showSuccess('Zahtjev je ponovno poslan.');
      stay.refetch();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Ponovno slanje nije uspjelo.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/boravci')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground">
          {s.guest_name}
        </h2>
        <StayStatusBadge status={s.status} evisitor={s.evisitor_status} />
      </div>

      {/* Ch. 4.4.6 — eVisitor's own words, verbatim. Never shortened, never translated. */}
      {openMessages.length > 0 && (
        <Card className="border-danger/40 bg-danger-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-danger">
              <AlertTriangle className="h-4 w-4" />
              Poruke sustava eVisitor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {openMessages.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 rounded-lg bg-surface p-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <p className="text-sm text-foreground">{m.message}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => ack.mutate(m.id)}
                  className="shrink-0"
                >
                  Označi kao riješeno
                </Button>
              </div>
            ))}
            {(s.evisitor_status === 'failed' || s.evisitor_status === 'pending') && (
              <Button onClick={doRetry} loading={retry.isPending} size="sm">
                <RefreshCw className="h-4 w-4" />
                Pokušaj ponovno
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Boravak</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Objekt" value={`${s.object_name} (${s.facility_code})`} />
          <Row label="Dolazak" value={fmt(s.check_in_at)} />
          <Row label="Predviđeni odlazak" value={fmt(s.foreseen_check_out_at)} />
          <Row label="Stvarni odlazak" value={fmt(s.check_out_at)} />
          <Row label="Kategorija BP" value={s.tt_category} />
          <Row label="Vrsta usluge" value={s.service_type} />
          <Row label="Status u eVisitoru" value={<EvisitorBadge status={s.evisitor_status} />} />
          <Row
            label="ID prijave (eVisitor)"
            value={<span className="break-all font-mono text-xs">{s.evisitor_id ?? '—'}</span>}
          />
          {s.cancelled_reason && <Row label="Razlog poništenja" value={s.cancelled_reason} />}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {s.status === 'checked_in' && (
          <Button onClick={() => setCheckOutOpen(true)}>Odjavi gosta</Button>
        )}
        {s.status !== 'cancelled' && s.status !== 'checked_out' && (
          <Button variant="ghost" onClick={doCancel} loading={cancel.isPending}>
            Poništi prijavu
          </Button>
        )}
        {openMessages.length === 0 && s.evisitor_status !== 'confirmed' && s.status !== 'cancelled' && (
          <Button variant="ghost" onClick={doRetry} loading={retry.isPending}>
            <RefreshCw className="h-4 w-4" />
            Pošalji u eVisitor
          </Button>
        )}
      </div>

      <Modal
        open={checkOutOpen}
        onClose={() => setCheckOutOpen(false)}
        title="Odjava gosta"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCheckOutOpen(false)}>
              Odustani
            </Button>
            <Button onClick={doCheckOut} loading={checkOut.isPending}>
              Odjavi
            </Button>
          </>
        }
      >
        <Field
          label="Stvarni datum i vrijeme odlaska"
          hint="Mora biti stvarno vrijeme odlaska gosta, a ne trenutak unosa. eVisitor očekuje odjavu unutar 24 sata."
        >
          <Input
            type="datetime-local"
            value={checkOutAt}
            onChange={(e) => setCheckOutAt(e.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
