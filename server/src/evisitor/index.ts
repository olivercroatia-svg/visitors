import { env } from '../config/env';
import { HttpProvider } from './http.provider';
import { MockProvider } from './mock.provider';
import type { EVisitorProvider } from './types';

let provider: EVisitorProvider | null = null;

// Factory — same shape as getFiscalProvider(), except the provider carries no identity:
// eVisitor credentials are per tenant, so they are passed into every call instead.
export function getEVisitorProvider(): EVisitorProvider {
  if (provider) return provider;
  switch (env.evisitorProvider) {
    case 'http':
      provider = new HttpProvider();
      break;
    case 'mock':
    default:
      provider = new MockProvider();
  }
  return provider;
}

export * from './types';
