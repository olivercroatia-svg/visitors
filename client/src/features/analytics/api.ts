import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  premise_id?: number;
  payment_method?: string;
}

export interface Analytics {
  kpis: {
    revenue: number;
    invoice_count: number;
    avg_value: number;
    unique_guests: number;
    cash_total: number;
    cashless_total: number;
    total_nights: number;
  };
  by_month: { month: string; revenue: number; count: number }[];
  by_premise: { premise: string; code: string; revenue: number; count: number }[];
  by_payment: { method: string; revenue: number; count: number }[];
  by_category: { category: string; revenue: number }[];
  top_guests: { guest: string; revenue: number; count: number }[];
  by_country: { country: string; count: number; revenue: number }[];
}

export function buildQuery(f: AnalyticsFilters): string {
  const p = new URLSearchParams();
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.premise_id) p.set('premise_id', String(f.premise_id));
  if (f.payment_method && f.payment_method !== 'all') p.set('payment_method', f.payment_method);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery<Analytics>({
    queryKey: ['analytics', filters],
    queryFn: () => api.get(`/analytics${buildQuery(filters)}`),
    staleTime: 30_000,
  });
}

export const PAYMENT_LABEL: Record<string, string> = {
  gotovina: 'Gotovina',
  kartica: 'Kartica',
  transakcijski: 'Transakcijski',
  ostalo: 'Ostalo',
};
export const CATEGORY_LABEL: Record<string, string> = {
  smjestaj: 'Smještaj',
  standard: 'Standardna',
  snizena_5: 'Snižena 5%',
  oslobodeno: 'Oslobođeno',
};
