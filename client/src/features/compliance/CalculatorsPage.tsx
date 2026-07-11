import { useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Input, Field } from '@/components/ui/Input';
import { formatEur } from '@/lib/utils';
import { useCompliance } from './api';

// Simple, transparent calculators. Rates are editable (they vary by JLS and
// year) with a disclaimer — no fabricated authoritative numbers.
export function CalculatorsPage() {
  const { data: c } = useCompliance();
  const [beds, setBeds] = useState<string>(() => (c?.profile.beds_count ? String(c.profile.beds_count) : '4'));
  const [flatPerBed, setFlatPerBed] = useState<string>(() =>
    c?.profile.flat_tax_per_bed_eur ? String(c.profile.flat_tax_per_bed_eur) : '150',
  );
  const [touristPerBed, setTouristPerBed] = useState<string>('50');
  const [tzMembership, setTzMembership] = useState<string>('0');

  const b = num(beds);
  const flatAnnual = b * num(flatPerBed);
  const touristAnnual = b * num(touristPerBed);
  const tz = num(tzMembership);
  const totalAnnual = flatAnnual + touristAnnual + tz;

  return (
    <div className="space-y-4">
      <Link to="/obveze" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Porezne obveze
      </Link>
      <h2 className="text-xl font-semibold text-foreground">Kalkulatori</h2>

      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-semibold text-foreground">Osnovni podaci</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Broj kreveta">
            <Input inputMode="numeric" value={beds} onChange={(e) => setBeds(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
      </Card>

      <CalcCard
        title="Paušalni porez na dohodak"
        rateLabel="Godišnja stopa po krevetu (€)"
        rateValue={flatPerBed}
        onRate={setFlatPerBed}
        annual={flatAnnual}
        note="Godišnji paušalni porez ovisi o stopi koju određuje vaša općina/grad (rasponi se razlikuju)."
        quarter
      />

      <CalcCard
        title="Turistička pristojba (paušalna)"
        rateLabel="Godišnja pristojba po krevetu (€)"
        rateValue={touristPerBed}
        onRate={setTouristPerBed}
        annual={touristAnnual}
        note="Paušalna godišnja turistička pristojba po krevetu, ovisi o razredu turističkog mjesta."
      />

      <Card className="space-y-3 p-5">
        <Field label="Članarina turističkoj zajednici (godišnje, €)" hint="Ako je primjenjivo za vašu djelatnost.">
          <Input inputMode="decimal" value={tzMembership} onChange={(e) => setTzMembership(cleanNum(e.target.value))} />
        </Field>
      </Card>

      {/* Total */}
      <Card className="border-primary/30 bg-primary/5 p-5">
        <p className="text-sm text-muted">Procijenjeno godišnje porezno opterećenje</p>
        <p className="mt-1 text-3xl font-semibold text-primary tnum">{formatEur(totalAnnual)}</p>
        <div className="mt-3 space-y-1 text-sm">
          <Row label="Paušalni porez" value={formatEur(flatAnnual)} />
          <Row label="Turistička pristojba" value={formatEur(touristAnnual)} />
          {tz > 0 && <Row label="TZ članarina" value={formatEur(tz)} />}
        </div>
        <p className="mt-3 text-xs text-muted">Po kvartalu (porez): {formatEur(flatAnnual / 4)}</p>
      </Card>

      <div className="flex items-start gap-2 rounded-xl bg-surface-2 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <p className="text-xs text-muted">
          Iznosi su procjena. Točne stope po krevetu i pristojbe određuje vaša JLS — provjerite ih i potvrdite s
          knjigovođom.
        </p>
      </div>
    </div>
  );
}

function CalcCard({
  title,
  rateLabel,
  rateValue,
  onRate,
  annual,
  note,
  quarter,
}: {
  title: string;
  rateLabel: string;
  rateValue: string;
  onRate: (v: string) => void;
  annual: number;
  note: string;
  quarter?: boolean;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <Field label={rateLabel}>
        <Input inputMode="decimal" value={rateValue} onChange={(e) => onRate(cleanNum(e.target.value))} />
      </Field>
      <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
        <span className="text-sm text-muted">Godišnje</span>
        <span className="text-lg font-semibold text-foreground tnum">{formatEur(annual)}</span>
      </div>
      {quarter && <p className="text-xs text-muted">Kvartalna rata: {formatEur(annual / 4)}</p>}
      <p className="text-xs text-muted-2">{note}</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{label}</span>
      <span className="tnum text-foreground">{value}</span>
    </div>
  );
}

function num(s: string): number {
  return Number(s.replace(',', '.')) || 0;
}
function cleanNum(s: string): string {
  return s.replace(/[^0-9.,]/g, '');
}
