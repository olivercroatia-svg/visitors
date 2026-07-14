import { env } from '../config/env';
import { MockOcrProvider } from './mock.provider';
import { AnthropicOcrProvider } from './anthropic.provider';
import type { DocumentOcrProvider } from './types';

// Same shape as getFiscalProvider(): the provider is chosen once, by env, and cached. Adding a
// different OCR backend later means adding an adapter here, not touching any caller.
let cached: DocumentOcrProvider | null = null;

export function getOcrProvider(): DocumentOcrProvider {
  if (cached) return cached;
  cached = env.ocrProvider === 'anthropic' ? new AnthropicOcrProvider() : new MockOcrProvider();
  return cached;
}

export * from './types';
