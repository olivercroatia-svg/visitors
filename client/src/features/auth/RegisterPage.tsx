import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Building2, Check } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { useAuth, type ProfileType, type VatStatus } from './AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileType, setProfileType] = useState<ProfileType>('privatni_iznajmljivac');
  const [vatStatus, setVatStatus] = useState<VatStatus>('nije_obveznik');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ fullName, businessName, email, password, profileType, vatStatus });
      showSuccess('Račun je uspješno kreiran. Dobrodošli!');
      navigate('/', { replace: true });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Registracija nije uspjela.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Otvorite račun"
      subtitle="Nekoliko podataka i spremni ste za prvi račun"
      footer={
        <>
          Već imate račun?{' '}
          <Link to="/prijava" className="font-medium text-primary hover:underline">
            Prijavite se
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <Field label="Ime i prezime">
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ana Anić" />
        </Field>

        <Field label="Naziv obrta / djelatnosti" hint="Npr. „Apartmani More” ili naziv vašeg obrta.">
          <Input
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Apartmani More"
          />
        </Field>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Vrsta djelatnosti</p>
          <div className="grid grid-cols-1 gap-2.5">
            <ChoiceCard
              active={profileType === 'privatni_iznajmljivac'}
              onClick={() => setProfileType('privatni_iznajmljivac')}
              icon={<Home className="h-5 w-5" />}
              title="Privatni iznajmljivač"
              desc="Fizička osoba s rješenjem, porez po krevetu / smještajnoj jedinici."
            />
            <ChoiceCard
              active={profileType === 'pausalni_obrt'}
              onClick={() => setProfileType('pausalni_obrt')}
              icon={<Building2 className="h-5 w-5" />}
              title="Paušalni obrt"
              desc="Obrt za smještaj koji vodi knjigu prometa i fiskalizira račune."
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Status u sustavu PDV-a</p>
          <div className="grid grid-cols-2 gap-2.5">
            <ChoiceChip
              active={vatStatus === 'nije_obveznik'}
              onClick={() => setVatStatus('nije_obveznik')}
              title="Nisam obveznik"
            />
            <ChoiceChip
              active={vatStatus === 'obveznik'}
              onClick={() => setVatStatus('obveznik')}
              title="Obveznik PDV-a"
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Ako tijekom godine prijeđete prag prometa, status kasnije mijenjate u par klikova — aplikacija
            vas na vrijeme upozori.
          </p>
        </div>

        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vi@primjer.hr"
          />
        </Field>

        <Field label="Lozinka" hint="Najmanje 8 znakova.">
          <Input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <Button type="submit" size="lg" loading={loading} className="w-full">
          Kreiraj račun
        </Button>
      </form>
    </AuthLayout>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors',
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-surface-2',
      )}
    >
      <span className={cn('mt-0.5', active ? 'text-primary' : 'text-muted')}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs text-muted">{desc}</span>
      </span>
      {active && <Check className="h-5 w-5 text-primary" />}
    </button>
  );
}

function ChoiceChip({ active, onClick, title }: { active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-border text-muted hover:bg-surface-2',
      )}
    >
      {title}
    </button>
  );
}
