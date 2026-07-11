// The fiscalization layer is a REPLACEABLE component (plan's core decision).
// The app talks only to this interface; concrete providers (mock now, a real
// Croatian provider in Phase 5) live behind it.

export interface FiscalInvoice {
  invoiceId: number;
  numberFull: string;
  issueDatetime: string; // 'YYYY-MM-DD HH:mm:ss'
  total: number;
  oib: string | null;
  operatorLabel: string | null;
  paymentMethod: string;
  vatApplicable: boolean;
  // Internal hint used by the mock to simulate a transient failure.
  attempt?: number;
  note?: string | null;
}

export interface FiscalizationResult {
  status: 'confirmed' | 'failed';
  jir?: string;
  zki?: string;
  error?: string;
}

export interface FiscalizationStatus {
  status: 'confirmed' | 'pending' | 'failed' | 'unknown';
  jir?: string;
}

export interface FiscalizationProvider {
  readonly name: string;
  fiscalize(invoice: FiscalInvoice): Promise<FiscalizationResult>;
  cancel(invoice: FiscalInvoice): Promise<FiscalizationResult>;
  checkStatus(requestId: string): Promise<FiscalizationStatus>;
}
