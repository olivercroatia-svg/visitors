import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Receipt, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Field } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { formatEur, cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePremises, useServices, VAT_CATEGORIES, SERVICE_UNITS } from '@/features/settings/api';
import type { Guest } from '@/features/guests/GuestsPage';
import { useIssueInvoice, PAYMENT_METHODS, type NewInvoiceItem, type PaymentMethod } from './api';

interface Row extends NewInvoiceItem {
  key: number;
}
let rowKey = 1;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function InvoiceForm() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { showError } = useToast();
  const { data: premises } = usePremises();
  const { data: services } = useServices();
  const { data: guests } = useQuery<Guest[]>({ queryKey: ['guests', ''], queryFn: () => api.get('/guests') });
  const issue = useIssueInvoice();

  const vatApplicable = profile?.vat_status === 'obveznik';

  const [premiseId, setPremiseId] = useState<number | null>(null);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [guestId, setGuestId] = useState<number | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('gotovina');
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default to the first premise + its first device.
  useEffect(() => {
    if (premiseId == null && premises && premises.length > 0) {
      setPremiseId(premises[0].id);
    }
  }, [premises, premiseId]);
  const activePremise = premises?.find((p) => p.id === premiseId) ?? null;
  useEffect(() => {
    if (activePremise) {
      const stillValid = activePremise.devices.some((d) => d.id === deviceId);
      if (!stillValid) setDeviceId(activePremise.devices[0]?.id ?? null);
    }
  }, [activePremise, deviceId]);

  function addBlankRow() {
    setRows((r) => [
      ...r,
      { key: rowKey++, description: '', quantity: 1, unit: 'noć', unit_price: 0, vat_category: 'smjestaj' },
    ]);
  }
  function addServiceRow(serviceId: number) {
    const s = services?.find((x) => x.id === serviceId);
    if (!s) return;
    setRows((r) => [
      ...r,
      {
        key: rowKey++,
        description: s.name,
        quantity: 1,
        unit: s.unit,
        unit_price: Number(s.default_price),
        vat_category: s.vat_category,
      },
    ]);
  }
  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((row) => row.key !== key));
  }

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const it of rows) {
      const base = round2(it.quantity * it.unit_price);
      const rate = vatApplicable ? VAT_CATEGORIES.find((c) => c.value === it.vat_category)?.rate ?? 0 : 0;
      subtotal += base;
      vat += round2((base * rate) / 100);
    }
    return { subtotal: round2(subtotal), vat: round2(vat), total: round2(subtotal + vat) };
  }, [rows, vatApplicable]);

  const canSubmit =
    premiseId != null &&
    deviceId != null &&
    rows.length > 0 &&
    rows.every((r) => r.description.trim() && r.quantity > 0);

  async function submit() {
    if (!canSubmit || premiseId == null || deviceId == null) return;
    const guest = guests?.find((g) => g.id === guestId);
    try {
      const invoice = await issue.mutateAsync({
        premise_id: premiseId,
        device_id: deviceId,
        guest_id: guestId,
        guest_name: guest ? `${guest.first_name} ${guest.last_name}` : null,
        payment_method: payment,
        note: note.trim() || null,
        items: rows.map(({ description, quantity, unit, unit_price, vat_category }) => ({
          description,
          quantity,
          unit,
          unit_price,
          vat_category,
        })),
      });
      navigate(`/racuni/${invoice.id}`, { replace: true });
    } catch (err) {
      setConfirmOpen(false);
      showError(err instanceof ApiError ? err.message : 'Izdavanje nije uspjelo.');
    }
  }

  return (
    <div className="space-y-4 pb-44 md:pb-28">
      <h2 className="text-xl font-semibold text-foreground">Novi račun</h2>

      {/* Prostor + uređaj */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Poslovni prostor">
            <Select value={premiseId ?? ''} onChange={(e) => setPremiseId(Number(e.target.value))}>
              {premises?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Naplatni uređaj">
            <Select value={deviceId ?? ''} onChange={(e) => setDeviceId(Number(e.target.value))}>
              {activePremise?.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code}
                  {d.label ? ` · ${d.label}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Gost">
          <Select value={guestId ?? ''} onChange={(e) => setGuestId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Krajnji potrošač (bez gosta)</option>
            {guests?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.first_name} {g.last_name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {/* Stavke */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Stavke</h3>
          <Button size="sm" variant="secondary" onClick={addBlankRow}>
            <Plus className="h-4 w-4" /> Stavka
          </Button>
        </div>

        {services && services.filter((s) => s.active).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {services
              .filter((s) => s.active)
              .map((s) => (
                <button
                  key={s.id}
                  onClick={() => addServiceRow(s.id)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  + {s.name}
                </button>
              ))}
          </div>
        )}

        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-muted">
            Dodajte stavku iz usluga iznad ili ručno.
          </p>
        )}

        {rows.map((row) => (
          <ItemRow
            key={row.key}
            row={row}
            vatApplicable={vatApplicable}
            onChange={(patch) => updateRow(row.key, patch)}
            onRemove={() => removeRow(row.key)}
          />
        ))}
      </Card>

      {/* Plaćanje */}
      <Card className="space-y-3 p-4">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Način plaćanja</p>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setPayment(m.value)}
                className={cn(
                  'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                  payment === m.value
                    ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                    : 'border-border text-muted hover:bg-surface-2',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Napomena (opcionalno)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Napomena na računu" />
        </Field>
      </Card>

      {/* Sticky totals + submit */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-64 safe-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted">Ukupno{vatApplicable ? ' (s PDV-om)' : ''}</p>
            <p className="text-lg font-semibold text-foreground tnum">{formatEur(totals.total)}</p>
          </div>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canSubmit} size="lg">
            Pregledaj i izdaj <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ConfirmIssueModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={submit}
        loading={issue.isPending}
        totals={totals}
        vatApplicable={vatApplicable}
        rows={rows}
        guestName={guests?.find((g) => g.id === guestId)?.first_name}
      />
    </div>
  );
}

function ItemRow({
  row,
  vatApplicable,
  onChange,
  onRemove,
}: {
  row: Row;
  vatApplicable: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const lineBase = round2(row.quantity * row.unit_price);
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-start gap-2">
        <Input
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Opis stavke (npr. Noćenje)"
          className="flex-1"
        />
        <button
          onClick={onRemove}
          aria-label="Ukloni stavku"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Količina">
          <Input
            inputMode="decimal"
            value={String(row.quantity)}
            onChange={(e) => onChange({ quantity: Number(e.target.value.replace(',', '.')) || 0 })}
          />
        </Field>
        <Field label="Jed.">
          <Select value={row.unit} onChange={(e) => onChange({ unit: e.target.value })}>
            {SERVICE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cijena">
          <Input
            inputMode="decimal"
            value={String(row.unit_price)}
            onChange={(e) => onChange({ unit_price: Number(e.target.value.replace(',', '.')) || 0 })}
          />
        </Field>
        <Field label="PDV">
          <Select
            value={row.vat_category}
            onChange={(e) => onChange({ vat_category: e.target.value })}
            disabled={!vatApplicable}
          >
            {VAT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {vatApplicable ? c.label : c.value === 'smjestaj' ? 'Bez PDV-a' : c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="mt-2 text-right text-xs text-muted">
        Osnovica: <span className="tnum font-medium text-foreground">{formatEur(lineBase)}</span>
      </p>
    </div>
  );
}

function ConfirmIssueModal({
  open,
  onClose,
  onConfirm,
  loading,
  totals,
  vatApplicable,
  rows,
  guestName,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  totals: { subtotal: number; vat: number; total: number };
  vatApplicable: boolean;
  rows: Row[];
  guestName?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Potvrda izdavanja"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Natrag
          </Button>
          <Button onClick={onConfirm} loading={loading}>
            <Receipt className="h-4 w-4" /> Izdaj i fiskaliziraj
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Nakon izdavanja račun se fiskalizira i više se ne može mijenjati. Ispravak je moguć samo storniranjem.
        </p>
        <div className="rounded-xl border border-border">
          <div className="divide-y divide-border">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {r.description || 'Stavka'} · {r.quantity} {r.unit}
                </span>
                <span className="tnum text-muted">{formatEur(round2(r.quantity * r.unit_price))}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border px-3 py-2 text-sm">
            {vatApplicable && (
              <>
                <Line label="Osnovica" value={formatEur(totals.subtotal)} />
                <Line label="PDV" value={formatEur(totals.vat)} />
              </>
            )}
            <div className="mt-1 flex items-center justify-between font-semibold text-foreground">
              <span>Ukupno</span>
              <span className="tnum">{formatEur(totals.total)}</span>
            </div>
          </div>
        </div>
        {guestName && <p className="text-xs text-muted">Gost: {guestName}</p>}
      </div>
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}
