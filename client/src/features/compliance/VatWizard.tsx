import { useState } from 'react';
import { ArrowRight, Info } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useChangeVatStatus, type VatStatus } from './api';

// Guided VAT-status transition. The effective date is the key input — invoices
// on/after it carry VAT, before it don't (server freezes per issue date).
export function VatWizard({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: VatStatus;
}) {
  const change = useChangeVatStatus();
  const { showSuccess, showError } = useToast();
  const target: VatStatus = current === 'obveznik' ? 'nije_obveznik' : 'obveznik';
  const becomingPayer = target === 'obveznik';

  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  async function submit() {
    try {
      await change.mutateAsync({ to_status: target, effective_date: effectiveDate, reason: reason || null });
      showSuccess('Status u sustavu PDV-a je ažuriran.');
      onClose();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Promjena nije uspjela.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      title="Promjena statusa u sustavu PDV-a"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={change.isPending}>
            Odustani
          </Button>
          <Button onClick={submit} loading={change.isPending}>
            Potvrdi promjenu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 rounded-xl bg-surface-2 p-3">
          <StatusPill status={current} muted />
          <ArrowRight className="h-4 w-4 text-muted" />
          <StatusPill status={target} />
        </div>

        <div className="flex items-start gap-2.5 rounded-xl bg-info-soft p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="text-xs text-foreground/80">
            {becomingPayer
              ? 'Ulaskom u sustav PDV-a računi od odabranog datuma obračunavaju PDV. Prije nego što ovo napravite, kod Porezne predajete zahtjev (P-PDV). Postojeći računi ostaju nepromijenjeni.'
              : 'Izlaskom iz sustava PDV-a računi od odabranog datuma više ne obračunavaju PDV, uz zakonsku klauzulu. Provjerite uvjete izlaska s knjigovođom.'}
          </p>
        </div>

        <Field label="Datum stupanja na snagu" hint="Računi izdani na ovaj datum i kasnije koriste novi status.">
          <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </Field>
        <Field label="Razlog (opcionalno)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Npr. prelazak praga prometa" />
        </Field>
      </div>
    </Modal>
  );
}

function StatusPill({ status, muted }: { status: VatStatus; muted?: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-sm font-medium',
        muted
          ? 'bg-surface text-muted'
          : status === 'obveznik'
            ? 'bg-info-soft text-info'
            : 'bg-success-soft text-success',
      )}
    >
      {status === 'obveznik' ? 'Obveznik PDV-a' : 'Nije obveznik'}
    </span>
  );
}
