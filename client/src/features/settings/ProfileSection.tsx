import { useEffect, useState } from 'react';
import { Home, Building2, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { api, ApiError } from '@/lib/api';
import { isValidOib } from '@/lib/oib';
import { useInvalidateMasterData } from './api';
import { useAuth, type BusinessProfile, type ProfileType } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';

export function ProfileSection() {
  const { profile } = useAuth();
  const { showSuccess, showError } = useToast();
  const invalidate = useInvalidateMasterData();

  const [form, setForm] = useState(() => toForm(profile));
  const [loading, setLoading] = useState(false);
  useEffect(() => setForm(toForm(profile)), [profile]);

  const oibTouched = form.oib.length > 0;
  const oibValid = form.oib === '' || isValidOib(form.oib);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!oibValid) {
      showError('OIB nije ispravan.');
      return;
    }
    setLoading(true);
    try {
      await api.put('/profile', form);
      invalidate();
      showSuccess('Podaci obrta su spremljeni.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Spremanje nije uspjelo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <Card className="space-y-4 p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Vrsta djelatnosti</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <TypeChoice
              active={form.type === 'privatni_iznajmljivac'}
              onClick={() => set('type', 'privatni_iznajmljivac')}
              icon={<Home className="h-5 w-5" />}
              title="Privatni iznajmljivač"
            />
            <TypeChoice
              active={form.type === 'pausalni_obrt'}
              onClick={() => set('type', 'pausalni_obrt')}
              icon={<Building2 className="h-5 w-5" />}
              title="Paušalni obrt"
            />
          </div>
        </div>

        <Field label="Naziv obrta / iznajmljivača">
          <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} required />
        </Field>

        <Field
          label="OIB"
          error={oibTouched && !oibValid ? 'Neispravan OIB (11 znamenki + kontrolna znamenka).' : undefined}
          hint="Ispisuje se na svakom računu — provjeravamo kontrolnu znamenku."
        >
          <Input
            inputMode="numeric"
            maxLength={11}
            value={form.oib}
            onChange={(e) => set('oib', e.target.value.replace(/\D/g, ''))}
            className={cn(oibTouched && !oibValid && 'border-danger')}
            placeholder="12345678903"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Adresa">
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Obala 1" />
          </Field>
          <Field label="Mjesto">
            <Input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Rovinj" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Poštanski broj">
            <Input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="52210" />
          </Field>
          <Field label="IBAN (za uplate)">
            <Input value={form.iban} onChange={(e) => set('iban', e.target.value)} placeholder="HR12..." />
          </Field>
        </div>
      </Card>

      {/* VAT status — read-only here; changing it is a guided wizard (Faza 4) */}
      <Card className="flex items-start gap-3 p-4">
        <span className="mt-0.5 text-info">
          <Info className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Status u sustavu PDV-a</p>
            <Badge tone={profile?.vat_status === 'obveznik' ? 'info' : 'neutral'}>
              {profile?.vat_status === 'obveznik' ? 'Obveznik PDV-a' : 'Nije obveznik'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            Promjena statusa (ulazak/izlazak iz sustava PDV-a) radi se kroz vođeni čarobnjak s datumom
            stupanja na snagu — stiže u sljedećoj fazi. Time računi prije i poslije datuma ostaju ispravni.
          </p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!oibValid}>
          Spremi podatke
        </Button>
      </div>
    </form>
  );
}

function toForm(profile: BusinessProfile | null) {
  return {
    type: (profile?.type ?? 'privatni_iznajmljivac') as ProfileType,
    legal_name: profile?.legal_name ?? '',
    oib: profile?.oib ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    postal_code: profile?.postal_code ?? '',
    iban: profile?.iban ?? '',
  };
}

function TypeChoice({
  active,
  onClick,
  icon,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-surface-2',
      )}
    >
      <span className={active ? 'text-primary' : 'text-muted'}>{icon}</span>
      <span className="text-sm font-medium text-foreground">{title}</span>
    </button>
  );
}
