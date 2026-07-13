import { fallbackCodebook } from './codebooks';
import type {
  CodebookEntry,
  CodebookKind,
  EVisitorCheckIn,
  EVisitorCheckOut,
  EVisitorCredentials,
  EVisitorFacility,
  EVisitorProvider,
  EVisitorResult,
} from './types';

// Development provider: no network, plausible behaviour. Trigger words in the document
// number or the stay note drive the failure modes, so the whole lifecycle — including
// the retry queue and the ch. 4.4.6 message panel — can be exercised before we have any
// real eVisitor credentials. Mirrors fiscal/mock.provider.ts and its MOCKFAIL trick.
//
//   MOCKFAIL — transient failure on the first attempt, then succeeds (retryable)
//   MOCKDUP  — permanent business rejection, never retried
//   MOCKWARN — succeeds, but returns a system message
export class MockProvider implements EVisitorProvider {
  readonly name = 'mock';

  async verifyCredentials(creds: EVisitorCredentials): Promise<EVisitorResult> {
    await delay();
    if (creds.password.includes('MOCKFAIL')) {
      return fail('Neispravno korisničko ime ili lozinka.', false);
    }
    return ok();
  }

  async checkIn(_creds: EVisitorCredentials, items: EVisitorCheckIn[]): Promise<EVisitorResult> {
    await delay();
    const item = items[0];
    if (!item) return ok();

    const triggers = `${item.documentNumber} ${item.note ?? ''}`;

    if (triggers.includes('MOCKDUP')) {
      return fail(
        'Turist je već prijavljen u navedenom objektu ili dva puta prijavljujete istog turista.',
        false,
      );
    }
    if (triggers.includes('MOCKFAIL') && (item.attempt ?? 1) <= 1) {
      return fail('Greška u komunikaciji sa sustavom eVisitor. Pokušat ćemo ponovno.', true);
    }
    if (triggers.includes('MOCKWARN')) {
      return {
        status: 'confirmed',
        retryable: false,
        messages: [{ severity: 'warning', text: 'Gost je mlađi od 10 dana.' }],
      };
    }
    return ok();
  }

  async checkOut(_creds: EVisitorCredentials, items: EVisitorCheckOut[]): Promise<EVisitorResult> {
    await delay();
    const item = items[0];
    if (item?.note?.includes('MOCKFAIL') && (item.attempt ?? 1) <= 1) {
      return fail('Greška u komunikaciji sa sustavom eVisitor. Pokušat ćemo ponovno.', true);
    }
    return ok();
  }

  async cancel(): Promise<EVisitorResult> {
    await delay();
    return ok();
  }

  async fetchCodebook(_creds: EVisitorCredentials, kind: CodebookKind): Promise<CodebookEntry[]> {
    await delay();
    return fallbackCodebook(kind);
  }

  async fetchFacilities(): Promise<EVisitorFacility[]> {
    await delay();
    return [
      { facilityCode: '0000022', name: 'Apartman Mock 1' },
      { facilityCode: '0000023', name: 'Apartman Mock 2' },
    ];
  }
}

function ok(): EVisitorResult {
  return { status: 'confirmed', retryable: false, messages: [] };
}

function fail(text: string, retryable: boolean): EVisitorResult {
  return {
    status: 'failed',
    retryable,
    error: text,
    messages: [{ severity: 'error', text }],
  };
}

function delay(ms = 120): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
