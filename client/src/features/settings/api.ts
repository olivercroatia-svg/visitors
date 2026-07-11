import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Device {
  id: number;
  premise_id: number;
  code: string;
  label: string | null;
}

export interface Premise {
  id: number;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  municipality_id: number | null;
  municipality_name: string | null;
  devices: Device[];
}

export interface Service {
  id: number;
  name: string;
  unit: string;
  default_price: number;
  vat_category: string;
  active: number;
}

export interface Municipality {
  id: number;
  name: string;
  county: string;
}

// Rate is used only for the client-side live preview; the server freezes the
// authoritative effective-dated rate at issue time.
export const VAT_CATEGORIES: { value: string; label: string; rate: number }[] = [
  { value: 'smjestaj', label: 'Smještaj (13%)', rate: 13 },
  { value: 'standard', label: 'Standardna (25%)', rate: 25 },
  { value: 'snizena_5', label: 'Snižena (5%)', rate: 5 },
  { value: 'oslobodeno', label: 'Oslobođeno (0%)', rate: 0 },
];

export const SERVICE_UNITS = ['noć', 'usluga', 'osoba', 'dan', 'kom'];

export function usePremises() {
  return useQuery<Premise[]>({ queryKey: ['premises'], queryFn: () => api.get('/premises') });
}

export function useServices() {
  return useQuery<Service[]>({ queryKey: ['services'], queryFn: () => api.get('/services') });
}

export function useMunicipalities() {
  return useQuery<Municipality[]>({
    queryKey: ['municipalities'],
    queryFn: () => api.get('/municipalities'),
    staleTime: 60 * 60_000,
  });
}

// Invalidate everything the onboarding gate depends on after a master-data
// change, so the dashboard checklist and invoice gate stay in sync.
export function useInvalidateMasterData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['premises'] });
    qc.invalidateQueries({ queryKey: ['services'] });
    qc.invalidateQueries({ queryKey: ['profile'] });
    qc.invalidateQueries({ queryKey: ['onboarding'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };
}

export function useMasterMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const invalidate = useInvalidateMasterData();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}
