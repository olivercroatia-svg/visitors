import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type ProfileType = 'privatni_iznajmljivac' | 'pausalni_obrt';
export type VatStatus = 'nije_obveznik' | 'obveznik';

export interface User {
  id: number;
  tenant_id: number;
  email: string;
  full_name: string;
  tenant_role: 'owner' | 'member';
  platform_role: 'user' | 'admin';
  last_login_at: string | null;
}

export interface BusinessProfile {
  id: number;
  tenant_id: number;
  type: ProfileType;
  legal_name: string | null;
  oib: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  iban: string | null;
  vat_status: VatStatus;
  onboarding_completed: number;
}

interface MeResponse {
  user: User;
  profile: BusinessProfile | null;
}

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  profileType: ProfileType;
  vatStatus: VatStatus;
}

interface AuthContextValue {
  user: User | null;
  profile: BusinessProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<MeResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/auth/me');
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (vars: { email: string; password: string }) =>
      api.post<{ user: User }>('/auth/login', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const registerMutation = useMutation({
    mutationFn: (payload: RegisterPayload) => api.post<{ user: User }>('/auth/register', payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const value: AuthContextValue = {
    user: data?.user ?? null,
    profile: data?.profile ?? null,
    isLoading,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password });
    },
    register: async (payload) => {
      await registerMutation.mutateAsync(payload);
    },
    logout: async () => {
      await api.post('/auth/logout');
      qc.setQueryData(['me'], null);
      qc.clear();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
