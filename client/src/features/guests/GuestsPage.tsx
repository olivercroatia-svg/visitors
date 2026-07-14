import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Pencil, Trash2, Users, Mail, Phone, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Field, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useCodebook } from '@/features/evisitor/api';
import { api, ApiError } from '@/lib/api';
import { DocumentScanner } from './DocumentScanner';
import type { ScanResult } from './scan';

export interface Guest {
  id: number;
  first_name: string;
  last_name: string;
  country: string | null;
  doc_type: 'osobna' | 'putovnica' | 'ostalo' | null;
  doc_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  note: string | null;

  // eVisitor — only needed to check the guest in, so they stay optional here.
  middle_name: string | null;
  date_of_birth: string | null;
  gender: 'muski' | 'zenski' | null;
  citizenship_code: string | null;
  birth_country_code: string | null;
  birth_city: string | null;
  residence_country_code: string | null;
  residence_city: string | null;
  residence_city_code: string | null;
  residence_address: string | null;
  doc_type_code: string | null;
  visa_type: string | null;
  visa_number: string | null;
  visa_validity_date: string | null;
}

export function GuestsPage() {
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; edit?: Guest }>({ open: false });
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const qc = useQueryClient();

  const { data: guests, isLoading } = useQuery<Guest[]>({
    queryKey: ['guests', q],
    queryFn: () => api.get(`/guests${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  async function remove(g: Guest) {
    const ok = await confirm({
      title: 'Obrisati gosta?',
      message: `Podaci o gostu „${g.first_name} ${g.last_name}" bit će trajno obrisani.`,
      confirmLabel: 'Obriši',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/guests/${g.id}`);
      qc.invalidateQueries({ queryKey: ['guests'] });
      showSuccess('Gost je obrisan.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">Gosti</h2>
        <Button size="sm" onClick={() => setModal({ open: true })}>
          <Plus className="h-4 w-4" /> Gost
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pretraži po imenu, emailu ili telefonu…"
          className="pl-10"
        />
      </div>

      {isLoading && <Card className="p-6 text-center text-sm text-muted">Učitavanje…</Card>}

      {guests?.length === 0 && !isLoading && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Users className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">{q ? 'Nema rezultata pretrage.' : 'Još nemate spremljenih gostiju.'}</p>
          {!q && (
            <Button size="sm" onClick={() => setModal({ open: true })}>
              <Plus className="h-4 w-4" /> Dodaj gosta
            </Button>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {guests?.map((g) => (
          <Card key={g.id} className="flex items-center gap-3 p-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
              {g.first_name[0]?.toUpperCase()}
              {g.last_name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {g.first_name} {g.last_name}
                {g.country && g.country !== 'Hrvatska' && (
                  <span className="ml-1.5 text-xs font-normal text-muted">· {g.country}</span>
                )}
              </p>
              <p className="flex items-center gap-3 text-xs text-muted">
                {g.email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3" /> {g.email}
                  </span>
                )}
                {g.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {g.phone}
                  </span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => setModal({ open: true, edit: g })}
                aria-label="Uredi"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(g)}
                aria-label="Obriši"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {modal.open && <GuestModal edit={modal.edit} onClose={() => setModal({ open: false })} />}
    </div>
  );
}

function GuestModal({ edit, onClose }: { edit?: Guest; onClose: () => void }) {
  const qc = useQueryClient();
  const { showSuccess, showError } = useToast();
  const countries = useCodebook('country');
  const [form, setForm] = useState({
    first_name: edit?.first_name ?? '',
    last_name: edit?.last_name ?? '',
    country: edit?.country ?? 'Hrvatska',
    doc_type: edit?.doc_type ?? '',
    doc_number: edit?.doc_number ?? '',
    email: edit?.email ?? '',
    phone: edit?.phone ?? '',
    address: edit?.address ?? '',
    city: edit?.city ?? '',
    note: edit?.note ?? '',

    middle_name: edit?.middle_name ?? '',
    date_of_birth: edit?.date_of_birth?.slice(0, 10) ?? '',
    gender: edit?.gender ?? '',
    citizenship_code: edit?.citizenship_code ?? '',
    birth_country_code: edit?.birth_country_code ?? '',
    birth_city: edit?.birth_city ?? '',
    residence_country_code: edit?.residence_country_code ?? '',
    residence_city: edit?.residence_city ?? '',
    residence_address: edit?.residence_address ?? '',
    doc_type_code: edit?.doc_type_code ?? '',
  });
  const [loading, setLoading] = useState(false);

  type FormKey = keyof typeof form;

  // Which fields the scan filled (ring), which the MRZ proved (check), which it disagrees with
  // (Zamijeni chip), and which the user has typed in themselves.
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());

  function set<K extends FormKey>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setTouched((t) => new Set(t).add(k));
    // Once the user edits a field themselves, our annotations on it are stale.
    setScanned((s) => {
      if (!s.has(k)) return s;
      const n = new Set(s);
      n.delete(k);
      return n;
    });
    setConflicts((c) => {
      if (!(k in c)) return c;
      const n = { ...c };
      delete n[k];
      return n;
    });
  }

  /**
   * Fill the form from a scan. This is the whole point of the review stop: it writes to form
   * state and nothing else — no request, no save.
   *
   * A value the user owns is never silently replaced; the scan's version is offered as a chip
   * instead. "Owns" means: an existing guest's stored data, or a field this user has typed in.
   * It does NOT mean the untouched `country: 'Hrvatska'` default — treating a default as user
   * input would make every foreign guest raise a pointless conflict.
   */
  function applyScan(r: ScanResult) {
    const nextConflicts: Record<string, string> = {};
    const nextScanned = new Set<string>();

    setForm((f) => {
      const next = { ...f };
      for (const [key, value] of Object.entries(r.fields)) {
        if (value == null || value === '') continue;
        if (!(key in next)) continue; // e.g. fields the form does not carry
        const k = key as FormKey;

        const current = String(next[k] ?? '').trim();
        const userOwns = current !== '' && (edit !== undefined || touched.has(k));

        if (userOwns) {
          if (current !== value) nextConflicts[k] = value;
        } else {
          (next[k] as string) = value;
          nextScanned.add(k);
        }
      }
      return next;
    });

    setScanned(nextScanned);
    setConflicts(nextConflicts);
    setVerified(new Set(r.verified_fields));
  }

  function acceptConflict(k: string, value: string) {
    setForm((f) => ({ ...f, [k]: value }));
    setConflicts((c) => {
      const n = { ...c };
      delete n[k];
      return n;
    });
    setScanned((s) => new Set(s).add(k));
  }

  /** Highlights a field the scan filled, so the user knows what a machine read and should check. */
  const ring = (k: FormKey) => (scanned.has(k) ? 'ring-2 ring-primary/30' : '');

  /** Rendered under a field, not as a component, so it never remounts the input on re-render. */
  function scanNote(k: FormKey) {
    const conflict = conflicts[k];
    if (conflict) {
      return (
        <button
          type="button"
          onClick={() => acceptConflict(k, conflict)}
          className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-warning/40 bg-warning-soft px-2 py-1 text-left text-xs text-foreground hover:opacity-80"
        >
          <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
          <span className="truncate">
            Prepoznato: <strong>{conflict}</strong>
          </span>
          <span className="ml-auto shrink-0 font-medium text-warning">Zamijeni</span>
        </button>
      );
    }
    if (verified.has(k)) {
      return (
        <p className="mt-1 flex items-center gap-1 text-xs text-success">
          <CheckCircle2 className="h-3 w-3" /> Potvrđeno MRZ zapisom.
        </p>
      );
    }
    return null;
  }

  async function save() {
    setLoading(true);
    try {
      const payload = { ...form, doc_type: form.doc_type || null };
      if (edit) await api.put(`/guests/${edit.id}`, payload);
      else await api.post('/guests', payload);
      qc.invalidateQueries({ queryKey: ['guests'] });
      showSuccess(edit ? 'Gost je ažuriran.' : 'Gost je dodan.');
      onClose();
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    } finally {
      setLoading(false);
    }
  }

  const valid = form.first_name.trim() && form.last_name.trim();

  return (
    <Modal
      open
      onClose={onClose}
      title={edit ? 'Uredi gosta' : 'Novi gost'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={save} loading={loading} disabled={!valid}>
            Spremi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <DocumentScanner onResult={applyScan} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ime">
            <Input
              value={form.first_name}
              onChange={(e) => set('first_name', e.target.value)}
              className={ring('first_name')}
              autoFocus
            />
            {scanNote('first_name')}
          </Field>
          <Field label="Prezime">
            <Input
              value={form.last_name}
              onChange={(e) => set('last_name', e.target.value)}
              className={ring('last_name')}
            />
            {scanNote('last_name')}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Srednje ime" hint="Neobavezno.">
            <Input
              value={form.middle_name}
              onChange={(e) => set('middle_name', e.target.value)}
              className={ring('middle_name')}
            />
            {scanNote('middle_name')}
          </Field>
          <Field label="Država">
            <Input
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
              placeholder="Hrvatska"
              className={ring('country')}
            />
            {scanNote('country')}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vrsta dokumenta">
            <Select
              value={form.doc_type}
              onChange={(e) => set('doc_type', e.target.value as typeof form.doc_type)}
              className={ring('doc_type')}
            >
              <option value="">—</option>
              <option value="osobna">Osobna iskaznica</option>
              <option value="putovnica">Putovnica</option>
              <option value="ostalo">Ostalo</option>
            </Select>
            {scanNote('doc_type')}
          </Field>
          <Field label="Broj dokumenta">
            <Input
              value={form.doc_number}
              onChange={(e) => set('doc_number', e.target.value)}
              className={ring('doc_number')}
            />
            {scanNote('doc_number')}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label="Telefon">
            <Input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Adresa" hint="Za račun.">
            <Input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              className={ring('address')}
            />
            {scanNote('address')}
          </Field>
          <Field label="Grad" hint="Za račun.">
            <Input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              className={ring('city')}
            />
            {scanNote('city')}
          </Field>
        </div>
        <Field label="Napomena">
          <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Npr. redovan gost" />
        </Field>

        {/* eVisitor requires all of this to register a tourist. It is optional for a
            guest who only ever appears on an invoice, so it lives in its own block. */}
        <div className="border-t border-border pt-4">
          <p className="mb-1 text-sm font-medium text-foreground">Podaci za eVisitor</p>
          <p className="mb-3 text-xs text-muted">
            Obavezno za prijavu turista. Bez ovih podataka gost se ne može prijaviti u eVisitor.
          </p>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Datum rođenja">
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => set('date_of_birth', e.target.value)}
                  className={ring('date_of_birth')}
                />
                {scanNote('date_of_birth')}
              </Field>
              <Field label="Spol">
                <Select
                  value={form.gender}
                  onChange={(e) => set('gender', e.target.value as typeof form.gender)}
                  className={ring('gender')}
                >
                  <option value="">—</option>
                  <option value="muski">Muški</option>
                  <option value="zenski">Ženski</option>
                </Select>
                {scanNote('gender')}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Državljanstvo">
                <CountrySelect
                  value={form.citizenship_code}
                  onChange={(v) => set('citizenship_code', v)}
                  options={countries.data ?? []}
                  className={ring('citizenship_code')}
                />
                {scanNote('citizenship_code')}
              </Field>
              <Field label="Država rođenja">
                <CountrySelect
                  value={form.birth_country_code}
                  onChange={(v) => set('birth_country_code', v)}
                  options={countries.data ?? []}
                  className={ring('birth_country_code')}
                />
                {scanNote('birth_country_code')}
              </Field>
            </div>

            <Field label="Grad rođenja">
              <Input
                value={form.birth_city}
                onChange={(e) => set('birth_city', e.target.value)}
                className={ring('birth_city')}
              />
              {scanNote('birth_city')}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Država prebivališta">
                <CountrySelect
                  value={form.residence_country_code}
                  onChange={(v) => set('residence_country_code', v)}
                  options={countries.data ?? []}
                  className={ring('residence_country_code')}
                />
                {scanNote('residence_country_code')}
              </Field>
              <Field
                label="Grad prebivališta"
                hint={'Za Hrvatsku u obliku „Grad – Naselje”.'}
              >
                <Input
                  value={form.residence_city}
                  onChange={(e) => set('residence_city', e.target.value)}
                  className={ring('residence_city')}
                />
                {scanNote('residence_city')}
              </Field>
            </div>

            <Field label="Adresa prebivališta">
              <Input
                value={form.residence_address}
                onChange={(e) => set('residence_address', e.target.value)}
                className={ring('residence_address')}
              />
              {scanNote('residence_address')}
            </Field>

            <Field
              label="Šifra vrste dokumenta"
              hint="Šifra iz eVisitora (npr. 008). Sinkronizirajte šifrarnike u Postavke → eVisitor."
            >
              <Input
                value={form.doc_type_code}
                onChange={(e) => set('doc_type_code', e.target.value)}
                placeholder="008"
                className={ring('doc_type_code')}
              />
              {scanNote('doc_type_code')}
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CountrySelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { code: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">—</option>
      {options.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </Select>
  );
}
