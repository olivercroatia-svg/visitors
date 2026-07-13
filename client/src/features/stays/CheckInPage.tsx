import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Info } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useCodebook, useObjects } from '@/features/evisitor/api';
import { useStayMutation, validateStay, type Issue, type StayInput } from './api';

interface GuestOption {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
}

// MySQL DATETIME with minute precision, which is what datetime-local gives us.
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function plusDays(value: string, days: number): string {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 16);
}

export function CheckInPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const objects = useObjects();
  const ttCategories = useCodebook('tt_category');
  const arrivalOrgs = useCodebook('arrival_org');
  const serviceTypes = useCodebook('service_type');

  const guests = useQuery<GuestOption[]>({
    queryKey: ['guests'],
    queryFn: () => api.get('/guests'),
  });

  const [form, setForm] = useState<StayInput>({
    object_id: 0,
    guest_id: 0,
    check_in_at: nowLocal(),
    foreseen_check_out_at: plusDays(nowLocal(), 3),
    tt_category: '',
    arrival_org: 'I',
    service_type: 'noćenje',
    note: '',
  });
  const [issues, setIssues] = useState<Issue[]>([]);

  const activeObjects = useMemo(
    () => (objects.data ?? []).filter((o) => o.active),
    [objects.data],
  );

  // Default to the tenant's only object / first category so the common case is one tap.
  useEffect(() => {
    if (!form.object_id && activeObjects.length > 0) {
      const first = activeObjects[0];
      setForm((f) => ({
        ...f,
        object_id: first.id,
        tt_category: f.tt_category || first.default_tt_category || '',
      }));
    }
  }, [activeObjects, form.object_id]);

  // Live validation against the SERVER's rules — never a second copy of them here.
  useEffect(() => {
    if (!form.object_id || !form.guest_id) {
      setIssues([]);
      return;
    }
    const t = setTimeout(() => {
      validateStay(form)
        .then((r) => setIssues(r.issues))
        .catch(() => setIssues([]));
    }, 400);
    return () => clearTimeout(t);
  }, [form]);

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const checkIn = useStayMutation((input: StayInput) => api.post('/stays', { ...input, register: true }));

  const submit = async () => {
    try {
      const stay: any = await checkIn.mutateAsync(form);
      if (stay.evisitor_status === 'confirmed') {
        showSuccess('Gost je prijavljen u eVisitor.');
      } else if (stay.evisitor_status === 'pending') {
        showError('Prijava nije prošla — pokušat ćemo ponovno automatski.');
      } else {
        showError(stay.last_error ?? 'Prijava nije prošla.');
      }
      navigate(`/boravci/${stay.id}`);
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Prijava nije uspjela.');
    }
  };

  const set = <K extends keyof StayInput>(key: K, value: StayInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const unsyncedCodebook = ttCategories.data?.some((c) => !c.synced);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/boravci')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-xl font-semibold text-foreground">Nova prijava turista</h2>
      </div>

      {activeObjects.length === 0 && (
        <Card className="border-warning/40 bg-warning-soft">
          <CardContent className="py-4 text-sm text-warning">
            Nemate nijedan smještajni objekt. Dodajte ga u{' '}
            <a href="/postavke?tab=objekti" className="underline underline-offset-2">
              Postavke → Objekti
            </a>
            .
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Boravak</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Smještajni objekt">
            <Select
              value={form.object_id || ''}
              onChange={(e) => set('object_id', Number(e.target.value))}
            >
              <option value="">Odaberite objekt</option>
              {activeObjects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.facility_code})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Gost" hint="Gost mora imati popunjene eVisitor podatke (Gosti → uredi).">
            <Select
              value={form.guest_id || ''}
              onChange={(e) => set('guest_id', Number(e.target.value))}
            >
              <option value="">Odaberite gosta</option>
              {(guests.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.first_name} {g.last_name}
                  {!g.date_of_birth || !g.gender ? ' — nepotpun' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Dolazak (datum i vrijeme)"
            hint="Upišite stvarno vrijeme dolaska — ono utječe na obračun boravišne pristojbe."
          >
            <Input
              type="datetime-local"
              value={form.check_in_at}
              onChange={(e) => set('check_in_at', e.target.value)}
            />
          </Field>

          <Field label="Predviđeni odlazak (datum i vrijeme)">
            <Input
              type="datetime-local"
              value={form.foreseen_check_out_at}
              onChange={(e) => set('foreseen_check_out_at', e.target.value)}
            />
          </Field>

          <Field
            label="Kategorija boravišne pristojbe"
            hint={unsyncedCodebook ? 'Šifrarnik još nije sinkroniziran s eVisitorom.' : undefined}
          >
            <Select
              value={form.tt_category}
              onChange={(e) => set('tt_category', e.target.value)}
            >
              <option value="">Odaberite kategoriju</option>
              {(ttCategories.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Organizacija dolaska">
            <Select value={form.arrival_org} onChange={(e) => set('arrival_org', e.target.value)}>
              {(arrivalOrgs.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Vrsta usluge">
            <Select value={form.service_type} onChange={(e) => set('service_type', e.target.value)}>
              {(serviceTypes.data ?? []).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Napomena">
            <Input
              value={form.note ?? ''}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Neobavezno"
            />
          </Field>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-danger/40 bg-danger-soft">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-medium text-danger">Ispravite prije prijave:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {errors.map((i) => (
                  <li key={i.field + i.code} className="text-xs text-danger/90">
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="border-warning/40 bg-warning-soft">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <ul className="space-y-0.5">
              {warnings.map((i) => (
                <li key={i.field + i.code} className="text-xs text-warning">
                  {i.message}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate('/boravci')}>
          Odustani
        </Button>
        <Button
          onClick={submit}
          loading={checkIn.isPending}
          disabled={!form.object_id || !form.guest_id || errors.length > 0}
        >
          Prijavi u eVisitor
        </Button>
      </div>
    </div>
  );
}
