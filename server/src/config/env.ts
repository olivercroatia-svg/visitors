import dotenv from 'dotenv';
import path from 'path';

// Load server/.env regardless of process cwd
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwtSecret: required('JWT_SECRET', 'dev-secret-visitors-local-only'),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  fiscalProvider: process.env.FISCAL_PROVIDER ?? 'mock',
  evisitorProvider: process.env.EVISITOR_PROVIDER ?? 'mock',
  // Per-tenant credentials may override the base URL; these are the defaults each
  // `environment` resolves to. Note the test API lives on /testApi — www.evisitor.hr/test
  // is the test *web app*, not its API.
  evisitorTestUrl: process.env.EVISITOR_TEST_URL ?? 'https://www.evisitor.hr/testApi',
  evisitorProdUrl: process.env.EVISITOR_PROD_URL ?? 'https://www.evisitor.hr/eVisitorRhetos_API',
  // 32 bytes, hex (openssl rand -hex 32). Encrypts eVisitor credentials at rest.
  evisitorEncKey: process.env.EVISITOR_ENC_KEY ?? '',
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
