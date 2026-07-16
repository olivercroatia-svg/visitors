import { useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/Confirm';
import { useToast } from '@/components/ui/Toast';
import { useEvisitorMutation, useObjects, type AccommodationObject } from './api';

interface ObjectForm {
  name: string;
  facility_code: string;
  address: string;
  city: string;
}

const EMPTY: ObjectForm = { name: '', facility_code: '', address: '', city: '' };

export function ObjectsSection() {
  const objects = useObjects();
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccommodationObject | null>(null);
  const [form, setForm] = useState<ObjectForm>(EMPTY);

  const save = useEvisitorMutation((f: ObjectForm) =>
    editing ? api.put(`/objects/${editing.id}`, f) : api.post('/objects', f),
  );
  const remove = useEvisitorMutation((id: number) => api.del(`/objects/${id}`));
  const importFacilities = useEvisitorMutation(() =>
    api.post('/evisitor/facilities/import', {}),
  );

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (o: AccommodationObject) => {
    setEditing(o);
    setForm({
      name: o.name,
      facility_code: o.facility_code,
      address: o.address ?? '',
      city: o.city ?? '',
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      await save.mutateAsync(form);
      setOpen(false);
      showSuccess(editing ? 'Objekt je spremljen.' : 'Objekt je dodan.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Spremanje nije uspjelo.');
    }
  };

  const doImport = async () => {
    try {
      const res: any = await importFacilities.mutateAsync(undefined as never);
      showSuccess(`Povučeno objekata: ${res.imported}.`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Povlačenje nije uspjelo.');
    }
  };

  const doRemove = async (o: AccommodationObject) => {
    const ok = await confirm({
      title: 'Deaktivirati objekt?',
      message: `Objekt „${o.name}" više neće biti dostupan za nove prijave. Postojeći boravci ostaju zabilježeni.`,
      confirmLabel: 'Deaktiviraj',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(o.id);
      showSuccess('Objekt je deaktiviran.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Deaktivacija nije uspjela.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Smještajni objekti prijavljeni u eVisitoru. Šifra objekta mora odgovarati onoj u eVisitoru.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={doImport} loading={importFacilities.isPending}>
            <Download className="h-4 w-4" />
            Povuci iz eVisitora
          </Button>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Novi objekt
          </Button>
        </div>
      </div>

      {(objects.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted">
            Nemate nijedan smještajni objekt. Dodajte ga ručno ili povucite iz eVisitora.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(objects.data ?? []).map((o) => (
            <Card key={o.id}>
              <CardContent className="flex items-center justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">{o.name}</p>
                    {!o.active && <Badge tone="neutral">Neaktivan</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted">
                    Šifra: <span className="font-mono">{o.facility_code}</span>
                    {o.city ? ` · ${o.city}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {Boolean(o.active) && (
                    <Button variant="ghost" size="sm" onClick={() => doRemove(o)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeOnBackdrop={false}
        title={editing ? 'Uredi objekt' : 'Novi smještajni objekt'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Odustani
            </Button>
            <Button onClick={submit} loading={save.isPending}>
              Spremi
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Naziv objekta">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="npr. Apartman More"
            />
          </Field>
          <Field label="Šifra objekta u eVisitoru" hint="npr. 0000022 — vidljiva u eVisitoru pod Objekti.">
            <Input
              value={form.facility_code}
              onChange={(e) => setForm({ ...form, facility_code: e.target.value })}
              placeholder="0000022"
            />
          </Field>
          <Field label="Adresa">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Mjesto">
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
