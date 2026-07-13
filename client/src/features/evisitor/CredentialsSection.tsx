import { useEffect, useState } from 'react';
import { CheckCircle2, Plug, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useCredentials, useEvisitorMutation } from './api';

export function CredentialsSection() {
  const creds = useCredentials();
  const { showSuccess, showError } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apikey, setApikey] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'prod'>('test');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!creds.data) return;
    setUsername(creds.data.username ?? '');
    setEnvironment(creds.data.environment);
    setChangingPassword(!creds.data.configured);
  }, [creds.data]);

  const save = useEvisitorMutation((body: Record<string, unknown>) =>
    api.put('/evisitor/credentials', body),
  );
  const test = useEvisitorMutation(() => api.post('/evisitor/credentials/test', {}));
  const syncCodebooks = useEvisitorMutation(() => api.post('/evisitor/codebooks/sync', {}));

  const submit = async () => {
    try {
      // Omitting `password` means "keep the stored one" — the current value is never sent
      // to the browser, so there is nothing to send back.
      await save.mutateAsync({
        username,
        environment,
        ...(changingPassword && password ? { password } : {}),
        ...(apikey ? { apikey } : {}),
      });
      setPassword('');
      setChangingPassword(false);
      showSuccess('Pristupni podaci su spremljeni.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Spremanje nije uspjelo.');
    }
  };

  const doTest = async () => {
    try {
      await test.mutateAsync(undefined as never);
      showSuccess('Veza s eVisitorom radi.');
    } catch (err) {
      // eVisitor's own message, verbatim — ch. 4.4.6.
      showError(err instanceof ApiError ? err.message : 'Veza nije uspjela.');
    }
  };

  const doSync = async () => {
    try {
      await syncCodebooks.mutateAsync(undefined as never);
      showSuccess('Šifrarnici su sinkronizirani.');
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Sinkronizacija nije uspjela.');
    }
  };

  const configured = creds.data?.configured ?? false;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>eVisitor pristupni podaci</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted">
            Pristupne podatke otvarate sami kod svoje turističke zajednice. Preporuka HTZ-a je da za
            aplikaciju otvorite <strong>poseban API podkorisnički račun</strong>, odvojen od onoga
            kojim se prijavljujete na eVisitor web.
          </p>

          {creds.data?.last_verified_at && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Veza potvrđena: {creds.data.last_verified_at.slice(0, 16).replace('T', ' ')}
            </div>
          )}
          {creds.data?.last_error && (
            <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {creds.data.last_error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Korisničko ime">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>

            <Field label="Okolina" hint="Testirajte na testnoj okolini prije prelaska na produkciju.">
              <Select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as 'test' | 'prod')}
              >
                <option value="test">Testna okolina</option>
                <option value="prod">Produkcija</option>
              </Select>
            </Field>

            <Field label="Lozinka">
              {configured && !changingPassword ? (
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-muted">Lozinka je spremljena.</p>
                  <Button variant="ghost" size="sm" onClick={() => setChangingPassword(true)}>
                    Promijeni
                  </Button>
                </div>
              ) : (
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              )}
            </Field>

            <Field label="API ključ" hint="Potreban samo na testnoj okolini. Ostavite prazno ako ga nemate.">
              <Input
                type="password"
                value={apikey}
                onChange={(e) => setApikey(e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={submit} loading={save.isPending}>
              Spremi
            </Button>
            <Button variant="ghost" onClick={doTest} loading={test.isPending} disabled={!configured}>
              <Plug className="h-4 w-4" />
              Testiraj vezu
            </Button>
            <Button
              variant="ghost"
              onClick={doSync}
              loading={syncCodebooks.isPending}
              disabled={!configured}
            >
              <RefreshCw className="h-4 w-4" />
              Sinkroniziraj šifrarnike
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
