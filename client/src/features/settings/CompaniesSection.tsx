import { useState } from 'react';
import { Plus, Pencil, Trash2, Briefcase, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { api, ApiError } from '@/lib/api';
import { isValidOib } from '@/lib/oib';
import { useCompanies, useInvalidateMasterData, type Company } from './api';

export function CompaniesSection() {
  const [q, setQ] = useState('');
  const { data: companies, isLoading } = useCompanies(q);
  const [modal, setModal] = useState<{ open: boolean; edit?: Company }>({ open: false });
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const invalidate = useInvalidateMasterData();

  async function remove(c: Company) {
    const ok = await confirm({
      title: 'Arhivirati tvrtku?',
      message: `„${c.name}" se više neće nuditi pri unosu računa. Već izdani računi ostaju nepromijenjeni.`,
      confirmLabel: 'Arhiviraj',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/companies/${c.id}`);
      invalidate();
      showSuccess('Tvrtka je arhivirana.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Tvrtke gostiju. Podaci se informativno ispisuju na računu i pamte za sljedeći put.
        </p>
        <Button size="sm" onClick={() => setModal({ open: true })}>
          <Plus className="h-4 w-4" /> Tvrtka
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Traži po nazivu, OIB-u ili PDV ID-u"
          className="pl-9"
        />
      </div>

      {isLoading && <Card className="p-6 text-center text-sm text-muted">Učitavanje…</Card>}

      {companies?.length === 0 && !isLoading && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Briefcase className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">
            {q ? 'Nema tvrtke koja odgovara pretrazi.' : 'Još nemate spremljenih tvrtki.'}
          </p>
          {!q && (
            <Button size="sm" onClick={() => setModal({ open: true })}>
              <Plus className="h-4 w-4" /> Dodaj tvrtku
            </Button>
          )}
        </Card>
      )}

      {companies?.map((c) => (
        <Card key={c.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{companySubtitle(c)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setModal({ open: true, edit: c })}
              aria-label="Uredi"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(c)}
              aria-label="Arhiviraj"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ))}

      {modal.open && <CompanyModal edit={modal.edit} onClose={() => setModal({ open: false })} />}
    </div>
  );
}

function companySubtitle(c: Company): string {
  return (
    [
      c.oib ? `OIB: ${c.oib}` : c.vat_id ? `PDV ID: ${c.vat_id}` : '',
      [c.address, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join(' · ') || 'Bez dodatnih podataka'
  );
}

// Shared by the settings list and the invoice form ("＋ Nova tvrtka"), so a company
// is entered the same way in both places. onSaved receives the new company's id.
export function CompanyModal({
  edit,
  onClose,
  onSaved,
}: {
  edit?: Company;
  onClose: () => void;
  onSaved?: (id: number) => void;
}) {
  const invalidate = useInvalidateMasterData();
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState({
    name: edit?.name ?? '',
    oib: edit?.oib ?? '',
    vat_id: edit?.vat_id ?? '',
    address: edit?.address ?? '',
    postal_code: edit?.postal_code ?? '',
    city: edit?.city ?? '',
    country: edit?.country ?? 'Hrvatska',
    email: edit?.email ?? '',
    phone: edit?.phone ?? '',
    note: edit?.note ?? '',
  });
  const [oibTouched, setOibTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const oibValid = form.oib === '' || isValidOib(form.oib);

  async function save() {
    setLoading(true);
    try {
      if (edit) {
        await api.put(`/companies/${edit.id}`, form);
        showSuccess('Tvrtka je ažurirana.');
      } else {
        const created = await api.post<{ id: number }>('/companies', form);
        showSuccess('Tvrtka je dodana.');
        onSaved?.(created.id);
      }
      invalidate();
      onClose();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      title={edit ? 'Uredi tvrtku' : 'Nova tvrtka'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={save} loading={loading} disabled={form.name.trim().length < 2 || !oibValid}>
            Spremi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Naziv tvrtke">
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ACME d.o.o."
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="OIB"
            error={oibTouched && !oibValid ? 'Neispravan OIB (11 znamenki + kontrolna znamenka).' : undefined}
            hint="Ostavite prazno za strane tvrtke."
          >
            <Input
              inputMode="numeric"
              maxLength={11}
              value={form.oib}
              onChange={(e) => set('oib', e.target.value.replace(/\D/g, ''))}
              onBlur={() => setOibTouched(true)}
              placeholder="12345678901"
            />
          </Field>
          <Field label="PDV ID (strane tvrtke)">
            <Input
              value={form.vat_id}
              onChange={(e) => set('vat_id', e.target.value)}
              placeholder="DE123456789"
            />
          </Field>
        </div>

        <Field label="Adresa">
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Savska 32" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Poštanski broj">
            <Input
              value={form.postal_code}
              onChange={(e) => set('postal_code', e.target.value)}
              placeholder="10000"
            />
          </Field>
          <Field label="Mjesto">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Zagreb" />
          </Field>
          <Field label="Država">
            <Input value={form.country} onChange={(e) => set('country', e.target.value)} placeholder="Hrvatska" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" hint="Ne ispisuje se na računu.">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="racuni@acme.hr"
            />
          </Field>
          <Field label="Telefon" hint="Ne ispisuje se na računu.">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+385 1 234 5678" />
          </Field>
        </div>

        <Field label="Napomena" hint="Interno — ne ispisuje se na računu.">
          <Input
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            placeholder="Npr. traže račun na firmu"
          />
        </Field>
      </div>
    </Modal>
  );
}
