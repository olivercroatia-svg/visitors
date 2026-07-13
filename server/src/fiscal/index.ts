import { env } from '../config/env';
import { FinaProvider } from './fina.provider';
import { MockProvider } from './mock.provider';
import type { FiscalizationProvider } from './types';

let provider: FiscalizationProvider | null = null;

// Factory — `fina` talks to the tax authority's CIS directly; `mock` keeps development
// and the whole invoice flow working without a certificate.
export function getFiscalProvider(): FiscalizationProvider {
  if (provider) return provider;
  switch (env.fiscalProvider) {
    case 'fina':
      provider = new FinaProvider();
      break;
    case 'mock':
    default:
      provider = new MockProvider();
  }
  return provider;
}

export * from './types';
