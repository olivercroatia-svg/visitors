import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type SemaforLevel = 'ok' | 'warning' | 'danger';
export type VatStatus = 'nije_obveznik' | 'obveznik';

export interface ComplianceIssue {
  severity: 'warning' | 'danger';
  title: string;
  detail: string;
  link?: string;
}

export interface Obligation {
  key: string;
  title: string;
  description: string;
  due_date: string;
  category: 'porez' | 'pristojba' | 'obrazac' | 'pdv';
  days_until: number;
}

export interface ComplianceOverview {
  level: SemaforLevel;
  issues: ComplianceIssue[];
  threshold: {
    value: number;
    revenue_ytd: number;
    pct: number;
    warn_level: number;
    projected_year_end: number;
    projected_cross_date: string | null;
  };
  vat: {
    status: VatStatus;
    pending_change: { to_status: VatStatus; effective_date: string; reason: string | null } | null;
  };
  reverse_charge: { uses_foreign_platforms: boolean; has_vat_id: boolean; warning: boolean };
  profile: { type: string; beds_count: number | null; flat_tax_per_bed_eur: number | null };
  obligations: Obligation[];
  calendar_disclaimer: string;
  unread_notifications: number;
}

export function useCompliance() {
  return useQuery<ComplianceOverview>({
    queryKey: ['compliance'],
    queryFn: () => api.get('/compliance'),
    staleTime: 30_000,
  });
}

function useInvalidateCompliance() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['compliance'] });
    qc.invalidateQueries({ queryKey: ['me'] });
    qc.invalidateQueries({ queryKey: ['profile'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useChangeVatStatus() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (vars: { to_status: VatStatus; effective_date: string; reason: string | null }) =>
      api.post<ComplianceOverview>('/compliance/vat-status', vars),
    onSuccess: invalidate,
  });
}

export interface ComplianceSettings {
  uses_foreign_platforms: boolean;
  has_vat_id: boolean;
  beds_count: number | null;
  flat_tax_per_bed_eur: number | null;
}

export function useSaveComplianceSettings() {
  const invalidate = useInvalidateCompliance();
  return useMutation({
    mutationFn: (vars: ComplianceSettings) => api.put<ComplianceOverview>('/compliance/settings', vars),
    onSuccess: invalidate,
  });
}
