import dotenv from 'dotenv';
import path from 'path';

// Load server/.env regardless of process cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const IS_PROD = process.env.NODE_ENV === 'production';

// The dev fallback is published in the repo, so anyone could mint a session token for any
// tenant — including platformRole 'admin'. It is a convenience for local work and must never
// be what a production deploy silently falls back to. Same rule as SECRETS_ENC_KEY in
// utils/crypto.ts: a guessable secret is not a secret.
function sessionSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (IS_PROD) {
    throw new Error(
      'JWT_SECRET must be set in production — sessions signed with the dev fallback can be forged (openssl rand -hex 32).',
    );
  }
  return 'dev-secret-visitors-local-only';
}

// COOKIE_SECURE=false means the session cookie is sent over plain HTTP. In production that is
// never a legitimate choice, and it is exactly what a .env copied from .env.example used to
// carry — so refuse to start rather than silently serve an unprotected session. Off in dev by
// default, where there is no TLS to be secure over.
function cookieSecure(): boolean {
  const configured = process.env.COOKIE_SECURE;
  if (IS_PROD && configured === 'false') {
    throw new Error(
      'COOKIE_SECURE=false is not allowed in production — the session cookie would travel over plain HTTP. Remove it or set it to true.',
    );
  }
  return configured ? configured === 'true' : IS_PROD;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: IS_PROD,
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwtSecret: sessionSecret(),
  cookieSecure: cookieSecure(),
  fiscalProvider: process.env.FISCAL_PROVIDER ?? 'mock',
  fiscalTestUrl:
    process.env.FISCAL_TEST_URL ?? 'https://cistest.apis-it.hr:8449/FiskalizacijaServiceTest',
  fiscalProdUrl:
    process.env.FISCAL_PROD_URL ?? 'https://cis.porezna-uprava.hr:8449/FiskalizacijaService',
  // The v2.7 spec prints XML-DSig algorithm URIs that do not exist in the W3C registry
  // (see fiscal/sign.ts). We emit the standard ones; set this if the service rejects them.
  fiscalXmldsigSpecUris: process.env.FISCAL_XMLDSIG_SPEC_URIS === 'true',
  // How often the fiscal retry queue is drained (minutes). "Naknadna dostava" has a legal
  // deadline (platform_settings.fiscal_retry_deadline_hours), so this must be well below it.
  fiscalQueueIntervalMin: Number(process.env.FISCAL_QUEUE_INTERVAL_MIN ?? 5),
  evisitorProvider: process.env.EVISITOR_PROVIDER ?? 'mock',
  // Per-tenant credentials may override the base URL; these are the defaults each
  // `environment` resolves to. Note the test API lives on /testApi — www.evisitor.hr/test
  // is the test *web app*, not its API.
  evisitorTestUrl: process.env.EVISITOR_TEST_URL ?? 'https://www.evisitor.hr/testApi',
  evisitorProdUrl: process.env.EVISITOR_PROD_URL ?? 'https://www.evisitor.hr/eVisitorRhetos_API',
  // 32 bytes, hex (openssl rand -hex 32). Encrypts everything we must read back: eVisitor
  // credentials and the fiscal signing certificate. EVISITOR_ENC_KEY is the old name and
  // still works, so existing .env files keep running.
  secretsEncKey: process.env.SECRETS_ENC_KEY ?? process.env.EVISITOR_ENC_KEY ?? '',
  evisitorQueueIntervalMin: Number(process.env.EVISITOR_QUEUE_INTERVAL_MIN ?? 5),
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'visitors_dev',
  },
} as const;

export const AUTH_COOKIE = 'visitors_session';
