import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { isValidOib } from '@/lib/oib';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/Confirm';
import { useAuth } from '@/features/auth/AuthProvider';
import { fileToBase64, useCertificate, useFiscalMutation } from './api';

export function CertificateSection() {
  const cert = useCertificate();
  const { user, profile } = useAuth();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'prod'>('test');
  const [replacing, setReplacing] = useState(false);

  const [sequenceMark, setSequenceMark] = useState<'P' | 'N'>('N');
  const [operatorOib, setOperatorOib] = useState('');

  useEffect(() => {
    if (!cert.data) return;
    setEnvironment(cert.data.environment);
    setReplacing(!cert.data.configured);
  }, [cert.data]);

  useEffect(() => {
    setSequenceMark(profile?.sequence_mark ?? 'N');
    setOperatorOib(user?.oib ?? '');
  }, [profile?.sequence_mark, user?.oib]);

  const saveCert = useFiscalMutation((body: Record<string, unknown>) =>
    api.put('/fiscal/certificate', body),
  );
  const removeCert = useFiscalMutation(() => api.del('/fiscal/certificate'));
  const saveSettings = useFiscalMutation(async (body: { sequence_mark: 'P' | 'N'; oib: string }) => {
    await api.put('/fiscal/sequence-mark', { sequence_mark: body.sequence_mark });
    await api.put('/fiscal/operator-oib', { oib: body.oib });
  });

  const configured = cert.data?.configured ?? false;
  const oibValid = operatorOib === '' || isValidOib(operatorOib);

  const upload = async () => {
    if (!file) {
      showError('Odaberite .p12 datoteku certifikata.');
      return;
    }
    try {
      await saveCert.mutateAsync({
        p12_base64: await fileToBase64(file),
        password,
        environment,
        filename: file.name,
      });
      setFile(null);
      setPassword('');
      setReplacing(false);
      if (fileInput.current) fileInput.current.value = '';
      showSuccess('Certifikat je spremljen.');
    } catch (err) {
      // The server rejects a wrong password, a certificate without an OIB, and an OIB that
      // does not match the obrt — all as 422 with a Croatian message. Show it verbatim.
      showError(err instanceof ApiError ? err.message : 'Certifikat nije moguće učitati.');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Obrisati certifikat?',
      message: 'Bez certifikata računi se više neće moći fiskalizirati.',
      confirmLabel: 'Obriši',
      danger: true,
    });
    if (!ok) return;
    try {
      await removeCert.mutateAsync(undefined as never);
      setReplacing(true);
      showSuccess('Certifikat je obrisan.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Brisanje nije uspjelo.');
    }
  };

  const submitSettings = async () => {
    if (!oibValid) {
      showError('OIB operatera nije ispravan.');
      return;
    }
    try {
      await saveSettings.mutateAsync({ sequence_mark: sequenceMark, oib: operatorOib.trim() });
      showSuccess('Postavke fiskalizacije su spremljene.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Spremanje nije uspjelo.');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Digitalni certifikat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Za fiskalizaciju je potreban napredni certifikat (npr. FINA) koji glasi na{' '}
            <strong>isti OIB kao vaš obrt</strong>. Certifikat se čuva šifrirano i koristi se
            isključivo za potpisivanje računa koje šaljemo Poreznoj upravi.
          </p>

          {configured && !replacing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-success">
                <ShieldCheck className="h-4 w-4" />
                Certifikat je postavljen{cert.data?.filename ? ` — ${cert.data.filename}` : ''}
              </div>

              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Row label="OIB u certifikatu" value={cert.data?.subject_oib ?? '—'} />
                <Row
                  label="Okolina"
                  value={cert.data?.environment === 'prod' ? 'Produkcija' : 'Testna okolina'}
                />
                <Row label="Vrijedi od" value={fmtDate(cert.data?.valid_from)} />
                <Row
                  label="Vrijedi do"
                  value={fmtDate(cert.data?.valid_to)}
                  danger={cert.data?.expired}
                />
              </dl>

              {cert.data?.expired && (
                <p className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Certifikat je istekao. Računi se neće fiskalizirati dok ga ne zamijenite.
                </p>
              )}
              {cert.data?.last_verified_at && !cert.data.last_error && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Zadnja uspješna fiskalizacija: {fmtDateTime(cert.data.last_verified_at)}
                </p>
              )}
              {cert.data?.last_error && (
                <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
                  Porezna uprava je odbila certifikat: {cert.data.last_error}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setReplacing(true)}>
                  <Upload className="h-4 w-4" />
                  Zamijeni certifikat
                </Button>
                <Button variant="danger" onClick={remove} loading={removeCert.isPending}>
                  <Trash2 className="h-4 w-4" />
                  Obriši
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Datoteka certifikata" hint="Format .p12 (PKCS#12).">
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".p12,.pfx"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:opacity-80"
                  />
                </Field>

                <Field label="Lozinka certifikata">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>

                <Field
                  label="Okolina"
                  hint="Porezna preporučuje najmanje dva dana rada na testnoj okolini."
                >
                  <Select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as 'test' | 'prod')}
                  >
                    <option value="test">Testna okolina</option>
                    <option value="prod">Produkcija</option>
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={upload} loading={saveCert.isPending}>
                  Spremi certifikat
                </Button>
                {configured && (
                  <Button variant="ghost" onClick={() => setReplacing(false)}>
                    Odustani
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Postavke fiskalnog računa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Slijednost brojeva računa"
              hint="Mora odgovarati onome što ste prijavili Poreznoj upravi."
            >
              <Select
                value={sequenceMark}
                onChange={(e) => setSequenceMark(e.target.value as 'P' | 'N')}
              >
                <option value="N">Po naplatnom uređaju</option>
                <option value="P">Na razini poslovnog prostora</option>
              </Select>
            </Field>

            <Field
              label="OIB operatera"
              hint="Osoba koja izdaje račun. Ostavite prazno ako to radite sami — tada se koristi OIB obrta."
              error={oibValid ? undefined : 'Neispravan OIB.'}
            >
              <Input
                value={operatorOib}
                onChange={(e) => setOperatorOib(e.target.value)}
                placeholder={profile?.oib ?? ''}
                inputMode="numeric"
                maxLength={11}
              />
            </Field>
          </div>

          <Button onClick={submitSettings} loading={saveSettings.isPending}>
            Spremi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={danger ? 'font-medium text-danger' : 'font-medium text-foreground'}>{value}</dd>
    </div>
  );
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return `${d}.${m}.${y}.`;
}

function fmtDateTime(value: string): string {
  return `${fmtDate(value)} ${value.slice(11, 16)}`;
}
