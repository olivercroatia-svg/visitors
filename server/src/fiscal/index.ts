import { env } from '../config/env';
import { MockProvider } from './mock.provider';
import type { FiscalizationProvider } from './types';

let provider: FiscalizationProvider | null = null;

// Factory — swap the concrete provider here (mock now; a real provider adapter
// is added in Phase 5 without touching any caller).
export function getFiscalProvider(): FiscalizationProvider {
  if (provider) return provider;
  switch (env.fiscalProvider) {
    case 'mock':
    default:
      provider = new MockProvider();
  }
  return provider;
}

export * from './types';
