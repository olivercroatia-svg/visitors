import { useState } from 'react';
import { Plus, Pencil, Trash2, MapPin, Cpu, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input, Field, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { api, ApiError } from '@/lib/api';
import {
  usePremises,
  useMunicipalities,
  useInvalidateMasterData,
  type Premise,
  type Device,
} from './api';

export function PremisesSection() {
  const { data: premises, isLoading } = usePremises();
  const [premiseModal, setPremiseModal] = useState<{ open: boolean; edit?: Premise }>({ open: false });
  const [deviceModal, setDeviceModal] = useState<{ open: boolean; premiseId?: number; edit?: Device }>({
    open: false,
  });
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();
  const invalidate = useInvalidateMasterData();

  async function removePremise(p: Premise) {
    const ok = await confirm({
      title: 'Deaktivirati prostor?',
      message: `Prostor „${p.name}" i njegovi uređaji više neće biti dostupni za nove račune. Postojeći računi ostaju netaknuti.`,
      confirmLabel: 'Deaktiviraj',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/premises/${p.id}`);
      invalidate();
      showSuccess('Prostor je deaktiviran.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  async function removeDevice(d: Device) {
    const ok = await confirm({
      title: 'Deaktivirati uređaj?',
      message: `Naplatni uređaj „${d.code}" više se neće koristiti za nove račune.`,
      confirmLabel: 'Deaktiviraj',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/devices/${d.id}`);
      invalidate();
      showSuccess('Uređaj je deaktiviran.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Greška.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Prostori i njihovi naplatni uređaji čine broj računa (npr. <b className="text-foreground">1/POSL1/1</b>).
        </p>
        <Button size="sm" onClick={() => setPremiseModal({ open: true })}>
          <Plus className="h-4 w-4" /> Prostor
        </Button>
      </div>

      {isLoading && <Card className="p-6 text-center text-sm text-muted">Učitavanje…</Card>}

      {premises?.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Building2 className="h-8 w-8 text-muted-2" />
          <p className="text-sm text-muted">Još nemate poslovnih prostora.</p>
          <Button size="sm" onClick={() => setPremiseModal({ open: true })}>
            <Plus className="h-4 w-4" /> Dodaj prvi prostor
          </Button>
        </Card>
      )}

      {premises?.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{p.name}</h3>
                <Badge tone="accent">{p.code}</Badge>
              </div>
              {(p.address || p.municipality_name) && (
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  {[p.address, p.city, p.municipality_name].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <IconButton label="Uredi" onClick={() => setPremiseModal({ open: true, edit: p })}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Deaktiviraj" onClick={() => removePremise(p)} danger>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <Cpu className="h-3.5 w-3.5" /> Naplatni uređaji
              </span>
              <button
                onClick={() => setDeviceModal({ open: true, premiseId: p.id })}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Dodaj uređaj
              </button>
            </div>
            {p.devices.length === 0 ? (
              <p className="text-xs text-muted-2">Nema uređaja — dodajte barem jedan za izdavanje računa.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {p.devices.map((d) => (
                  <div
                    key={d.id}
                    className="group flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium text-foreground">{d.code}</span>
                    {d.label && <span className="text-xs text-muted">· {d.label}</span>}
                    <button
                      onClick={() => setDeviceModal({ open: true, premiseId: p.id, edit: d })}
                      className="text-muted-2 hover:text-foreground"
                      aria-label="Uredi uređaj"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeDevice(d)}
                      className="text-muted-2 hover:text-danger"
                      aria-label="Deaktiviraj uređaj"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ))}

      {premiseModal.open && (
        <PremiseModal edit={premiseModal.edit} onClose={() => setPremiseModal({ open: false })} />
      )}
      {deviceModal.open && (
        <DeviceModal
          premiseId={deviceModal.premiseId!}
          edit={deviceModal.edit}
          onClose={() => setDeviceModal({ open: false })}
        />
      )}
    </div>
  );
}

function IconButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 ${
        danger ? 'hover:text-danger' : 'hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function PremiseModal({ edit, onClose }: { edit?: Premise; onClose: () => void }) {
  const { data: municipalities } = useMunicipalities();
  const invalidate = useInvalidateMasterData();
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState({
    name: edit?.name ?? '',
    code: edit?.code ?? '',
    address: edit?.address ?? '',
    city: edit?.city ?? '',
    postal_code: edit?.postal_code ?? '',
    municipality_id: edit?.municipality_id ?? null,
  });
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      const payload = { ...form, municipality_id: form.municipality_id || null };
      if (edit) await api.put(`/premises/${edit.id}`, payload);
      else await api.post('/premises', payload);
      invalidate();
      showSuccess(edit ? 'Prostor je ažuriran.' : 'Prostor je dodan.');
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
      title={edit ? 'Uredi prostor' : 'Novi poslovni prostor'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={save} loading={loading} disabled={form.name.length < 2 || !form.code}>
            Spremi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Naziv prostora">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Villa Jadran"
            autoFocus
          />
        </Field>
        <Field label="Oznaka prostora" hint="Kratka oznaka koja ide u broj računa, npr. POSL1.">
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() }))}
            placeholder="POSL1"
            maxLength={20}
          />
        </Field>
        <Field label="JLS (općina / grad)">
          <Select
            value={form.municipality_id ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, municipality_id: e.target.value ? Number(e.target.value) : null }))
            }
          >
            <option value="">— odaberite —</option>
            {municipalities?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.county})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Adresa">
          <Input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Obala 1"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mjesto">
            <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </Field>
          <Field label="Poštanski broj">
            <Input
              value={form.postal_code}
              onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function DeviceModal({
  premiseId,
  edit,
  onClose,
}: {
  premiseId: number;
  edit?: Device;
  onClose: () => void;
}) {
  const invalidate = useInvalidateMasterData();
  const { showSuccess, showError } = useToast();
  const [code, setCode] = useState(edit?.code ?? '');
  const [label, setLabel] = useState(edit?.label ?? '');
  const [loading, setLoading] = useState(false);

  async function save() {
    setLoading(true);
    try {
      if (edit) await api.put(`/devices/${edit.id}`, { code, label });
      else await api.post('/devices', { premise_id: premiseId, code, label });
      invalidate();
      showSuccess(edit ? 'Uređaj je ažuriran.' : 'Uređaj je dodan.');
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
      title={edit ? 'Uredi uređaj' : 'Novi naplatni uređaj'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Odustani
          </Button>
          <Button onClick={save} loading={loading} disabled={!code}>
            Spremi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Oznaka uređaja" hint="Npr. 1 — ide u broj računa kao zadnji dio.">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
            placeholder="1"
            maxLength={20}
            autoFocus
          />
        </Field>
        <Field label="Naziv (opcionalno)">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Recepcija" />
        </Field>
      </div>
    </Modal>
  );
}
