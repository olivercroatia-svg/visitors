import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AccommodationObject {
  id: number;
  name: string;
  facility_code: string;
  premise_id: number | null;
  municipality_id: number | null;
  address: string | null;
  city: string | null;
  default_tt_category: string | null;
  active: number;
}

export interface Credentials {
  configured: boolean;
  username: string | null;
  environment: 'test' | 'prod';
  base_url: string | null;
  last_verified_at: string | null;
  last_error: string | null;
}

export interface CodebookEntry {
  code: string;
  label: string;
  parentCode: string | null;
  // false = we are serving our built-in fallback list because the codebook has never been
  // synced from eVisitor. The UI has to say so rather than imply the code is authoritative.
  synced: boolean;
}

export interface SystemMessage {
  id: number;
  stay_id: number | null;
  operation: string | null;
  severity: 'info' | 'warning' | 'error';
  message: string;
  guest_name: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export type CodebookKind =
  | 'country'
  | 'document_type'
  | 'tt_category'
  | 'settlement'
  | 'visa_type'
  | 'border_crossing'
  | 'arrival_org'
  | 'service_type';

export function useObjects() {
  return useQuery<AccommodationObject[]>({
    queryKey: ['objects'],
    queryFn: () => api.get('/objects'),
  });
}

export function useCredentials() {
  return useQuery<Credentials>({
    queryKey: ['evisitor-credentials'],
    queryFn: () => api.get('/evisitor/credentials'),
  });
}

export function useCodebook(kind: CodebookKind) {
  return useQuery<CodebookEntry[]>({
    queryKey: ['evisitor-codebook', kind],
    queryFn: () => api.get(`/evisitor/codebooks/${kind}`),
    staleTime: 60 * 60_000,
  });
}

// Ch. 4.4.6 — unacknowledged eVisitor system messages drive the banner on Boravci.
export function useOpenMessages() {
  return useQuery<SystemMessage[]>({
    queryKey: ['evisitor-messages', 'open'],
    queryFn: () => api.get('/evisitor/messages?open=1'),
  });
}

export function useInvalidateEvisitor() {
  const qc = useQueryClient();
  return () => {
    ['objects', 'evisitor-credentials', 'evisitor-messages', 'stays'].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
}

export function useEvisitorMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const invalidate = useInvalidateEvisitor();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}
