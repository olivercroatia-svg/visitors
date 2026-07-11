import { useState } from 'react';
import { Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Field, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { api, ApiError } from '@/lib/api';
import { formatEur } from '@/lib/utils';
import {
  useServices,
  useInvalidateMasterData,
  VAT_CATEGORIES,
  SERVICE_UNITS,
  type Service,
} from './api';

export function ServicesSection() {
  const { data: services, isLoading } = useServices();
  const [modal, setModal] = useState<{ open: boolean; edit?: Service }>({ open: false });
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const invalidate = useInvalidateMasterData();

  const active = services?.filter((s) => s.active) ?? [];

  async function remove(s: Service) {
    const ok = await confirm({
      title: 'Deaktivirati uslugu?',
      message: `„${s.name}" se više neće nuditi pri unosu računa.`,
      confirmLabel: 'Deaktiviraj',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/services/${s.id}`);
      invalidate();
      showSuccess('Usluga je deaktivirana.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Spremljene usluge ubrzavaju unos i drže cijene dosljednima.</p>
        <Button size="sm" onClick={() => setModal({ open: true })}>
          <Plus className="h-4 w-4" /> Usluga
        </Button>
      </div>

      {isLoading && <Card className="p-6 text-center text-sm text-muted">Učitavanje…</Card>}

      {active.length === 0 && !isLoading && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Tag className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">Još nemate spremljenih usluga.</p>
          <Button size="sm" onClick={() => setModal({ open: true })}>
            <Plus className="h-4 w-4" /> Dodaj uslugu
          </Button>
        </Card>
      )}

      {active.map((s) => (
        <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span className="tnum">{formatEur(Number(s.default_price))}</span>
              <span>/ {s.unit}</span>
              <Badge tone="neutral">{vatLabel(s.vat_category)}</Badge>
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setModal({ open: true, edit: s })}
              aria-label="Uredi"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(s)}
              aria-label="Deaktiviraj"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ))}

      {modal.open && <ServiceModal edit={modal.edit} onClose={() => setModal({ open: false })} />}
    </div>
  );
}

function vatLabel(cat: string): string {
  return VAT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

function ServiceModal({ edit, onClose }: { edit?: Service; onClose: () => void }) {
  const invalidate = useInvalidateMasterData();
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState({
    name: edit?.name ?? '',
    unit: edit?.unit ?? 'noć',
    default_price: edit ? String(edit.default_price) : '',
    vat_category: edit?.vat_category ?? 'smjestaj',
  });
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const payload = {
        name: form.name,
        unit: form.unit,
        default_price: Number(form.default_price) || 0,
        vat_category: form.vat_category,
      };
      if (edit) await api.put(`/services/${edit.id}`, payload);
      else await api.post('/services', payload);
      invalidate();
      showSuccess(edit ? 'Usluga je ažurirana.' : 'Usluga je dodana.');
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
      title={edit ? 'Uredi uslugu' : 'Nova usluga'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={save} loading={loading} disabled={form.name.length < 2}>
            Spremi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Naziv usluge">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Noćenje"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cijena (EUR)">
            <Input
              inputMode="decimal"
              value={form.default_price}
              onChange={(e) => setForm((f) => ({ ...f, default_price: e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') }))}
              placeholder="50.00"
            />
          </Field>
          <Field label="Jedinica">
            <Select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}>
              {SERVICE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Porezna kategorija (PDV)" hint="Za neobveznike se stopa računa kao oslobođeno, uz zakonsku klauzulu.">
          <Select
            value={form.vat_category}
            onChange={(e) => setForm((f) => ({ ...f, vat_category: e.target.value }))}
          >
            {VAT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
