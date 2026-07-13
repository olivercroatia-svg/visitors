// The fiscalization layer is a REPLACEABLE component (plan's core decision).
// The app talks only to this interface; concrete providers (mock, and the real
// FinaProvider that talks to the tax authority's CIS) live behind it.

export interface FiscalTaxLine {
  rate: number;
  base: number;
  amount: number;
}

export interface FiscalInvoice {
  invoiceId: number;
  // Needed to load THIS taxpayer's certificate: every obveznik signs with their own.
  tenantId: number;
  numberFull: string;

  // The invoice number's three parts, which the real message sends separately and which
  // also feed the ZKI. numberFull alone cannot be taken apart reliably.
  seq: number;
  premiseCode: string;
  deviceCode: string;
  /** 'P' = numbering runs per premise, 'N' = per device. */
  sequenceMark: 'P' | 'N';

  issueDatetime: string; // 'YYYY-MM-DD HH:mm:ss'
  total: number;
  oib: string | null;
  /** OIB of the person issuing the invoice. Mandatory for the real service. */
  operatorOib: string | null;
  operatorLabel: string | null;
  paymentMethod: string;
  vatApplicable: boolean;
  vatLines: FiscalTaxLine[];
  /** OIB of the receiving company (B2B). Only for cash/card payments. */
  recipientOib?: string | null;
  /** true when the invoice already went to the customer without a JIR ("naknadna dostava"). */
  lateDelivery?: boolean;

  // Internal hint used by the mock to simulate a transient failure.
  attempt?: number;
  note?: string | null;
}

export interface FiscalizationResult {
  status: 'confirmed' | 'failed';
  jir?: string;
  // The ZKI is OURS: we compute it from the invoice and our own key, and it must be
  // printed on the receipt even when the tax authority is unreachable. So a provider
  // returns it on the failure path too — only the JIR depends on them.
  zki?: string;
  error?: string;
  // true  -> transport problem (network, 5xx, s006): re-sending unchanged may work.
  // false -> the message or the certificate is wrong (s001/s004/s005): retrying it forever
  //          just hammers the authority; a human has to fix something.
  retryable?: boolean;
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
