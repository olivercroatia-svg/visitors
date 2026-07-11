import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { showError } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      showError(err instanceof ApiError ? err.message : 'Prijava nije uspjela.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Prijava"
      subtitle="Dobrodošli natrag u Visitors"
      footer={
        <>
          Nemate račun?{' '}
          <Link to="/registracija" className="font-medium text-primary hover:underline">
            Registrirajte se
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-sm">
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
        <Field label="Lozinka">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Button type="submit" size="lg" loading={loading} className="w-full">
          Prijavi se
        </Button>
      </form>
    </AuthLayout>
  );
}
