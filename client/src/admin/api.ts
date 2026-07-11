import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface PlatformStats {
  tenants: number;
  users: number;
  invoices: number;
  revenue: number;
  fiscalized: number;
  pending_fiscal: number;
  failed_fiscal: number;
  active_7d: number;
}

export interface TenantSummary {
  id: number;
  name: string;
  created_at: string;
  owner_email: string;
  owner_name: string;
  last_login_at: string | null;
  type: string | null;
  vat_status: string | null;
  invoice_count: number;
  revenue: number;
  pending_fiscal: number;
}

export interface TenantDetail extends Omit<TenantSummary, 'invoice_count' | 'revenue' | 'pending_fiscal'> {
  oib: string | null;
  city: string | null;
  uses_foreign_platforms: number;
  has_vat_id: number;
  invoices: {
    total: number;
    issued: number;
    cancelled: number;
    pending_fiscal: number;
    failed_fiscal: number;
    revenue: number;
  };
  recent_activity: { action: string; entity: string | null; entity_id: string | null; created_at: string; user_name: string | null }[];
}

export interface SystemHealth {
  fiscal_requests: Record<string, number>;
  problem_requests: { invoice_id: number; number_full: string; tenant_id: number; attempts: number; last_error: string | null; updated_at: string }[];
  notifications_total: number;
}

export interface PlatformSetting {
  setting_key: string;
  setting_value: string;
  description: string | null;
  updated_at: string;
}

export interface TaxRate {
  id: number;
  category: string;
  label: string;
  rate: string;
  valid_from: string;
  valid_to: string | null;
}

export interface AdminMunicipality {
  id: number;
  name: string;
  county: string;
  flat_tax_per_bed_eur: string | null;
  tourist_tax_high_eur: string | null;
  tourist_tax_low_eur: string | null;
}

export const useAdminStats = () => useQuery<PlatformStats>({ queryKey: ['admin', 'stats'], queryFn: () => api.get('/admin/stats') });
export const useTenants = () => useQuery<TenantSummary[]>({ queryKey: ['admin', 'tenants'], queryFn: () => api.get('/admin/tenants') });
export const useTenant = (id: number) =>
  useQuery<TenantDetail>({ queryKey: ['admin', 'tenant', id], queryFn: () => api.get(`/admin/tenants/${id}`), enabled: id > 0 });
export const useHealth = () => useQuery<SystemHealth>({ queryKey: ['admin', 'health'], queryFn: () => api.get('/admin/health') });
export const useSettings = () => useQuery<PlatformSetting[]>({ queryKey: ['admin', 'settings'], queryFn: () => api.get('/admin/settings') });
export const useTaxRates = () => useQuery<TaxRate[]>({ queryKey: ['admin', 'tax-rates'], queryFn: () => api.get('/admin/tax-rates') });
export const useAdminMunicipalities = () => useQuery<AdminMunicipality[]>({ queryKey: ['admin', 'municipalities'], queryFn: () => api.get('/admin/municipalities') });

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { key: string; value: string }) => api.put('/admin/settings', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });
}

export function useAddTaxRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { category: string; rate: number; valid_from: string }) => api.post('/admin/tax-rates', vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tax-rates'] }),
  });
}

export function useUpdateMunicipality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; flat_tax_per_bed_eur: number | null; tourist_tax_high_eur: number | null; tourist_tax_low_eur: number | null }) =>
      api.put(`/admin/municipalities/${vars.id}`, vars),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'municipalities'] }),
  });
}

export const CATEGORY_LABEL: Record<string, string> = {
  smjestaj: 'Smještaj',
  standard: 'Standardna',
  snizena_5: 'Snižena 5%',
  oslobodeno: 'Oslobođeno',
};
