import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Save } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { formatDate, cn } from '@/lib/utils';
import {
  useSettings,
  useUpdateSetting,
  useTaxRates,
  useAddTaxRate,
  useAdminMunicipalities,
  useUpdateMunicipality,
  CATEGORY_LABEL,
  type AdminMunicipality,
} from './api';

export function AdminSettings() {
  return (
    <div className="space-y-5">
      <PlatformSettingsCard />
      <TaxRatesCard />
      <MunicipalitiesCard />
    </div>
  );
}

// ---- Platform settings ------------------------------------------------------

const SETTING_META: Record<string, { label: string; hint: string; suffix?: string }> = {
  pdv_threshold_eur: { label: 'Prag za ulazak u sustav PDV-a', hint: 'Godišnji promet iznad kojeg se ulazi u sustav PDV-a.', suffix: '€' },
  pdv_threshold_warn_levels: { label: 'Razine upozorenja praga', hint: 'Postoci na kojima se korisnik upozorava (npr. 70,85,95).', suffix: '%' },
  fiscal_retry_deadline_hours: { label: 'Rok naknadne fiskalizacije', hint: 'Sati za naknadnu fiskalizaciju kod greške.', suffix: 'h' },
};

function PlatformSettingsCard() {
  const { data: settings } = useSettings();
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Postavke platforme</h3>
      <div className="space-y-4">
        {settings?.map((s) => <SettingRow key={s.setting_key} settingKey={s.setting_key} value={s.setting_value} />)}
      </div>
    </Card>
  );
}

function SettingRow({ settingKey, value }: { settingKey: string; value: string }) {
  const meta = SETTING_META[settingKey] ?? { label: settingKey, hint: '' };
  const update = useUpdateSetting();
  const { showSuccess, showError } = useToast();
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  const dirty = val !== value;

  async function save() {
    try {
      await update.mutateAsync({ key: settingKey, value: val });
      showSuccess('Postavka spremljena.');
    } catch {
      showError('Greška pri spremanju.');
    }
  }

  return (
    <Field label={meta.label} hint={meta.hint}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input value={val} onChange={(e) => setVal(e.target.value)} />
          {meta.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{meta.suffix}</span>}
        </div>
        <Button size="md" onClick={save} disabled={!dirty} loading={update.isPending}>
          Spremi
        </Button>
      </div>
    </Field>
  );
}

// ---- Effective-dated tax rates ---------------------------------------------

function TaxRatesCard() {
  const { data: rates } = useTaxRates();
  const add = useAddTaxRate();
  const { showSuccess, showError } = useToast();
  const [category, setCategory] = useState('smjestaj');
  const [rate, setRate] = useState('');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));

  const today = new Date().toISOString().slice(0, 10);
  const grouped = useMemo(() => {
    const map = new Map<string, typeof rates>();
    rates?.forEach((r) => {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    });
    return map;
  }, [rates]);

  async function submit() {
    if (!rate) return;
    try {
      await add.mutateAsync({ category, rate: Number(rate.replace(',', '.')), valid_from: validFrom });
      showSuccess('Nova stopa je dodana i vrijedi od odabranog datuma.');
      setRate('');
    } catch (err: any) {
      showError(err?.message ?? 'Greška.');
    }
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">Stope PDV-a</h3>
      <p className="mb-4 text-xs text-muted">
        Promjena stope vrijedi od datuma stupanja na snagu. Računi izdani od tog datuma automatski koriste novu
        stopu; postojeći ostaju nepromijenjeni.
      </p>

      <div className="space-y-3">
        {[...grouped.entries()].map(([cat, list]) => (
          <div key={cat} className="rounded-xl border border-border p-3">
            <p className="mb-1.5 text-sm font-medium text-foreground">{CATEGORY_LABEL[cat] ?? cat}</p>
            <div className="flex flex-wrap gap-2">
              {list!.map((r) => {
                const active = r.valid_from <= today && (!r.valid_to || r.valid_to >= today);
                return (
                  <span key={r.id} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-xs">
                    <span className="font-semibold text-foreground tnum">{Number(r.rate)}%</span>
                    <span className="text-muted">
                      od {formatDate(r.valid_from)}
                      {r.valid_to ? ` do ${formatDate(r.valid_to)}` : ''}
                    </span>
                    {active && <Badge tone="success">aktivna</Badge>}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-border p-3">
        <p className="mb-2 text-xs font-medium text-foreground">Dodaj novu stopu</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <div className="relative">
            <Input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="Stopa" inputMode="decimal" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
          </div>
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          <Button onClick={submit} disabled={!rate} loading={add.isPending}>
            <Plus className="h-4 w-4" /> Dodaj
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---- JLS (municipalities) ---------------------------------------------------

function MunicipalitiesCard() {
  const { data: munis } = useAdminMunicipalities();
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => munis?.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) ?? [],
    [munis, q],
  );

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">JLS — stope po općini/gradu</h3>
      <p className="mb-3 text-xs text-muted">Paušalni porez po krevetu i turistička pristojba koje koriste kalkulatori.</p>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pretraži JLS…" className="pl-10" />
      </div>
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {filtered.map((m) => (
          <MuniRow key={m.id} muni={m} />
        ))}
      </div>
    </Card>
  );
}

function MuniRow({ muni }: { muni: AdminMunicipality }) {
  const update = useUpdateMunicipality();
  const { showSuccess } = useToast();
  const [bed, setBed] = useState(muni.flat_tax_per_bed_eur ?? '');
  const [high, setHigh] = useState(muni.tourist_tax_high_eur ?? '');
  const [low, setLow] = useState(muni.tourist_tax_low_eur ?? '');
  const dirty = bed !== (muni.flat_tax_per_bed_eur ?? '') || high !== (muni.tourist_tax_high_eur ?? '') || low !== (muni.tourist_tax_low_eur ?? '');

  const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  async function save() {
    await update.mutateAsync({ id: muni.id, flat_tax_per_bed_eur: n(bed), tourist_tax_high_eur: n(high), tourist_tax_low_eur: n(low) });
    showSuccess(`${muni.name} spremljeno.`);
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-foreground">{muni.name}</span>
          <span className="ml-1.5 text-xs text-muted">{muni.county}</span>
        </div>
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className={cn('flex h-8 w-8 items-center justify-center rounded-lg', dirty ? 'text-primary hover:bg-surface-2' : 'text-muted-2')}
          aria-label="Spremi"
        >
          <Save className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MiniField label="Porez/krevet" value={bed} onChange={setBed} />
        <MiniField label="Pristojba (viša)" value={high} onChange={setHigh} />
        <MiniField label="Pristojba (niža)" value={low} onChange={setLow} />
      </div>
    </div>
  );
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))}
        inputMode="decimal"
        placeholder="—"
        className="h-9 w-full rounded-lg border border-input bg-surface px-2.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring"
      />
    </div>
  );
}
