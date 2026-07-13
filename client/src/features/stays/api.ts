import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type StayStatus = 'draft' | 'checked_in' | 'checked_out' | 'cancelled';
export type EvisitorStatus = 'none' | 'pending' | 'confirmed' | 'failed';

export interface Stay {
  id: number;
  status: StayStatus;
  evisitor_status: EvisitorStatus;
  evisitor_id: string | null;
  check_in_at: string;
  foreseen_check_out_at: string;
  check_out_at: string | null;
  tt_category: string;
  last_error: string | null;
  guest_name: string;
  guest_id: number;
  object_name: string;
  object_id: number;
}

export interface StayMessage {
  id: number;
  severity: 'info' | 'warning' | 'error';
  message: string;
  operation: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface StayRequest {
  id: number;
  operation: string;
  status: string;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string | null;
  created_at: string;
}

export interface StayDetail extends Stay {
  arrival_org: string;
  service_type: string;
  note: string | null;
  facility_code: string;
  cancelled_reason: string | null;
  registered_at: string | null;
  messages: StayMessage[];
  requests: StayRequest[];
}

export interface Issue {
  field: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface StayInput {
  object_id: number;
  guest_id: number;
  check_in_at: string;
  foreseen_check_out_at: string;
  tt_category: string;
  arrival_org: string;
  service_type: string;
  note?: string | null;
}

export function useStays(filters: { status?: string; object_id?: number; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.object_id) params.set('object_id', String(filters.object_id));
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();

  return useQuery<Stay[]>({
    queryKey: ['stays', filters],
    queryFn: () => api.get(`/stays${qs ? `?${qs}` : ''}`),
  });
}

export function useStay(id: number) {
  return useQuery<StayDetail>({
    queryKey: ['stays', id],
    queryFn: () => api.get(`/stays/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

// The form's inline errors come from the server's validator, so the rules can't drift
// between what the form allows and what the check-in gate accepts.
export function validateStay(input: StayInput): Promise<{ issues: Issue[] }> {
  return api.post('/stays/validate', input);
}

export function useInvalidateStays() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['stays'] });
    qc.invalidateQueries({ queryKey: ['evisitor-messages'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
}

export function useStayMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const invalidate = useInvalidateStays();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}
