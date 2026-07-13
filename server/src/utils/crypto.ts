import crypto from 'crypto';
import { env } from '../config/env';

// AES-256-GCM for secrets we must be able to read back — eVisitor passwords and the
// fiscal signing certificate — unlike user passwords, which stay bcrypt-hashed and are
// never decrypted.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // GCM standard
export const KEY_VERSION = 1;

let cachedKey: Buffer | null = null;
let warnedAboutDerivedKey = false;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = env.secretsEncKey.trim();
  if (/^[0-9a-fA-F]{64}$/.test(configured)) {
    cachedKey = Buffer.from(configured, 'hex');
    return cachedKey;
  }

  // Never silently protect real secrets with a guessable key. The derived dev key is only
  // acceptable while BOTH integrations are mocked — the moment either one talks to a real
  // system, the data at rest is a real credential or a real signing certificate.
  const talkingToRealSystem = env.evisitorProvider !== 'mock' || env.fiscalProvider !== 'mock';
  if (env.isProd || talkingToRealSystem) {
    throw new Error(
      'SECRETS_ENC_KEY must be 64 hex characters (openssl rand -hex 32) to store eVisitor credentials and the fiscal certificate.',
    );
  }

  if (!warnedAboutDerivedKey) {
    console.warn(
      '[crypto] SECRETS_ENC_KEY is not set — deriving a dev-only key from JWT_SECRET. Mock providers only.',
    );
    warnedAboutDerivedKey = true;
  }
  // Seed string is deliberately unchanged from when this only guarded eVisitor secrets:
  // changing it would silently invalidate everything already encrypted with the dev key.
  cachedKey = crypto.createHash('sha256').update(`visitors-evisitor-dev:${env.jwtSecret}`).digest();
  return cachedKey;
}

export interface EncryptedSecret {
  ct: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encryptSecret(plain: string): EncryptedSecret {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, resolveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { ct, iv, tag: cipher.getAuthTag() };
}

export function decryptSecret(ct: Buffer, iv: Buffer, tag: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, resolveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
