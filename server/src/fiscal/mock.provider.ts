import crypto from 'crypto';
import type {
  FiscalInvoice,
  FiscalizationProvider,
  FiscalizationResult,
  FiscalizationStatus,
} from './types';

// Development provider: returns plausible JIR/ZKI without contacting the tax
// authority. To exercise the retry queue, an invoice whose note contains
// "MOCKFAIL" fails on its first attempt and succeeds on later ones.
export class MockProvider implements FiscalizationProvider {
  readonly name = 'mock';

  private makeJir(): string {
    return crypto.randomUUID();
  }

  private makeZki(inv: FiscalInvoice): string {
    return crypto
      .createHash('md5')
      .update(`${inv.numberFull}|${inv.issueDatetime}|${inv.total}|${inv.oib ?? ''}`)
      .digest('hex');
  }

  async fiscalize(inv: FiscalInvoice): Promise<FiscalizationResult> {
    await delay();
    if (inv.note?.includes('MOCKFAIL') && (inv.attempt ?? 1) <= 1) {
      // Like the real provider, the ZKI survives a failed transfer — it is ours, not theirs.
      return {
        status: 'failed',
        zki: this.makeZki(inv),
        retryable: true,
        error: 'Simulirana greška veze (MOCKFAIL). Pokušat ćemo ponovno.',
      };
    }
    return { status: 'confirmed', jir: this.makeJir(), zki: this.makeZki(inv), retryable: false };
  }

  async cancel(inv: FiscalInvoice): Promise<FiscalizationResult> {
    await delay();
    return { status: 'confirmed', jir: this.makeJir(), zki: this.makeZki(inv), retryable: false };
  }

  async checkStatus(): Promise<FiscalizationStatus> {
    return { status: 'unknown' };
  }
}

function delay(ms = 120): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
