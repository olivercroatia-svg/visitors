import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type FiscalStatus = 'none' | 'pending' | 'confirmed' | 'failed' | 'not_required';
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type PaymentMethod = 'gotovina' | 'kartica' | 'transakcijski' | 'ostalo';

export interface InvoiceListItem {
  id: number;
  doc_type: 'invoice' | 'storno';
  number_full: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  total: string;
  currency: string;
  fiscal_status: FiscalStatus;
  jir: string | null;
  guest_name_cache: string | null;
  payment_method: PaymentMethod;
}

export interface InvoiceItem {
  id: number;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  vat_category: string;
  vat_rate: string;
  line_base: string;
  line_vat: string;
  line_total: string;
}

export interface InvoiceDetail {
  id: number;
  doc_type: 'invoice' | 'storno';
  number_full: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  issue_datetime: string | null;
  due_date: string | null;
  payment_method: PaymentMethod;
  vat_applicable: number;
  vat_clause: string | null;
  subtotal: string;
  vat_total: string;
  total: string;
  currency: string;
  operator_label: string | null;
  note: string | null;
  jir: string | null;
  zki: string | null;
  fiscal_status: FiscalStatus;
  guest_name_cache: string | null;
  guest_first: string | null;
  guest_last: string | null;
  // Frozen copy of the buyer's company, taken when the invoice was created.
  company_name_cache: string | null;
  company_oib_cache: string | null;
  company_vat_id_cache: string | null;
  company_address_cache: string | null;
  company_postal_code_cache: string | null;
  company_city_cache: string | null;
  company_country_cache: string | null;
  premise_name: string | null;
  premise_code: string | null;
  device_code: string | null;
  cancelled_reason: string | null;
  cancels_invoice_id: number | null;
  cancelled_by: { id: number; number_full: string; jir: string | null } | null;
  items: InvoiceItem[];
  qr_data_url: string | null;
}

export interface InvoiceStats {
  revenue_ytd: number;
  issued_count: number;
  fiscalized_count: number;
  pending_fiscal: number;
}

export interface NewInvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_category: string;
}

export interface IssueInvoicePayload {
  premise_id: number;
  device_id: number;
  guest_id?: number | null;
  guest_name?: string | null;
  company_id?: number | null;
  payment_method: PaymentMethod;
  note?: string | null;
  items: NewInvoiceItem[];
}

export function useInvoices(filters: { status?: string; q?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return useQuery<InvoiceListItem[]>({
    queryKey: ['invoices', filters],
    queryFn: () => api.get(`/invoices${qs ? `?${qs}` : ''}`),
  });
}

export function useInvoice(id: number) {
  return useQuery<InvoiceDetail>({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useInvoiceStats() {
  return useQuery<InvoiceStats>({
    queryKey: ['invoice-stats'],
    queryFn: () => api.get('/invoices/stats'),
    staleTime: 30_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['invoice-stats'] });
  };
}

export function useIssueInvoice() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: IssueInvoicePayload) => api.post<InvoiceDetail>('/invoices/issue', payload),
    onSuccess: invalidate,
  });
}

export function useStorno(id: number) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => api.post<InvoiceDetail>(`/invoices/${id}/storno`, { reason }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useRetryFiscal(id: number) {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<InvoiceDetail>(`/invoices/${id}/retry-fiscal`),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'gotovina', label: 'Gotovina' },
  { value: 'kartica', label: 'Kartica' },
  { value: 'transakcijski', label: 'Transakcijski' },
  { value: 'ostalo', label: 'Ostalo' },
];
